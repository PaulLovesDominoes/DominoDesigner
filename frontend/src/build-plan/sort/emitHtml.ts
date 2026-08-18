import { escapeHtml, legendHtml, planDocument } from "../html";
import type { PlanModel } from "../model";
import { pageGeometry } from "../paper";
import type { SortRow } from "./encode";
import type { SortPlanOptions } from "./object-model";

/**
 * Turning the encoded rows into a printable document.
 *
 * Unlike the layout, this document cannot work out its own pages in advance: a
 * row's runs wrap to a number of lines that depends on the font, the paper and
 * the words themselves. So the pages are **measured**, by a short script that
 * runs once the document is parsed — it moves whole row blocks into fixed-height
 * pages, starting a new one as soon as the next block would not fit.
 *
 * Measuring at parse time is safe because the document uses system fonts only.
 * Nothing loads late, so nothing reflows after the measurements are taken.
 */

/** Renders one row as `Row 7: White(x14) - Khaki(x1) || White(x5)`. */
function rowHtml(row: SortRow): string {
  const text = row.batches
    .map((batch) =>
      batch
        .map((run) => `${escapeHtml(run.label)}(x${run.count})`)
        .join(" - "),
    )
    .join(" || ");

  return `<div class="row" data-row="${row.number}"><span class="rowNo">Row ${row.number}:</span> ${text}</div>`;
}

/**
 * Distributes the row blocks into pages and numbers every page.
 *
 * A row block is never split across a page. The one case that cannot honour
 * that is a row too long to fit on an empty page at all, which is given a page
 * that grows instead: the browser then breaks it across sheets by itself, which
 * is worse than not splitting it but much better than clipping it away.
 */
const PAGINATE_SCRIPT = `
(function () {
  var flow = document.getElementById("flow");
  if (!flow) return;

  // The rows start in an off-screen holding pen so they can be measured at the
  // width they will really be laid out at. That means any failure in here would
  // otherwise leave a document showing its legend and nothing else — which is
  // exactly what a mismatched id once did. Pagination is a nicety; the plan is
  // not, so anything going wrong falls back to showing the rows unpaginated.
  function reveal(error) {
    if (!flow.parentNode) document.body.appendChild(flow);
    flow.removeAttribute("id");
    if (error && window.console) console.error(error);
  }

  var pagesEl = document.getElementById("pages");
  if (!pagesEl) {
    reveal(null);
    return;
  }

  try {
    paginate(pagesEl, flow);
  } catch (error) {
    reveal(error);
  }

  function paginate(pagesEl, flow) {
    var blocks = [].slice.call(flow.children);
    var planName = flow.getAttribute("data-plan-name") || "";
    flow.parentNode.removeChild(flow);

    function makePage() {
      var page = document.createElement("section");
      page.className = "page";
      var header = document.createElement("div");
      header.className = "pageHeader";
      header.innerHTML =
        '<span class="planName"></span><span class="pageLabel"></span>';
      header.firstChild.textContent = planName;
      var body = document.createElement("div");
      body.className = "pageBody";
      page.appendChild(header);
      page.appendChild(body);
      pagesEl.appendChild(page);
      return body;
    }

    var body = makePage();
    for (var i = 0; i < blocks.length; i++) {
      body.appendChild(blocks[i]);
      // One pixel of slack: sub-pixel rounding otherwise reports an overflow on
      // a block that fits exactly.
      if (body.scrollHeight > body.clientHeight + 1) {
        if (body.children.length === 1) {
          body.parentNode.className = "page pageOverflow";
          body = makePage();
        } else {
          body.removeChild(blocks[i]);
          body = makePage();
          body.appendChild(blocks[i]);
        }
      }
    }

    // An empty trailing page happens whenever the last block exactly filled its
    // own; it would print as a blank sheet.
    var last = pagesEl.lastElementChild;
    if (last) {
      var lastBody = last.querySelector(".pageBody");
      if (lastBody && lastBody.children.length === 0) pagesEl.removeChild(last);
    }

    var pages = pagesEl.querySelectorAll(".page");
    for (var p = 0; p < pages.length; p++) {
      var label = pages[p].querySelector(".pageLabel");
      if (!label) continue;
      var rows = pages[p].querySelectorAll(".row");
      var text = "Page " + (p + 1) + " of " + pages.length;
      if (rows.length > 0) {
        text +=
          " — Rows " +
          rows[0].getAttribute("data-row") +
          "-" +
          rows[rows.length - 1].getAttribute("data-row");
      }
      label.textContent = text;
    }
  }
})();
`;

export function emitSortHtml(
  model: PlanModel,
  options: SortPlanOptions,
  rows: SortRow[],
): string {
  const geometry = pageGeometry(options.paper, options.orientation);
  const name = model.ddObjectName;

  const batchNote = options.batching
    ? `<div class="note">Batches of ${options.batchSize} are separated by <code>||</code> — one template load each. A gap counts as a slot.</div>`
    : "";

  const legendPage =
    `<section class="page">` +
    `<div class="pageHeader"><span class="planName">${escapeHtml(name)}</span>` +
    `<span class="pageLabel"></span></div>` +
    `<div class="pageBody">${legendHtml(model)}${batchNote}</div>` +
    `</section>`;

  return planDocument({
    title: `Sort Plan — ${name}`,
    geometry,
    styles: `
      /* A column layout is what lets .pageBody take the remaining height, which
         is what the paginating script measures against. */
      .page { display: flex; flex-direction: column; }
      .pageBody { flex: 1; min-height: 0; overflow: hidden; }
      /* Only for a row too tall for any page: let it run on and be broken by the
         browser rather than clipped away. */
      .pageOverflow { height: auto; min-height: ${geometry.heightMm}mm; }
      .pageOverflow .pageBody { overflow: visible; }
      .row {
        margin-bottom: 2.5mm;
        font-size: 10pt;
        line-height: 1.45;
        break-inside: avoid;
      }
      .rowNo { font-weight: 700; }
      .note { margin-top: 5mm; font-size: 9pt; color: #333; }
      #flow { position: absolute; left: -10000mm; top: 0; }
    `,
    body:
      legendPage +
      `<div id="flow" data-plan-name="${escapeHtml(name)}">${rows
        .map(rowHtml)
        .join("")}</div>`,
    script: { name: "sortPlanPagination.js", code: PAGINATE_SCRIPT },
  });
}