import { useCallback, useState } from "react";

import { downloadTextFile } from "../download";
import { useStore } from "../store";
import { encodeInventoryCsv, parseInventoryCsv, type InventoryImportProblem } from "./inventoryCsv";
import { sortInventoryEntries } from "./object-model";

/**
 * The two CSV buttons' behaviour, kept out of DominoInventoryScreen so that
 * screen stays a layout file — the same split Toolbar.tsx makes with the tool
 * groups it hosts.
 *
 * Uploading is deliberately a look-then-agree flow: the file is picked and read
 * in full, and what it would do is spelled out with real numbers, before
 * anything is replaced. That is only possible because inventoryCsv.ts works out
 * the whole new inventory without touching the store.
 */

/** Everything ConfirmDialog needs except onCancel, which the screen supplies. */
export interface InventoryCsvPrompt {
  message: string;
  confirmLabel?: string;
  cancelLabel: string;
  onConfirm?: () => void;
}

/** How many problems of one kind to name before summarising the rest. */
const MAX_LISTED_PROBLEMS = 8;

export function useInventoryCsv() {
  const [prompt, setPrompt] = useState<InventoryCsvPrompt | null>(null);
  const dismissPrompt = useCallback(() => setPrompt(null), []);

  const downloadInventoryCsv = useCallback(() => {
    const state = useStore.getState();
    // Written in the order the table is showing, so the file matches what the
    // user is looking at rather than whatever order the store happens to hold.
    const ordered = sortInventoryEntries(
      state.inventoryEntries,
      state.inventorySortColumn,
      state.inventorySortDirection,
    );
    // Reached straight from the click, which is the only time a browser trusts
    // a download it did not start itself.
    downloadTextFile(
      encodeInventoryCsv(ordered),
      "Domino Inventory.csv",
      "text/csv;charset=utf-8",
    );
  }, []);

  const uploadInventoryCsv = useCallback(async () => {
    const file = await pickCsvFile();
    if (!file) return;

    let text: string;
    try {
      text = await readTextFile(file);
    } catch (error) {
      setPrompt(acknowledge(error instanceof Error ? error.message : `Could not read ${file.name}.`));
      return;
    }

    const existing = useStore.getState().inventoryEntries;
    const result = parseInventoryCsv(text, existing);

    if (result.fatal) {
      setPrompt(acknowledge(`${result.fatal}\n\nNothing has been changed.`));
      return;
    }

    setPrompt({
      message: describeImport(file.name, existing.length, result),
      confirmLabel: "Replace",
      cancelLabel: "Cancel",
      onConfirm: () => {
        useStore.getState().replaceInventory(result.entries, result.nextInventoryNumber);
        setPrompt(null);
      },
    });
  }, []);

  return { prompt, dismissPrompt, uploadInventoryCsv, downloadInventoryCsv };
}

/**
 * The one-button form, for telling the user something they can only say OK to.
 * Leaving confirmLabel and onConfirm out is what ConfirmDialog reads as
 * acknowledge-only.
 */
function acknowledge(message: string): InventoryCsvPrompt {
  return { message, cancelLabel: "OK" };
}

/**
 * What the upload is about to do, in as many words as it takes.
 *
 * The id sentence is the one that matters and is why this is spelled out at all:
 * a colour keeping its id keeps every domino already painted with it, and a
 * colour that does not is a colour those dominoes lose.
 */
function describeImport(
  fileName: string,
  existingCount: number,
  result: ReturnType<typeof parseInventoryCsv>,
): string {
  const arriving = result.entries.length;
  const parts: string[] = [
    `Replace ${count(existingCount, "inventory entry", "inventory entries")} with ` +
      `${count(arriving, "color", "colors")} from ${fileName}?`,
  ];

  if (result.preservedCount > 0) {
    parts.push(
      `${count(result.preservedCount, "color keeps", "colors keep")} an existing ID, so ` +
        `dominoes already painted with ${result.preservedCount === 1 ? "it" : "them"} are ` +
        `unaffected.` +
        (result.newCount > 0 ? ` ${count(result.newCount, "color is", "colors are")} new.` : ""),
    );
  } else {
    parts.push(
      "No color in that file matches one you have now, so any domino already painted loses " +
        "its color.",
    );
  }

  // Said as one figure rather than a line per row, because a file of names and
  // counts with no colors at all is an ordinary thing to upload — the whole
  // point of allowing it — and a hundred identical notes would bury everything
  // else in this dialog.
  if (result.defaultedColorCount > 0) {
    parts.push(
      `${count(result.defaultedColorCount, "color has", "colors have")} no color value. ` +
        `${result.defaultedColorCount === 1 ? "It comes in grey" : "They come in grey"} and ` +
        `switched off, so ${result.defaultedColorCount === 1 ? "it is" : "they are"} not ` +
        `offered for painting until you pick a color and tick Active.`,
    );
  }

  const skipped = listProblems(result.skipped, "row was skipped", "rows were skipped");
  if (skipped) parts.push(skipped);

  const repaired = listProblems(result.repairs, "value was adjusted", "values were adjusted");
  if (repaired) parts.push(repaired);

  parts.push("This cannot be undone.");
  return parts.join("\n\n");
}

/** A heading and the problems under it, or null when there were none. */
function listProblems(
  problems: readonly InventoryImportProblem[],
  singular: string,
  plural: string,
): string | null {
  if (problems.length === 0) return null;
  const lines = [`${count(problems.length, singular, plural)}:`];
  for (const problem of problems.slice(0, MAX_LISTED_PROBLEMS)) {
    lines.push(`    Row ${problem.row}: ${problem.message}`);
  }
  const remaining = problems.length - MAX_LISTED_PROBLEMS;
  if (remaining > 0) lines.push(`    …and ${remaining} more`);
  return lines.join("\n");
}

const count = (n: number, singular: string, plural: string): string =>
  `${n} ${n === 1 ? singular : plural}`;

/**
 * Asks for a CSV file, resolving to null if the picker is dismissed.
 *
 * The same detached-input trick image-map/assetStore.ts uses for pictures, and
 * with the same caveat: some browsers fire no event at all for a dismissed
 * picker, so a cancelled pick simply leaves this promise pending and the input
 * to be collected. Nothing is waiting on it but the caller, which stops on null
 * anyway.
 *
 * There is no server involved — the FastAPI app only serves the built frontend —
 * so "uploading" means reading the file into memory in this tab.
 */
function pickCsvFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    // Both, because the picker filters by name on some systems and by declared
    // type on others, and a .csv saved by a spreadsheet may carry either.
    input.accept = ".csv,text/csv";
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.click();
  });
}

/** Reads a picked file as UTF-8 text. Any byte-order mark is parseCsv's problem. */
function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(file);
  });
}