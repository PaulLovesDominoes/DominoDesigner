# CLAUDE.md — build plans

Guidance for `frontend/src/build-plan/`. The repo-root `CLAUDE.md` covers the app's shared
conventions; everything specific to the documents a design has to become before it can be built
lives here.

`build-plan/` produces the documents a design has to become before it can be built. Two are
printed: the **Layout** (a picture of the element, one cell per domino, in colour, with a legend
number in each) and the **Sort Plan** (each row written as run-length runs of colour, for counting
dominoes into stacks in advance). Both are **template-aware** — a template is a comb 10–50 teeth
wide that a row is slotted into and slid into place, so both mark batch boundaries at the template
width, each with its own size setting since there is no reason sorting and setting up use the same
comb. The third, **Export CSV**, is the same layout as data rather than as paper, so a design can
be counted, re-ordered or priced somewhere else.

It follows the `object-types/` layout: `base.ts` (`BuildPlanDefinition<TOptions>` plus the
`AnyBuildPlanDefinition` erasure), `registry.ts` (`BUILD_PLANS` and its accessors), shared
`model.ts`/`planGrid.ts`/`paper.ts`/`html.ts`/`download.ts`, one folder per document, and
`appStoreSlice.ts`. **Adding a document is a folder plus one line in `BUILD_PLANS`** —
`DDObjectMenu` and `BuildPlanDialog` are driven off the map and neither names a plan.

## How a finished document reaches the user

A plan's `render` produces the document as a **string**, and `actionLabel`/`deliver` on the
definition say what to do with it: the dialog's primary button takes its wording from the first
and calls the second. That pair is what lets a plan be *saved* rather than *printed* with no
branch in `BuildPlanDialog` — the two ways of delivering one live in `html.ts`'s `openPlanTab` and
`download.ts`'s `downloadTextFile`, and a definition just names the one it wants. Three things
about it:

- **Both return `string | null`** — null having worked, or the message to show. The pop-up-blocked
  wording therefore sits beside `openPlanTab`, which is the only thing that can be blocked, rather
  than in the dialog, which no longer knows a tab is involved.
- **Both must be reached synchronously from the click**, and for the same reason: a browser
  allows `window.open`, and trusts a download, only while it can still see the user gesture. The
  whole path — build the model, paginate, emit, deliver — is synchronous by construction.
- **`downloadTextFile` clicks a link the user never sees**, an `<a download>` added to the
  document and removed again. That is the only way to save a file the app made up itself, short of
  the File System Access API, which not every browser has. Its object URL is revoked on the same
  60-second timer `openPlanTab` uses, and revoking early gives an empty file rather than a blank
  tab.

## It is HTML, and that is not a stopgap

A plan is a whole standalone document — its own `<style>`, no React, no CSS modules, no webfonts —
opened in a new tab from `html.ts`'s `openPlanTab`, and printed by the browser's own dialog, which
is also where the PDF comes from. That was chosen over a PDF library because the print engine
already knows paper sizes, orientation and Save-as-PDF, and a library would mean hand-rolling text
layout and colour fills to get back to where `@page` starts. Four things about it are load-bearing:

- **`print-color-adjust: exact`** (with the `-webkit-` prefix). Browsers drop background colours
  when printing unless asked not to, and without it every domino prints white — the whole document
  gone. It is an inherited property, so `html.ts` sets it once at the top.
- **`@page { margin: 0 }` with our own padding inside `.page`.** Left alone the browser adds a
  margin over ours and every measurement the pagination made is wrong by that much.
- **`.page + .page { break-before: page }`, never a break *after* every page.** A break after the
  last one prints a blank sheet.
- **`window.open` must be reached synchronously from the click.** A pop-up blocker only allows it
  while it can still see the gesture. Everything a plan needs is already in memory, so the whole
  path — build the model, paginate, emit, open — is synchronous by construction; a `false` return
  raises the acknowledge-only `ConfirmDialog`. The URL is a blob (a real, reloadable address, and
  it prints more predictably than writing into `about:blank`), released on a **timer** rather than
  at once — revoking before the new tab has loaded leaves it blank.
- **`planDocument`'s `script` is `{ name, code }`, and the name is not optional.** It becomes a
  `//# sourceURL=` comment, which is what gives the script its own entry in devtools. A plan opens
  from a blob URL, so without it an error reads `77f30707-85d3-…:204` — an opaque id and a line
  counted from the top of the whole generated page. It cannot do better than a name: these scripts
  are template strings in the emitting module rather than compiled output, so there is nothing for
  a source map to point back at. Requiring the name here rather than leaving each document to
  remember it is what stops the next scripted document shipping without one.

**The Layout is drawn as one inline SVG per page**, and that is the answer to "what about spirals
and rings", which would otherwise read as a reason to want PDF. SVG has the same vector primitives
(`path`, arcs, rotated `rect`, text on a path), the browser rasterises it at *printer* resolution,
and it survives Save-as-PDF as vectors. It also makes the thick division rules plain `<line>`
elements: drawn as cell *borders* they would shrink the cells they landed on and make the grid
uneven. What genuinely would not carry over to a non-grid type is page **cutting**, which assumes a
column range maps to a rectangle. That is honest future work.

**Each document is split into `paginate`/`encode` (pure geometry or data, no markup) and
`emitHtml`.** The split is inside each folder rather than on `BuildPlanDefinition`, because that is
where a second backend would go — a PDF writer would consume the same paginated geometry and sit
beside `emitHtml`, with the model, the pagination and the options untouched. Putting it on the
contract would add a second type parameter to every definition for no gain today.

## `model.ts` — where a DDObject becomes a plan

The one place that reads the domino columns, resolves colours, or decides which way up the page is,
so the two documents can never disagree about a colour number or a row number. It names no element
type. **Two existing sources answer two different questions, and keeping them apart is the point:**

- **`DominoData.positions` plus `dominoes/footprint.ts`'s `dominoFootprintHalfExtents`** answer
  *where a domino is drawn and how big*. The type's own modeller already wrote the positions, and
  the footprint is the room the type says each domino owns. **This is what makes the printed cell
  proportions match the canvas with no ratio computed anywhere** — a field's cell comes out about
  twice as tall as it is wide because that is what it measures. It must use the **raw**
  `getDominoExpansion` and never `resolveDominoExpansion`, which reports zeroes unless the Expand
  toggle is on; a printed plan cannot depend on a view toggle, the same rule a mapping run follows.
- **`dominoRowCol`** answers *what a domino is called* — row and column numbers on the page, where
  the division rules fall, and the order the sort plan walks in.

So a future spiral or ring type needs no new geometry code here. The one real gap is **rotation**:
`DominoData.orientations` is standing/sideways/flat with no angle, so a type whose dominoes turn
would need that column widened.

**Two flips happen in `model.ts` and nowhere else**, and getting either backwards mirrors both
documents: `planRow = maxRow - row`, because `fieldElement`'s row 0 is its *bottom* row and plan row
1 is the top one; and `planY = maxY - (posY + halfUp)`, because the build plane's Y grows up while a
printed page's grows down.

**Colour numbering is `compareColor`**, the inventory table's own Color-column comparator, reused
rather than reimplemented. An id with no live inventory entry resolves to Unassigned — deliberately
the same fallback `rgbById` misses into, so a plan can never show a colour the build plane doesn't.

**Unassigned prints as 0 and the real colours count up from 1**, so the numbers a builder actually
has to go and fetch start at 1. It is pulled out of the sort and listed first rather than left to
land among the greys, and when nothing is unassigned it is simply absent and the numbering starts at
1 with no gap.

**That is why `PlanDomino.colorIndex` and `PlanColor.number` are different things, and they must
stay different.** `colorIndex` is a position in `colors`; `number` is what gets printed. They were
one field until Unassigned took 0 — at which point 0 became a perfectly ordinary colour and could no
longer double as the "no domino here" sentinel. The sentinel is now **`-1`**, which can never be a
valid index. Two consequences worth keeping:

- **Nothing adds or subtracts one.** `colors[domino.colorIndex]` is the whole lookup; the old
  `colors[n - 1]` is gone from both emitters.
- **`sort/encode.ts` needed no parallel "is there a domino here" array** once the sentinel could be
  pre-filled into its grid — a position holding no domino and a hidden one are the same thing to a
  builder, and now the same value.

**That pre-filled grid is `planGrid.ts`'s `planColorIndexGrid`, and it is its own module rather
than a function in `model.ts` for a specific reason.** `model.ts` value-imports
`object-types/registry` and the domino stores, because building a plan means reading them, and
that drags a large part of the app in behind it. Laying an *already built* model out by row and
column needs none of that, and both `sort/encode.ts` and `csv/encode.ts` want it — so it sits in a
module whose only import is a type, which TypeScript erases entirely. Same reasoning as
`image-map/visibility.ts`. `PLAN_GAP` lives there with it, so the two encoders cannot disagree
about which value means "nothing here". (`layout/emitHtml.ts`'s `indexByRowCol` stays separate: it
holds whole `PlanDomino`s, which is a different payload, not a fourth copy of this.)

## Legibility drives capacity, not the other way round

The number in each cell is how a builder tells two near-identical colours apart while sorting and
checking, so it is **never dropped and never shrunk past reading size**. That inverts the obvious
design: the smallest readable cell is the *input* to how many dominoes fit on a page.
`resolveCapacity` starts from `MIN_NUMBER_FONT_MM` and works outward. Manual and Fit to Pages let
the user's numbers win and **warn** rather than silently overriding — the same tell-them-why tone as
`imageMapEntryWarning`. `resolveCapacity` is split out from `paginateLayout` because the options
dialog shows the cell size and page count live as the user types, and has no use for the page list.

**Automatic and Fit to Pages are one branch of `resolveCapacity`, not two, and merging them is
what let a page count be left blank.** They were always the same calculation; the only thing that
differs is where the two page counts come from. Automatic works both out — the fewest pages an
axis needs at the smallest legible cell — and Fit to Pages uses whichever the user typed and works
out the rest. So **a blank box means "size this axis to fit"**, both blank behaves *exactly* like
Paginate Automatically, and `pagesWide`/`pagesLong` are `number | null` starting at null. Two
details hold it together:

- **The legibility floor applies only when nothing was typed.** A page count the user asked for
  wins outright and the warning says when it will print too small; with both blank there is nobody
  to overrule, so the cell never drops below `minScale`. That one `if` is the whole of the old
  difference between the two modes.
- **The panel says so rather than leaving it to be discovered** — a hint line under the two boxes,
  and `placeholder="auto"` in each. What a blank axis actually came out as is in the summary,
  which re-paginates live.

**Automatic is then two steps, and the second one is the fix for a real bug.** Settle the page
count at the smallest legible cell — which is the fewest pages possible — then **grow the cell as
far as that same page count allows**, capped at `MAX_CELL_WIDTH_MM`. Both halves are load-bearing
and each without the other was wrong:

- **Without the growth step the grid stopped short of the right margin.** The scale stayed pinned at
  the legibility floor however much room was going spare, so there was *always* leftover width: 20%
  on Letter portrait, and 22% on Legal landscape for a field narrower than the page. It read as
  orientation-specific because a portrait page is narrow enough that the field usually fills it, and
  Legal landscape is the widest paper in the list.
- **Without the page-count guard the growth silently costs paper.** A one-sheet layout would become
  two with much larger dominoes, which nobody asked for.
- **`perPageUp` vs `perPageDown` is the whole mechanism.** Rounding a page's capacity *down* to a
  whole division is right when asking how much fits; rounding *up* is right when the page count is
  already settled and the question is how few dominoes a page may hold without adding one. Rounding
  down in that second place lets an extra page appear.
- **`MAX_CELL_WIDTH_MM = 8` applies in every mode.** Without it a 10 × 5 field on Letter printed
  19.6mm dominoes — a handful of giant squares with nothing gained.
- **`fitsAt`'s `FIT_EPS` is load-bearing and reads exactly like a fudge factor.** The growth step
  picks a scale at which *exactly* `neededCols` fill the width; `fitsAt` then divides the width back
  by that cell size, and floating point returns `59.999999999999996` rather than `60`. Flooring that
  loses a whole division, `perPageDown` drops from three majors to two, and a two-page layout prints
  on three — silently, and only for the fields that happen to land on a boundary. An 86-column field
  was the report that found it. `fieldElement`'s `GEOMETRY_EPS` exists for the same reason in
  `fitCount`; the slack is orders of magnitude smaller than any real difference in fit.

**A shape mismatch is not a bug and cannot be scaled away.** A near-square field on wide paper still
leaves a gap, because closing it would need a second page and the cell aspect ratio is fixed by the
element's real geometry. Portrait, or Fit to Pages, is the answer there — not a change to this rule.

Four more decisions in `layout/`:

- **Cell size is global, not per page.** Sizing each page to its own content would draw larger
  dominoes on the last, narrower column of pages, and taped-together sheets would not tile.
- **`pageCuts`'s `Math.max(step, …)`** is what keeps a page making progress when a division is
  wider than a page will hold: it carries one oversized division rather than taking zero columns
  forever.
- **Columns break on `Major` by default and rows on `Major or minor`.** A page ending part-way
  through a template means carrying a half-loaded template across a page turn, which is the friction
  batching exists to remove; a row is not a template, so the looser rule there just wastes less
  paper.
- **`EDGE_BLEED_MM` is subtracted from the page in `resolveCapacity` and added back in
  `emitHtml`.** An SVG stroke straddles the line it sits on, so the page-edge rules would lose their
  outer half off the side of the drawing; the bleed is room for that half. Both halves are needed —
  widening the drawing without shrinking the grid would push it past the margin.

**A division landing on a page edge draws its own weight, on all four edges.** The four edges used
to be one `<rect>` at `BORDER_RULE_MM`, so a template ending exactly at the edge of a sheet looked
like an ordinary border and gave no sign that it did not continue overleaf. All four rather than
only the trailing pair, because the right edge of one sheet and the left edge of the next are the
*same* boundary and have to match when the sheets are laid side by side.

**Paper size is an option rather than `@page { size: auto }`**, because fitting cells to an exact
page is arithmetic and `auto` leaves nothing to do it with.

**`pagination` is a three-way mode, not a boolean.** It was `autoCapacity: boolean` until Fit to
Pages arrived. Each mode reads one pair of fields (`rowsPerPage`/`colsPerPage`, or
`pagesWide`/`pagesLong`) and Automatic reads neither, so the panel **hides** the pair not in use
rather than disabling it — and what Automatic worked out appears in the summary, which is then the
only place those figures exist. Note only the Fit to Pages pair may be blank: Manual's counts are
what that mode *is*, so there is nothing for a blank one to fall back to.

**Fit to Pages fills each page, it does not spread the element evenly over them.** The requested
page counts decide the *cell size* — the fewest dominoes a page must hold to reach that count,
rounded up to a whole division — and then the pages are filled as far as that size and the break
rule allow, leftovers landing on the last page. Only one axis can bind the cell size, so an even
spread strands whatever room the other axis had: 86 dominoes over two pages came out 43/43 with
space for 64 on each. Filling gives 60/26 under a major break rule, or 64/22 under `Any`, and is
what a builder working left to right expects. It cannot overrun the request, because the scale
already guarantees at least `neededCols` fit and `neededCols` is a whole number of divisions, so
flooring what fits can only land on or above it — and it may well come *under* the request, which
is correct.

## The sort plan, and why its pages are measured

`encode.ts` is pure and paper-free; `emitHtml.ts` carries a short script that runs once the document
is parsed and moves **whole** row blocks into fixed-height pages. A row's runs wrap to a number of
lines nothing can predict in advance, so the pages are measured rather than computed — safe at parse
time only because the document uses **system fonts only** and so never reflows afterwards. A row too
tall for an empty page gets a page that grows (`pageOverflow`) and is broken by the browser, which
is worse than not splitting it and far better than clipping it away.

Four encoding decisions, all verified against the worked example in the original request:

- **Gaps are lowercase `skip(xN)`**, so scanning a column of counts never mistakes one for a colour
  named "Skip". A hidden domino and a position with no domino at all read the same, which is right:
  both are a tooth left empty.
- **Trailing gaps are trimmed, leading and interior ones kept.** The row simply stops; but someone
  loading a template has to know which teeth to leave empty.
- **A gap consumes a batch slot.** Boundaries count positions, not dominoes.
- **The batch counter resets at each row**, since a template is loaded one row at a time, and a run
  crossing a boundary is **cut with both halves keeping the colour name**.

## The CSV export

`csv/encode.ts` is the whole document — the layout grid with its rows and columns numbered from 1
at the upper left, the legend under it, then the totals. **There is no emit step beside it**,
unlike the other two: a CSV has no pages, so there is nothing to paginate and nothing to lay out.
For the same reason there is nothing to set, which is why `CsvPlanOptions` is empty and the panel
spends itself saying what the file will hold instead. Five decisions:

- **A gap is an empty cell, and it cannot be a `0`.** Unassigned took 0 as its legend number, so 0
  is an ordinary colour a builder has to leave blank on the floor. Empty also reads as a hole in a
  spreadsheet, which is what it is. Deliberately not the sort plan's `skip`, whose job — not
  mistaking a gap for a colour named "Skip" in a column of *text* — does not arise here.
- **The BOM is load-bearing for Excel only.** Without it Excel reads a `.csv` in the machine's
  local code page and the `×` in "34 rows × 86 columns", along with any accented colour name,
  comes out as rubbish. Everything else skips it silently. CRLF for the same audience.
- **`csvCell` quotes only when it has to** — a comma, quote or newline in the value. Colour names
  and the element's name are typed by the user, so all three turn up.
- **The legend carries a hex column the printed one does not.** On paper the swatch says it
  better than six characters could; in a spreadsheet there is no swatch.
- **The closing lines are each a single value in the first column**, matching the printed legend
  page's totals word for word — including the gaps line, which appears only when there are gaps.

## What is and isn't state

`buildPlanOptions` is **settings, not document state** — remembered globally rather than per
element, never undoable, exactly like image transparency and the Expand toggle. `BuildPlanDialog` is
a **true modal**, like `ConfirmDialog` and unlike `PropertiesDialog`: its scrim dims the canvas
(there is no live preview worth keeping bright), it swallows keydown in the capture phase so
`DesignerScreen`'s Ctrl chords and `DominoEditor`'s Delete cannot keep editing the element being
printed, and it is not draggable. It sits one z-index band below `ConfirmDialog` so the
pop-ups-are-blocked message it raises still lands on top of it.

**A CSV export is state in exactly the same sense the printed plans are: none.** It reads the
element and writes a file, so there is no undo entry and no operation kind — the same rule
recorded under *Current state and direction*.

**The menu items are gated on capability, never on type** — `getDominoRowCol(ddObject) !== undefined`
plus a non-zero domino count. The build plane declares neither and is excluded structurally rather
than by naming it, and a future element type is included the day it declares the same members. The
domino-count subscription reads a primitive, so it needs no `useShallow`. The menu is already
unreachable inside domino editing mode, since `Sidebar` swaps `DDObjectsPanel` out for
`DominoColorPanel`.
