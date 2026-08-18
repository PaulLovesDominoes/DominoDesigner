import type { PageGeometry } from "./paper";
import type { PlanModel } from "./model";

/**
 * The shell every printed build plan is poured into, and the one way a plan
 * reaches the screen.
 *
 * A plan is a whole standalone HTML document — its own `<style>`, no React, no
 * CSS modules, no fonts to fetch — opened in a new browser tab. The browser's
 * own print dialog then does the work a PDF library would otherwise have to be
 * taught: paper sizes, orientation, and Save as PDF.
 *
 * Three things about the printing are load-bearing:
 *
 *   - `print-color-adjust: exact`. Browsers drop background colours when
 *     printing unless asked not to. Without this every domino comes out white,
 *     which is the whole document gone. It is an inherited property, so setting
 *     it once at the top covers the page, the legend and the SVG inside.
 *   - `@page { margin: 0 }` with our own padding inside the page box. Left to
 *     itself the browser adds a margin of its own on top of ours, and every
 *     measurement the layout made would be wrong by that much.
 *   - `.page + .page { break-before: page }` rather than a break *after* every
 *     page. A break after the last page leaves a blank sheet at the end.
 */

/**
 * Escapes text that goes into the generated markup. Colour names and element
 * names are typed by the user, so a stray `&` or `<` would otherwise break the
 * document.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Trims trailing zeroes off a millimetre figure so the markup stays readable. */
export function mm(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function sharedStyles(geometry: PageGeometry): string {
  return `
    /* Inherited, so this one declaration covers everything below it. */
    html {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    /* System fonts only: nothing loads late, so the sort plan can measure its
       own layout as soon as the document is parsed. */
    body {
      margin: 0;
      background: #555;
      font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
      color: #000;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 10px 16px;
      background: #333;
      color: #eee;
      font-size: 14px;
    }
    .toolbar button {
      font: inherit;
      padding: 5px 14px;
      cursor: pointer;
      border: 1px solid #666;
      border-radius: 5px;
      background: #eee;
      color: #000;
    }
    .pages {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 16px 0;
    }
    .page {
      position: relative;
      box-sizing: border-box;
      width: ${mm(geometry.widthMm)}mm;
      height: ${mm(geometry.heightMm)}mm;
      padding: ${mm(geometry.marginMm)}mm;
      overflow: hidden;
      background: #fff;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
    }
    .pageHeader {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 3mm;
      font-size: 10pt;
    }
    .pageHeader .planName { font-weight: 600; }
    .pageHeader .pageLabel { color: #333; }
    .legend { border-collapse: collapse; font-size: 10pt; }
    .legend th, .legend td {
      padding: 1.2mm 3mm 1.2mm 0;
      text-align: left;
      vertical-align: middle;
    }
    .legend th { border-bottom: 1px solid #000; }
    .legend td.count { text-align: right; padding-right: 0; }
    .legend .chip {
      display: inline-block;
      width: 7mm;
      height: 5mm;
      border: 0.3mm solid #000;
      vertical-align: middle;
    }
    .legendTotals { margin-top: 4mm; font-size: 10pt; }
    h1 { font-size: 15pt; margin: 0 0 4mm; }

    @page {
      size: ${mm(geometry.widthMm)}mm ${mm(geometry.heightMm)}mm;
      margin: 0;
    }
    @media print {
      body { background: #fff; }
      .toolbar { display: none; }
      .pages { display: block; padding: 0; gap: 0; }
      .page { box-shadow: none; }
      /* A break *before* each page after the first, never after the last —
         a trailing break prints one blank sheet. */
      .page + .page { break-before: page; page-break-before: always; }
    }
  `;
}

/** Assembles the finished document. `body` goes inside `.pages`. */
export function planDocument(options: {
  title: string;
  geometry: PageGeometry;
  /** Document-specific CSS, appended after the shared rules. */
  styles?: string;
  body: string;
  /**
   * Runs once the document is parsed — the sort plan uses it to paginate.
   *
   * `name` is required alongside the code, and is what the browser's devtools
   * calls the script. A plan opens from a blob URL, so without a name an error
   * in here reads "77f30707-85d3-…:204" — an opaque id and a line counted from
   * the top of the whole generated page. Naming it here rather than in the
   * document that supplies the script is what stops the next scripted document
   * forgetting to.
   *
   * It cannot do better than a name: these scripts are template strings in the
   * emitting module rather than compiled output, so there is nothing for a
   * source map to point back at. Line N of a stack is line N of the string.
   */
  script?: { name: string; code: string };
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(options.title)}</title>
<style>${sharedStyles(options.geometry)}${options.styles ?? ""}</style>
</head>
<body>
<div class="toolbar">
  <button type="button" onclick="window.print()">Print</button>
  <span>${escapeHtml(options.title)}</span>
</div>
<div class="pages" id="pages">${options.body}</div>
${
  options.script
    ? `<script>${options.script.code}\n//# sourceURL=${options.script.name}</script>`
    : ""
}
</body>
</html>`;
}

/** The header line every page carries. */
export function pageHeaderHtml(planName: string, pageLabel: string): string {
  return `<div class="pageHeader"><span class="planName">${escapeHtml(
    planName,
  )}</span><span class="pageLabel">${escapeHtml(pageLabel)}</span></div>`;
}

/**
 * The colour legend, shared by both documents so a number always means the same
 * colour whichever plan a builder is holding.
 */
export function legendHtml(model: PlanModel): string {
  const rows = model.colors
    .map(
      (color) => `<tr>
        <td><span class="chip" style="background:${color.hex}"></span></td>
        <td>${color.number}</td>
        <td>${escapeHtml(color.name)}</td>
        <td class="count">${color.count}</td>
      </tr>`,
    )
    .join("");

  const skipLine =
    model.skipCount > 0
      ? `<div>Gaps (no domino): ${model.skipCount}</div>`
      : "";

  return `<h1>${escapeHtml(model.ddObjectName)} — Colors</h1>
    <table class="legend">
      <thead><tr><th></th><th>No.</th><th>Color</th><th class="count">Count</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="legendTotals">
      <div><strong>Total dominoes: ${model.totalDominoes}</strong></div>
      ${skipLine}
      <div>${model.rows} rows &times; ${model.cols} columns</div>
    </div>`;
}

const POPUP_BLOCKED_MESSAGE =
  "The plan could not be opened because this browser blocked the new tab. " +
  "Allow pop-ups for this site and try again.";

/**
 * Opens a finished document in a new tab. Returns null when that worked, or the
 * message to show when the browser's pop-up blocker refused it — the shape every
 * plan's `deliver` returns.
 *
 * Must be reached synchronously from the click that asked for it — a pop-up
 * blocker allows `window.open` only while it can still see the user gesture that
 * led there. Everything a plan needs is already in memory, so nothing here has
 * to wait on anything.
 *
 * A blob URL rather than writing into `about:blank`: the tab gets a real,
 * reloadable address and prints more predictably. The URL is released on a timer
 * rather than immediately, because releasing it before the new tab has finished
 * loading leaves that tab blank; holding one document string for a minute costs
 * nothing.
 */
export function openPlanTab(html: string): string | null {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const opened = window.open(url, "_blank");
  if (!opened) {
    URL.revokeObjectURL(url);
    return POPUP_BLOCKED_MESSAGE;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return null;
}