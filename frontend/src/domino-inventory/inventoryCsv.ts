import { csvRow, LINE_END, parseCsv, UTF8_BOM } from "../csv";
import { generateInventoryShortcut } from "./shortcuts";
import {
  BRAND_OPTIONS,
  FINISH_OPTIONS,
  MATERIAL_OPTIONS,
  NEW_ENTRY_COLOR,
  nextInventoryNumberFor,
  type InventoryBrand,
  type InventoryEntry,
  type InventoryEntryId,
  type InventoryFinish,
  type InventoryMaterial,
} from "./object-model";

/**
 * The inventory as a spreadsheet, both directions.
 *
 * A builder owns a particular set of dominoes, and a list of a few hundred
 * colours wants to be edited in a spreadsheet rather than a row at a time in the
 * app. So the inventory can be written out and read back in, and the two halves
 * share one column table here — which is what makes a downloaded file always
 * re-import cleanly.
 *
 * Pure and store-free: entries in, entries out. Nothing here reads or writes the
 * app store, so the whole translation can be worked out and shown to the user
 * before anything is replaced.
 */

// ---- Columns ----

/** Every field an uploaded row can set, in the order the file is written. */
type InventoryCsvField =
  | "id"
  | "active"
  | "available"
  | "colorName"
  | "color"
  | "material"
  | "finish"
  | "brand"
  | "shortcut"
  | "notes";

interface ColumnSpec {
  field: InventoryCsvField;
  /** What this column is called in a file this app writes. */
  header: string;
  /**
   * Every spelling accepted on the way in, already normalized. The written
   * `header` is normalized and accepted too, so it need not be repeated.
   */
  aliases: string[];
  required: boolean;
}

/**
 * Headers are matched with their case, spaces, underscores and hyphens removed,
 * so "Color Name", "color_name" and "COLOR-NAME" are one column and each alias
 * only has to be listed once in its collapsed form.
 */
function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[\s_-]+/g, "");
}

const COLUMNS: ColumnSpec[] = [
  // Written first so a re-imported file keeps its ids without the user having
  // to know the column exists; optional, because a file typed from scratch has
  // no ids to give (see resolveIds).
  { field: "id", header: "id", aliases: [], required: false },
  { field: "active", header: "active", aliases: [], required: false },
  { field: "available", header: "available", aliases: ["count"], required: true },
  { field: "colorName", header: "color name", aliases: ["name"], required: true },
  // Optional, and often genuinely absent: plenty of builders keep a list of
  // names and counts and have never written a hex value down. Such a row comes
  // in as DEFAULT_UPLOAD_COLOR, to be set with the app's own colour picker and
  // exported later.
  { field: "color", header: "color", aliases: ["colorvalue", "rgbcolor"], required: false },
  { field: "material", header: "material", aliases: [], required: false },
  { field: "finish", header: "finish", aliases: [], required: false },
  { field: "brand", header: "brand", aliases: ["manufacturer","man","mfg"], required: false },
  { field: "shortcut", header: "shortcut", aliases: [], required: false },
  { field: "notes", header: "notes", aliases: [], required: false },
];

// Defaults for the optional columns, from the upload spec. Material and finish
// differ from what the New button gives a hand-added row (which copies whatever
// is most common already) because an uploaded file has no such context to read.
const DEFAULT_MATERIAL: InventoryMaterial = "Plastic";
const DEFAULT_FINISH: InventoryFinish = "Standard";
const DEFAULT_BRAND: InventoryBrand = "Other";

/**
 * What a colour with no usable value becomes.
 *
 * Deliberately the *same* placeholder the New button gives a hand-added row,
 * rather than a second one of this module's own: a row that arrived without a
 * colour and a row created without one are in the same state — named, counted,
 * and waiting for someone to pick a colour — so they should look alike in the
 * table.
 */
const DEFAULT_UPLOAD_COLOR = NEW_ENTRY_COLOR;
/** How to refer to DEFAULT_UPLOAD_COLOR in a message, where a hex means little. */
const DEFAULT_UPLOAD_COLOR_AS_REPORTED = "grey";

// The cells' maxLength values in InventoryTable. A file may hold longer text
// than the UI would have let anyone type, so it is cut to fit and reported.
const MAX_COLOR_NAME_LENGTH = 20;
const MAX_SHORTCUT_LENGTH = 3;
const MAX_NOTES_LENGTH = 100;

// ---- Writing ----

/**
 * The inventory as CSV text, including each entry's "INV-{n}" id so that
 * re-uploading the file keeps every colour attached to the dominoes already
 * painted with it.
 *
 * `entries` is written in the order given — the screen passes the order the
 * table is currently sorted in, so the file matches what the user is looking at.
 */
export function encodeInventoryCsv(entries: readonly InventoryEntry[]): string {
  const lines = [csvRow(COLUMNS.map((column) => column.header))];
  for (const entry of entries) {
    lines.push(
      csvRow(
        COLUMNS.map((column) => {
          switch (column.field) {
            case "id":
              return entry.id;
            case "active":
              return entry.active ? "true" : "false";
            case "available":
              return String(entry.available);
            default:
              return entry[column.field];
          }
        }),
      ),
    );
  }
  return UTF8_BOM + lines.join(LINE_END) + LINE_END;
}

// ---- Reading ----

/** One thing that went wrong, named by the row it went wrong in. */
export interface InventoryImportProblem {
  /**
   * Which row of the file, counting the header as row 1 — the numbering a
   * spreadsheet shows down its left-hand side.
   */
  row: number;
  message: string;
}

export interface InventoryImport {
  /** The inventory to replace the current one with. Empty if `fatal` is set. */
  entries: InventoryEntry[];
  /** What the store's "INV-{n}" counter must become. See resolveIds. */
  nextInventoryNumber: number;
  /** Colours that came away holding an id an existing entry already had. */
  preservedCount: number;
  /** Colours that were given a freshly minted id. */
  newCount: number;
  /**
   * Colours that arrived with no usable colour value and so came in as
   * DEFAULT_UPLOAD_COLOR and inactive. Worth telling the user as one figure,
   * since a whole inventory of names and counts is a perfectly normal thing to
   * upload and the result would otherwise look broken.
   */
  defaultedColorCount: number;
  /** Rows that could not be used at all, and were left out. */
  skipped: InventoryImportProblem[];
  /** Values that were not usable as written and were adjusted to something that is. */
  repairs: InventoryImportProblem[];
  /** Set when the file could not be read as an inventory at all. */
  fatal?: string;
}

/** A row that survived parsing, before ids and shortcuts are settled. */
interface ParsedRow {
  row: number;
  colorName: string;
  color: string;
  /**
   * True when the file gave no usable colour and DEFAULT_UPLOAD_COLOR stood in.
   * Such a colour is a placeholder rather than a statement, so it is kept out of
   * the colour-matching id pass and counted for the summary.
   */
  colorWasDefaulted: boolean;
  available: number;
  active: boolean;
  material: InventoryMaterial;
  finish: InventoryFinish;
  brand: InventoryBrand;
  /** Uppercased and cut to length; "" means "make one up". */
  shortcut: string;
  notes: string;
  /** The number out of an "INV-{n}" or bare-number id column, if it held one. */
  explicitNumericId?: number;
}

/**
 * Reads an uploaded file into the inventory it describes.
 *
 * Nothing is applied here — the caller shows what came back and only replaces
 * the inventory once the user agrees, which is why the problems are returned
 * rather than thrown or logged. A row that cannot be used is left out of
 * `entries` and named in `skipped`; a single value that cannot be used as
 * written is adjusted and named in `repairs`.
 *
 * `existingEntries` is the inventory being replaced, read only to work out
 * which ids carry over.
 */
export function parseInventoryCsv(
  text: string,
  existingEntries: readonly InventoryEntry[],
): InventoryImport {
  const empty = (fatal: string): InventoryImport => ({
    entries: [],
    nextInventoryNumber: nextInventoryNumberFor(existingEntries),
    preservedCount: 0,
    newCount: 0,
    defaultedColorCount: 0,
    skipped: [],
    repairs: [],
    fatal,
  });

  const rows = parseCsv(text);
  const isBlank = (cells: string[]) => cells.every((cell) => cell.trim() === "");

  // Blank rows are allowed anywhere, including above the header.
  const headerIndex = rows.findIndex((cells) => !isBlank(cells));
  if (headerIndex === -1) return empty("That file is empty.");

  const skipped: InventoryImportProblem[] = [];
  const repairs: InventoryImportProblem[] = [];

  // ---- Header ----
  const columnIndex = new Map<InventoryCsvField, number>();
  rows[headerIndex].forEach((rawHeader, index) => {
    const normalized = normalizeHeader(rawHeader);
    // A blank header means a blank column: its cells are simply never read.
    if (normalized === "") return;
    const spec = COLUMNS.find(
      (column) =>
        normalizeHeader(column.header) === normalized || column.aliases.includes(normalized),
    );
    // A column this app knows nothing about is left alone rather than complained
    // about — a builder's own spreadsheet may well carry columns of their own.
    if (!spec) return;
    if (columnIndex.has(spec.field)) {
      repairs.push({
        row: headerIndex + 1,
        message: `two columns mean "${spec.header}" — the first was used`,
      });
      return;
    }
    columnIndex.set(spec.field, index);
  });

  const missing = COLUMNS.filter((column) => column.required && !columnIndex.has(column.field));
  if (missing.length > 0) {
    const names = missing.map((column) => `"${column.header}"`).join(", ");
    return empty(
      `That file has no ${names} column, so there is nothing to build an inventory from.`,
    );
  }

  // ---- Rows ----
  const parsedRows: ParsedRow[] = [];
  for (let index = headerIndex + 1; index < rows.length; index++) {
    const cells = rows[index];
    // A blank row is skipped without a word — spreadsheets produce them freely.
    if (isBlank(cells)) continue;

    const row = index + 1;
    const cellFor = (field: InventoryCsvField): string => {
      const at = columnIndex.get(field);
      return at === undefined ? "" : (cells[at] ?? "");
    };
    const repair = (message: string) => repairs.push({ row, message });

    // A colour name is what makes a row a row, so a blank one is the one thing
    // that costs it its place.
    let colorName = cellFor("colorName").trim();
    if (colorName === "") {
      skipped.push({ row, message: "no color name" });
      continue;
    }
    if (colorName.length > MAX_COLOR_NAME_LENGTH) {
      colorName = colorName.slice(0, MAX_COLOR_NAME_LENGTH);
      repair(`color name was too long, shortened to "${colorName}"`);
    }

    let notes = cellFor("notes");
    if (notes.length > MAX_NOTES_LENGTH) {
      notes = notes.slice(0, MAX_NOTES_LENGTH);
      repair("notes were too long and were shortened");
    }

    // Kept as written where it can be; a value the field cannot hold is
    // stripped down rather than refused, since a shortcut is only a
    // convenience and losing the whole row over one would be out of proportion.
    let shortcut = cellFor("shortcut").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (shortcut.length > MAX_SHORTCUT_LENGTH) shortcut = shortcut.slice(0, MAX_SHORTCUT_LENGTH);

    // A colour value is never worth losing a row over: the name and the count
    // are the part that had to be typed by hand, and a colour can be picked in
    // the app afterwards. A blank one is not even worth a word — a whole column
    // of them is an ordinary way to keep an inventory — so those are counted and
    // mentioned once. Something written but unreadable is a typo, so it is named.
    const rawColor = cellFor("color").trim();
    const parsedColor = rawColor === "" ? null : parseHexColor(rawColor);
    const colorWasDefaulted = parsedColor === null;
    if (colorWasDefaulted && rawColor !== "") {
      repair(
        `"${truncateForMessage(rawColor)}" is not a color, used ${DEFAULT_UPLOAD_COLOR_AS_REPORTED}`,
      );
    }

    parsedRows.push({
      row,
      colorName,
      color: parsedColor ?? DEFAULT_UPLOAD_COLOR,
      colorWasDefaulted,
      available: parseAvailable(cellFor("available"), repair),
      // A colour nobody has chosen yet must not be paintable — both the swatch
      // panel and the keyboard shortcuts offer active entries only — so a
      // defaulted colour comes in switched off whatever the file said, and is
      // switched back on by hand once its colour has been set.
      active: colorWasDefaulted ? false : parseActive(cellFor("active"), repair),
      material: parseOption(cellFor("material"), MATERIAL_OPTIONS, DEFAULT_MATERIAL, "material", repair),
      finish: parseOption(cellFor("finish"), FINISH_OPTIONS, DEFAULT_FINISH, "finish", repair),
      brand: parseOption(cellFor("brand"), BRAND_OPTIONS, DEFAULT_BRAND, "brand", repair),
      shortcut,
      notes,
      explicitNumericId: parseExplicitId(cellFor("id"), repair),
    });
  }

  if (parsedRows.length === 0) {
    return {
      ...empty("None of the rows in that file have a color name."),
      skipped,
      repairs,
    };
  }

  const numericIds = resolveIds(parsedRows, existingEntries);
  const shortcuts = resolveShortcuts(parsedRows, repairs);

  const existingNumericIds = new Set(existingEntries.map((entry) => entry.numericId));
  let preservedCount = 0;
  const entries = parsedRows.map((parsed, index) => {
    const numericId = numericIds[index];
    if (existingNumericIds.has(numericId)) preservedCount++;
    return {
      id: `INV-${numericId}` as InventoryEntryId,
      numericId,
      active: parsed.active,
      colorName: parsed.colorName,
      color: parsed.color,
      material: parsed.material,
      finish: parsed.finish,
      brand: parsed.brand,
      available: parsed.available,
      shortcut: shortcuts[index],
      notes: parsed.notes,
    } satisfies InventoryEntry;
  });

  return {
    entries,
    // One past the highest number in play on *either* side. A colour dropped by
    // this upload may still be referenced by dominoes on the build plane and by
    // dominoes/colorMemory.ts, so its number must never be handed to a
    // different colour later.
    nextInventoryNumber: nextInventoryNumberFor([...existingEntries, ...entries]),
    preservedCount,
    newCount: entries.length - preservedCount,
    defaultedColorCount: parsedRows.filter((parsed) => parsed.colorWasDefaulted).length,
    skipped,
    repairs,
  };
}

// ---- Id mapping ----

/**
 * Which "INV-{n}" number each row comes away with, one per row of `parsedRows`.
 *
 * A domino's colour is a live reference to an entry's numericId rather than a
 * copy of its RGB (see CLAUDE.md's "Domino data"), so an upload that minted
 * fresh numbers throughout would silently blank every painted domino. Carrying
 * the old numbers onto the rows that plainly mean the same colour is what keeps
 * a build intact across an edit made in a spreadsheet.
 *
 * The rules run as passes over the whole file rather than row by row, which is
 * what stops two rows claiming one old id: an id is spoken for the moment
 * anything takes it, and a later row that wanted it falls through to the pass
 * below.
 *
 *   1. a row that states an id keeps it;
 *   2. then a row matching an old entry's colour name takes that entry's id;
 *   3. then a row matching an old entry's colour takes that entry's id;
 *   4. anything left is given a new number.
 */
function resolveIds(
  parsedRows: readonly ParsedRow[],
  existingEntries: readonly InventoryEntry[],
): number[] {
  const numericIds: (number | undefined)[] = parsedRows.map(() => undefined);
  const claimed = new Set<number>();

  const claim = (index: number, numericId: number) => {
    numericIds[index] = numericId;
    claimed.add(numericId);
  };

  // Pass 1 — ids stated in the file.
  parsedRows.forEach((parsed, index) => {
    if (parsed.explicitNumericId === undefined) return;
    if (claimed.has(parsed.explicitNumericId)) return; // two rows named it; first wins
    claim(index, parsed.explicitNumericId);
  });

  // Passes 2 and 3 — matched against the inventory being replaced. Names are
  // compared without case or surrounding space, since a spreadsheet round trip
  // is where both differences come from.
  const byName = new Map<string, InventoryEntry>();
  const byColor = new Map<string, InventoryEntry>();
  for (const entry of existingEntries) {
    // First entry wins for each key, matching how the id passes above work.
    const nameKey = entry.colorName.trim().toLowerCase();
    if (!byName.has(nameKey)) byName.set(nameKey, entry);
    if (!byColor.has(entry.color)) byColor.set(entry.color, entry);
  }

  const matchPass = (keyOf: (parsed: ParsedRow) => string, lookup: Map<string, InventoryEntry>) => {
    parsedRows.forEach((parsed, index) => {
      if (numericIds[index] !== undefined) return;
      const match = lookup.get(keyOf(parsed));
      if (!match || claimed.has(match.numericId)) return;
      claim(index, match.numericId);
    });
  };
  matchPass((parsed) => parsed.colorName.trim().toLowerCase(), byName);
  // A defaulted colour is a placeholder, not a claim about what the colour is,
  // so it is given a key nothing can match rather than letting every colourless
  // row queue up for whichever old entry happens to be that placeholder shade.
  matchPass((parsed) => (parsed.colorWasDefaulted ? "" : parsed.color), byColor);

  // Pass 4 — new numbers, from above everything the old inventory used as well
  // as everything claimed here, for the reason nextInventoryNumber gives.
  let next = Math.max(
    nextInventoryNumberFor(existingEntries),
    ...[...claimed].map((numericId) => numericId + 1),
  );
  return numericIds.map((numericId) => numericId ?? next++);
}

// ---- Shortcuts ----

/**
 * The shortcut each row comes away with, one per row of `parsedRows`.
 *
 * Shortcuts stated in the file are claimed first, before any are made up, so a
 * generated one can never take a name a later row was about to use. A duplicate
 * is nudged aside rather than left alone: two colours sharing a shortcut leaves
 * the second unreachable from the keyboard, because a buffer matching two
 * entries never resolves to either.
 */
function resolveShortcuts(
  parsedRows: readonly ParsedRow[],
  repairs: InventoryImportProblem[],
): string[] {
  const shortcuts: string[] = parsedRows.map(() => "");
  const taken = new Set<string>();

  parsedRows.forEach((parsed, index) => {
    if (parsed.shortcut === "") return;
    if (!taken.has(parsed.shortcut)) {
      shortcuts[index] = parsed.shortcut;
      taken.add(parsed.shortcut);
      return;
    }
    const replacement = generateInventoryShortcut(parsed.colorName, taken);
    repairs.push({
      row: parsed.row,
      message:
        replacement === ""
          ? `shortcut "${parsed.shortcut}" is already used, and no free one was left`
          : `shortcut "${parsed.shortcut}" is already used, changed to "${replacement}"`,
    });
    shortcuts[index] = replacement;
    if (replacement !== "") taken.add(replacement);
  });

  parsedRows.forEach((parsed, index) => {
    if (shortcuts[index] !== "" || parsed.shortcut !== "") return;
    const generated = generateInventoryShortcut(parsed.colorName, taken);
    shortcuts[index] = generated;
    if (generated !== "") taken.add(generated);
  });

  return shortcuts;
}

// ---- Single values ----

/**
 * "#rrggbb" from whatever the file wrote, or null if it wrote nothing usable.
 *
 * Accepts the six-digit form with or without its "#", and the three-digit
 * shorthand where each digit stands for a doubled pair ("#f0c" is "#ff00cc") —
 * both turn up in hand-written files. The result is lowercase, which is the one
 * shape the rest of the app speaks.
 */
function parseHexColor(raw: string): string | null {
  const digits = raw.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(digits)) return `#${digits}`;
  if (/^[0-9a-f]{3}$/.test(digits)) {
    return `#${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`;
  }
  return null;
}

/**
 * A stock count. Blank is 0 without comment — an inventory row for a colour
 * none of which is on hand is a perfectly ordinary thing to write.
 */
function parseAvailable(raw: string, repair: (message: string) => void): number {
  const cleaned = raw.trim().replace(/[\s,]/g, "");
  if (cleaned === "") return 0;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) {
    repair(`available "${truncateForMessage(raw.trim())}" is not a count, used 0`);
    return 0;
  }
  return Math.floor(value);
}

const TRUE_WORDS = ["true", "yes", "y", "1", "active"];
const FALSE_WORDS = ["false", "no", "n", "0", "inactive"];

/** Whether the colour is one currently in use. Anything unclear counts as in use. */
function parseActive(raw: string, repair: (message: string) => void): boolean {
  const word = raw.trim().toLowerCase();
  if (word === "" || TRUE_WORDS.includes(word)) return true;
  if (FALSE_WORDS.includes(word)) return false;
  repair(`active "${truncateForMessage(raw.trim())}" is not a yes or no, used yes`);
  return true;
}

/**
 * One of a dropdown's options, matched without regard to case, and by the start
 * of the word as well as the whole of it — so "Lamp" finds "Lamping" and "Trans"
 * finds "Translucent". People abbreviate in their own spreadsheets, and a column
 * of shortened brand names is otherwise a column of "Other".
 *
 * A whole-word match is tried first and wins outright. That matters only if some
 * option ever becomes the start of another ("Standard" beside a later "Standard
 * Plus"), which no list does today — but by then the value written in every
 * existing file would suddenly be ambiguous, and it should keep meaning what it
 * has always meant.
 *
 * A start that fits more than one option is *not* guessed at. "S" is the start
 * of both Standard and Storm, and "L" of both Lamping and Lion, so choosing one
 * would quietly mislabel half an inventory; those become "Other" and say what
 * they were torn between. A value matching nothing becomes "Other" too — which
 * every one of the three lists carries, and is what lets a builder's own
 * vocabulary ("Bakelite", "Satin") come through as data rather than costing them
 * the whole row.
 */
function parseOption<T extends string>(
  raw: string,
  options: readonly T[],
  fallback: T,
  fieldLabel: string,
  repair: (message: string) => void,
): T {
  const written = raw.trim();
  if (written === "") return fallback;
  const wanted = written.toLowerCase();

  const whole = options.find((option) => option.toLowerCase() === wanted);
  if (whole) return whole;

  const started = options.filter((option) => option.toLowerCase().startsWith(wanted));
  if (started.length === 1) return started[0];

  const other = options.find((option) => option === "Other") ?? fallback;
  repair(
    started.length > 1
      ? `${fieldLabel} "${truncateForMessage(written)}" could be ` +
          `${orList(started)}, used ${other}`
      : `${fieldLabel} "${truncateForMessage(written)}" is not known, used ${other}`,
  );
  return other;
}

/** "Standard or Storm"; "Don, Dragon or Other" — for naming what a value could have been. */
function orList(values: readonly string[]): string {
  if (values.length <= 1) return values.join("");
  return `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`;
}

/**
 * The number out of an id column — "INV-7" as this app writes it, or a bare "7"
 * for anyone typing one in. Undefined means the row stated no id and should be
 * matched against the old inventory instead.
 */
function parseExplicitId(raw: string, repair: (message: string) => void): number | undefined {
  const written = raw.trim();
  if (written === "") return undefined;
  const match = /^(?:inv-)?(\d+)$/i.exec(written);
  const numericId = match ? Number(match[1]) : NaN;
  if (!Number.isInteger(numericId) || numericId < 1) {
    repair(`id "${truncateForMessage(written)}" is not an inventory id, matched by name instead`);
    return undefined;
  }
  return numericId;
}

/** Keeps a quoted value out of a message from running away with the dialog. */
function truncateForMessage(value: string): string {
  return value.length > 24 ? `${value.slice(0, 24)}…` : value;
}