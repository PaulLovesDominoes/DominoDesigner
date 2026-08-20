/**
 * Reading and writing CSV text.
 *
 * Neutral by design — it knows nothing about build plans or about the inventory,
 * only about the file format — so the two features that speak CSV cannot drift
 * apart about quoting, line endings or the byte-order mark. The writing half
 * started life inside build-plan/csv/encode.ts and moved here when the inventory
 * export needed exactly the same four pieces.
 */

/**
 * A leading marker that says the file is UTF-8.
 *
 * Excel otherwise reads a .csv in the machine's local code page, which turns the
 * multiplication sign in "34 rows x 86 columns" and any accented colour name
 * into rubbish. Every other spreadsheet skips it silently.
 */
export const UTF8_BOM = "﻿";

/**
 * CRLF, because that is what the CSV format says and what Excel is happiest
 * with. Everything else accepts it too.
 */
export const LINE_END = "\r\n";

/**
 * One value, quoted only if it has to be.
 *
 * Colour names and element names are typed by the user, so a comma or a quote
 * can turn up in one. Inside quotes, a quote is written twice — that is the
 * whole of CSV escaping.
 */
export function csvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export const csvRow = (cells: string[]): string => cells.map(csvCell).join(",");

/**
 * Reads CSV text into rows of cells — the exact inverse of `csvCell`/`csvRow`,
 * so anything this app writes reads back unchanged.
 *
 * Written by hand rather than pulled in as a dependency: the format is small,
 * and this is the app's only reader. It handles everything a spreadsheet can
 * produce:
 *
 * - a quoted field, which may hold commas, newlines and quotes of its own;
 * - a quote inside a quoted field, written twice ("" -> ");
 * - CRLF or bare LF line endings, mixed freely;
 * - a leading byte-order mark, which is stripped. Without that, a file this app
 *   exported reads its first header as "﻿id" and matches nothing.
 *
 * Every cell comes back as a string, untrimmed — what a value *means* is the
 * caller's business, and trimming here would quietly destroy a colour name the
 * user deliberately padded.
 */
export function parseCsv(text: string): string[][] {
  // The mark is only meaningful as the very first character of the file.
  const source = text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  // Inside a quoted field, a comma and a newline are ordinary characters rather
  // than separators — which is the whole reason this is a character loop and not
  // a pair of splits.
  let inQuotes = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (inQuotes) {
      if (ch !== '"') {
        cell += ch;
      } else if (source[i + 1] === '"') {
        // A doubled quote is one literal quote. Skipping the second one is what
        // stops it being read as the end of the field.
        cell += '"';
        i++;
      } else {
        inQuotes = false;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" || ch === "\n") {
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
      // CRLF is one line ending, not two, so step over the LF that follows a CR.
      if (ch === "\r" && source[i + 1] === "\n") i++;
    } else {
      cell += ch;
    }
  }

  // Whatever is still in hand belongs to a final row that had no line ending
  // after it. A file ending in a newline leaves nothing here, and must not gain
  // a phantom empty row — hence the test rather than an unconditional push.
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}