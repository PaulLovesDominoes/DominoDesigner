# CLAUDE.md — image mapping

Guidance for `frontend/src/image-map/` (and its `patch-sample/` registry). The repo-root
`CLAUDE.md` covers the app's shared conventions; everything specific to laying a picture over an
element and turning its colours into domino colours lives here.

The two sibling registries a mapping run uses have their own files, because a session working in
either one would not load this: **`color-distance/CLAUDE.md`** (how near two colours are) and
**`dither/CLAUDE.md`** (what colour gets asked about). `image-map/ditherAmplitude.ts` sits at the
seam between them and is documented in the dither one.

`image-map/` lays a picture over an element. It does **two jobs, and only one of them is a mode** —
which is the distinction the whole folder is organised around, and the one a fresh session is most
likely to collapse back.

- **Showing a picture** is an ordinary overlay of domino editing mode. Every tool keeps working over
  it. This is *tracing paper*: a sponsor's logo laid under the grid, drawn by hand with the shape
  gestures and the paint brushes. It is switched on and off from the toolbar's image button, and it
  is not a mode at all.
- **Mapping its colours** (`imageMapActive`) is a mode. The toolbar's other buttons go `disabled`
  (not hidden, so the user can see what was switched off and where it comes back), the swatches stop
  painting (they choose the run's palette instead — see *Which colours a run may use*), and
  `DominoEditor` gives up its catch plane and its keyboard, keeping only the mode outline.

**The two were one thing, and splitting them was the point of the change.** While the picture only
existed inside the mapping mode, its best use was impossible: showing it meant giving up every tool
that could trace it. If a future change re-ties drawing to `imageMapActive`, that capability goes
with it. The display gates (`modeller.tsx`, `underlay.ts`) therefore test only "is this element
being edited, and does it have a picture it is showing" — no mode is involved, deliberately.

Third-party consequence worth knowing, since it looks like a bug the first time: `underlay.ts`
squashes *unpainted* dominoes so a `"below"` picture draws in front of them, and that now happens
during ordinary editing. It is only a matter of height — the footprint is untouched, so clicking,
rubber-banding and shape-selecting reach a squashed domino exactly as before.

There are now **two** image sub-modes, and they are not alike:

| | What it is | Owns canvas drags? | Exclusive with |
|---|---|---|---|
| `imageMapActive` | the Map Image Colors sidebar | no | armed shape, armed brush |
| `imageTransformActive` | Resize and Move — handles on the picture | **yes** | armed shape, armed brush |

**They deliberately coexist with each other**, since nudging the picture while the mapping panel is
up is exactly what a user wants. Neither is a `ToolId`, for the reason `dominoShapeSelectId` and
`dominoBrushId` are not: `activeTool` is already held by `"editDominoes"` for the whole mode. The
exclusions are each slice's setter clearing the others' fields — an importless cross-slice write,
since `set` is typed against the whole `AppState`.

**`imageTransformActive` is *entered* only from the menu, and that is load-bearing rather than a UI
preference.** `ImageTransformTool` used to keep a canvas-wide plane up at all times, waiting for a
click on the picture. `DominoEditor` has a plane of its own covering the same area at the same
height, and whichever of two such planes sits nearer the camera swallows every press for both — so
the two could never be mounted together, and that is the whole reason the picture could only be
shown in a mode where dominoes could not be edited. With no click-to-enter this tool has nothing to
listen for until the mode is already on, so the two simply take turns: `DominoEditor` mounts its
plane unless either image sub-mode is on, `ImageTransformTool` mounts its own only while Resize and
Move is. **Do not re-add clicking the picture to enter the mode.** It would bring the permanent
plane back and undo the split.

**Clicking *away* to leave is a different thing and is safe**, which is why it exists. That plane
(`DISMISS_Z`, below the move plane and the grips) is mounted only for as long as the mode is, so it
is never up at the same time as `DominoEditor`'s. It works only because `beginDrag` calls
`e.stopPropagation()` — R3F hands a press to *every* mesh the ray passes through unless something
stops it, so without that line a press on a grip would dismiss the mode as well.

Entering Resize and Move also sets `visible: true` — there is no positioning what you cannot see,
and `visible` records no undo entry so it costs nothing.

**Expand is the one tool left enabled** while colours are being mapped, and that is deliberate
rather than an oversight. It changes only how big a domino is *drawn*, which helps line a picture up
against the grid, and a mapping run reads the type's raw `dominoExpansion` rather than
`resolveDominoExpansion` — so what a run paints is identical with the toggle on or off. Keep that
split, or the toggle silently becomes a document-state control. The image button is exempt too, but
for a different reason: transparency and layer are the controls a user reaches for *most* while
lining a picture up.

## The toolbar control and the sidebar

`image-map/ImageOverlayButton.tsx` is the button plus its menu, sitting where the old
image-mapping toggle sat (right of Expand, in `DominoEditingTools`'s fixed group). Points worth not
reversing:

- **Two buttons, not one.** The icon acts — load a picture, or show and hide the one already there —
  and the caret opens the menu. They cannot nest, since `.iconBtn` is itself a `<button>`; they are
  siblings sharing a wrapper, as `DominoColorPanel`'s swatch and caret are. `DominoBrushButton` has
  one button because there the whole thing opens the menu.
- **The popup is `role="group"`, not `role="menu"`.** A menu's children are supposed to be menu
  items and the inline transparency slider is not one. The slider is also why the popup does not
  close on every interaction — commands close it, the slider does not, which needs no special
  handling since dragging inside the popup never reaches the backdrop.
- **Only New Image is available with nothing loaded.** There is nothing else to do to a picture that
  isn't there.
- **Reset Size** is the only way back from an edge grip, which stretches the picture out of shape
  (only a corner grip holds the proportions). It re-runs `coverPlacement` for the size and keeps the
  picture's **centre**, not its stored `x`/`y` — that is the lower-left corner, so growing out of it
  would shift the picture across the field, and "reset the size" should move nothing. It records
  *after* applying, unlike the delete and replace paths, because the same picture is live on both
  sides (see `recordImageMapChange`). It also brings the picture on screen, as entering Resize and
  Move does — and **both sides of the recorded pair are built from that on-screen record**, not from
  the record as it stands. Recording a hidden original against a visible result would push an entry
  whose only real difference is visibility, and undoing it would appear to do nothing, since undo
  forces any record it writes on screen. Comparing like with like also means a picture already at
  this size records nothing whether it was hidden or not.
- It claims **Escape in the capture phase while open**, so dismissing the menu never also runs
  `DominoEditor`'s ladder or leaves Resize and Move. Same answer `DominoBrushButton` uses.
- Its caret width override lives in `Toolbar.module.css` as `.iconBtnCaretOnly`, **not** in the
  component's own module — the same bundle-order argument recorded at `.iconBtnWithCaret`.

`ImageMapPanel` is correspondingly narrowed to *choosing colours*: its old four-button toolbar and
its transparency slider moved to the menu, it is titled "Map Image Colors", and it carries an `[X]`
that leaves the mode. `ModeHintBar` gains a matching `Close Image Mapping` button at its left, split
off from Done/Cancel by a rule — without the separation the three read as equals and it is far too
easy to press Cancel meaning "close this panel" and discard the whole session.

`Ctrl+I` shows or hides the picture, or asks for one when the element has none. It lives in
`DesignerScreen`'s single Ctrl-chord dispatcher like every other chord, gated on `dominoEditingId`
*before* `preventDefault` so the browser keeps its own behaviour outside the mode. It tests
`!e.shiftKey`, since `key` is lowercased there and Ctrl+Shift+I opens the developer tools, and it
carries the typing guard the rest of that handler does without — unlike the other chords it can fire
with the pointer in the mapping sidebar, which does hold form controls.

## Where the picture lives, and why it isn't the boundary box

A record's rectangle is stored in mm **relative to the element's `dominoLayoutAnchor`**
(`object-types/base.ts`), never to its `position` or its `bounds()`. Dragging a field's west or
south handle moves `position` while the anchor model deliberately keeps every existing domino where
it is, recomputing their parent-relative coordinates to compensate — so a picture stored against the
box would slide out of registration with the very dominoes it exists to be matched against. A type
declaring no anchor falls back to its `bounds()` corner, which is right for a type whose box and
grid are the same thing; `image-map/object-model.ts`'s `imageOriginFor` is the one place that
fallback lives, and the modeller, the transform tool and the mapping all read it, so the picture
drawn, the picture dragged and the picture sampled cannot be three different rectangles.

The rectangle is free to go negative and to extend past the element — a picture may hang off the
element and off the build plane both, which is what forced the `minZoom` change under *three.js /
R3F boundary*.

## The "below" layer squashes unpainted dominoes

`layer: "below"` means *above the unpainted dominoes, below the coloured ones*. Every domino is the
same height, so no single height for the picture does both. `image-map/underlay.ts`'s
`resolveUnpaintedTopZ` squashes the unpainted ones instead, and it costs nothing visually: the
camera is orthographic and top-down, so a shorter domino covers exactly the same pixels, and the
only thing that changes is which of them the picture ends up in front of. The picture is
`transparent` with `depthWrite={false}` and `depthTest` on — opaque geometry draws first, so a
full-height painted domino writes depth nearer than the plane and hides it, while a squashed one
does not. No stencil, no draw-order trickery.

`resolveUnpaintedTopZ` is imperative for the same reason `dominoes/expansion.ts`'s resolver is —
subscribe to the values it reads and call it, never call it inside a selector. It is also the one
thing about images that `dominoes/modeller.tsx`, the shared drawing half for every element type,
knows about; keep the signature a plain id in and a number out.

## Which colours a run may use

`imageMapColorScope` (`"all" | "selected"`) plus `imageMapExcludedColorIds` narrow a run's palette
to swatches the user ticks. `image-map/ImageColorScopeBar.tsx` is the Use Colors dropdown and its
Select All/None, a third sidebar sibling between `ImageMapPanel` and `DominoColorPanel`; on
`"selected"` the swatch panel's buttons become tick boxes. Six things are load-bearing:

- **`image-map/palette.ts`'s `imageMapPaletteEntries` is the single answer both consumers read** —
  `ImageMapPanel`, which greys Map Colors out on an empty palette, and `startColorMapping`, which
  hands the result to `prepare`. The same one-answer-both-consumers-read idiom as
  `dominoes/expansion.ts`, and for the same reason: a greyed-out button and an empty run must not
  disagree about why. It filters `active` too, so a palette that looks non-empty there can never
  come out empty inside `prepare`.
- **Membership is stored as the colours turned *off*.** An empty record means "every colour", which
  needs no initialisation — the slice cannot read `inventoryEntries` while building its own initial
  state — and a colour added to the inventory later starts out included. The positive set would need
  either an init step (fighting the decision that picks are *remembered* across mode entries) or a
  `null`-means-all sentinel, which is two encodings of one state.
- **The narrowing happens before `prepare`, never inside it.** See `color-distance/CLAUDE.md`:
  it composes with Greyscale's own filter, and `resolveDitherAmplitude` measures the narrowed
  palette for free, which is the wanted behaviour — three chosen colours must dither as three.
- **Both fields are settings, not session state**, and `setImageMapActive` deliberately does not
  touch either — unlike `imageMapTargets`, which is re-frozen on every entry.
- **The two special swatches are dropped whenever `imageMapActive`**, via `dominoSwatches`'
  `includeSpecials` parameter rather than a filter in the panel's JSX. Neither means anything to a
  palette, and their absence is also what lets the panel treat every swatch it draws in that mode as
  an inventory entry (the one `as InventoryEntryId` cast in `DominoColorPanel`).
- **Ticked swatches are never dimmed.** The `.inert` dim belongs to scope *All* only; `.noCaret` was
  split out of it because both mapping states draw a swatch with no caret and so need its closed-up
  right edge, while only one of them may hide the colour the user is choosing between. A tick sits
  inside the swatch alongside the accent ring, because the ring alone says "ticked" only by contrast
  with its neighbours, and fails when all or none are ticked.

`Ctrl+A` means the palette inside the mode (`DesignerScreen`'s one Ctrl-chord dispatcher). Selecting
every domino there would light the field up with boxes no tool can act on — `setImageMapActive`
clears the selection on the way in precisely because nothing in the mode uses it.

## The patch-sample registry

`image-map/patch-sample/` decides how the patch of picture a domino covers is reduced to the one
colour the metric is asked about — `average`, `dominant`, `dominantMerged`. Same four-part accessor
shape as `color-distance/` and `dither/`, with what variants share in its own module:
`patchBounds.ts` (the clamp-and-round every caller runs first, so no variant range-checks anything)
and `buckets.ts` (the bucketing, tally and chosen-bucket re-average the two dominant variants share).

**It lives under `image-map/` rather than at the top level beside the other two**, and that is the
distinction to preserve: a colour metric and a dither are ideas about colour that would mean
something without a picture, where reducing a rectangle of pixels means nothing without one.

**Average and dominant are not better and worse — they are for the two kinds of picture, and each
is visibly wrong on the other's.** `average` is right for photographs. The dominant pair is right
for flat artwork, because anti-aliasing puts a fringe of blended pixels along every edge, and a patch
straddling one averages to a colour that exists in neither region it separates — the mapping then
faithfully finds the nearest inventory colour to a shade that was never in the picture, which is
where the ring of yellow dominoes between an orange region and a white one comes from. The same
thing happens with no anti-aliasing at all wherever an edge falls part-way across a domino. Run
`dominant` on a photograph, though, and no bucket holds a real majority, so the winner is close to
arbitrary and neighbours jump about. Neither behaviour is a defect to be smoothed away.

Four implementation points worth not reversing:

- **The dominant variants count *buckets*, not colours.** Counting exact RGB values cannot work:
  along an anti-aliased edge every pixel is a different blend, so everything ties at one vote. Five
  bits per channel (a step of 8) is coarse enough that a region's pixels land together despite JPEG
  noise and fine enough that two visibly different colours never share a bucket.
- **They then re-average the winning bucket's own pixels** rather than returning the bucket's
  centre. The buckets are for *counting*; quantising the answer to a step of 8 per channel is enough
  to push a borderline domino onto the wrong inventory colour.
- **The scratch tables are module-level and cleared by walking only the buckets used**, never
  reallocated and never wholly cleared. 32768 entries rebuilt or zeroed per domino would cost more
  than the entire rest of the run. Shared mutable scratch is safe here for the same reason
  `dominoes/modeller.tsx`'s scratch matrix is: one patch is processed start to finish before the
  next begins, on one thread. `releaseTally` is the promise that every array is all zeroes again
  before the next patch, and a variant with scratch of its own (`dominantMerged`) clears it over the
  same used-bucket list before calling it.
- **`dominantMerged` exists because a fixed grid splits piles that land on its edges**, and that
  was a reported bug rather than a hypothetical: a stray domino or two in the middle of a flat band,
  landing somewhere different each time the picture was nudged. A region whose colour sits on a
  boundary has its pixels halved between two buckets and a smaller, better-centred pile wins. It
  joins buckets that are **both occupied and adjacent** (all 26 neighbours, since brightness noise
  moves all three channels together) into groups and takes the heaviest group. Two properties make
  that safe where a blur would not be: an empty bucket never joins anything, so two piles with a gap
  between them stay apart; and adjacent buckets differ by 8–14 out of 255, far below what any
  inventory distinguishes. **Overlapping votes — each pixel voting for a 3×3×3 neighbourhood — is
  the more obvious fix and is worse**: 27 increments per pixel instead of one, and it smears across
  24 bytes whether or not anything is there to join.

**Mapping the whole picture first and downscaling afterwards is the obvious-looking alternative and
is wrong**, so it is worth recording why before someone re-proposes it: it would destroy the
dithering. The dither pattern's whole purpose is to be at *domino* resolution, and applying it per
pixel and then reducing averages it away to noise — so the dither has to come after the reduction,
and the pipeline cannot be reordered. It is also the same computation done more expensively (a
full-resolution intermediate and millions of nearest-colour lookups instead of tens of thousands),
and it would need a quantised colour cache to be fast at all, which is most of the bucketing
machinery again with an extra pass bolted on.

## Mapping

`image-map/mapping.ts` is a chunked job driven from an animation frame in the slice, reusing the
**paint-stroke idiom verbatim**: write live so the field visibly fills in, record once, as a single
`"dominoColors"` operation. Cancel feeds the before-map back through `commitDominoColors` — not
straight into the column — so the revert re-syncs colour memory, exactly as `cancelDominoStroke`
does.

**Which dominoes a run may colour is decided once, when the mode is switched on, and handed to
`createColorMappingJob` as an explicit list** — `imageMapTargets[parentId]`, a `Uint32Array` of the
indices whose `colorIds` were `0` at that moment. `mapping.ts` never inspects a colour and has no
eligibility rule of its own.

This replaced a rule that inferred eligibility per run — `colorId === 0`, *or* the domino still held
exactly what the previous run left (a `lastMappedColors` map). That worked, and the reasons it was
dropped are worth recording, because it is the more obvious design and would be re-proposed:

- It compares against a *moving* target once dithering exists, since a dithered and an undithered
  run of the same picture give the same domino different colours.
- Freezing the set states the user's intent rather than inferring it: *these* are the dominoes on
  offer. Anything hand-painted is excluded structurally — it was not blank at capture — instead of
  by a colour comparison that happens to fail.
- It gives leaving and re-entering the mode a meaning: the fresh capture excludes what was just
  mapped, so a toggle **commits** a result. There was no way to express that before.

Four consequences, each load-bearing:

- **`imageMapTargets` is written only on entry and never cleared on exit.** `imageMapActive` is set
  `false` from five places (its own setter, `exitDominoEditing`, and the cross-slice writes in
  `shape-select` and `paint-brush` that enforce the three-way exclusion), and a field needing to be
  cleared in all five will eventually be missed in one. A stale entry is unreachable while the mode
  is off and is overwritten on the next entry. Only `discardImageMapSession` drops it — from
  `cancelDominoEditing` and from `initImageMapPruning`, where the element's whole session is over.
  Note `clearImageMap` (DEL on the picture) deliberately does *not*: the target set belongs to the
  session, not to the picture.
- **`colorIds[i] === 0` needs no masking**, the same property the swatch menus rely on: a hidden
  domino is at least `HIDDEN_COLOR_FLAG` and a painted one is a small `numericId`, so one equality
  excludes both.
- **A run clears its whole target set to `0` before mapping into it**, folded into the same
  `before` map the chunks write to, so the clear and the mapping land in one undo entry. Not
  redundant with the mapping overwriting each domino: a run leaves a domino alone where the picture
  does not reach or is transparent, so without the clear, moving the picture and mapping again would
  strand the previous result outside the new footprint. `clearMappedColors` (the panel's Clear) is
  the same write on its own.
- **A domino's patch comes from `getDominoExpansion`**, the type's own statement of how much room
  each domino owns, via `dominoes/footprint.ts`'s `dominoFootprintHalfExtents`. For a field that is half
  the spacing on each side, which makes the patch exactly
  one pitch in each axis — note `thickness` goes with X and `width` with Y, matching `pitchX`/
  `pitchY`, which is the part that would be easy to get backwards. So the patches tile the grid
  exactly in millimetres and the whole scan visits each source pixel about once. (`resolvePatchBounds`
  then rounds *outward* to whole pixels, so neighbouring patches share up to one pixel row and column
  at each seam. That is the right way round — a gap would silently lose pixels — and it is negligible
  until the picture is low-resolution relative to the field, since the decoder only ever downscales.
  At a couple of pixels per domino a patch is mostly its neighbours, which hurts the dominant
  samplers far more than the average.) Reading the whole patch rather than the single pixel at its
  centre is what stops a detailed picture turning into speckle; *how* it is read is the patch-sample
  registry's business, not this file's.

**How many dominoes a run will fill is told to the user up front**, because neither reason it can be
zero is visible on the screen: a field of coloured dominoes looks perfectly mappable, and a picture
parked off to one side looks fine too. Without it the first sign of trouble was pressing Map Colors
and watching nothing happen. Three parts:

- `image-map/coverage.ts`'s `makeDominoUnderImageTest` builds the "does the picture reach this
  domino" test once and then answers it in a few comparisons per domino. It shares
  `dominoFootprintHalfExtents` with `mapping.ts` **specifically so the count and the run cannot disagree
  about what the picture covers** — a count that contradicted the button would be worse than none.
  (That helper lived here, as `dominoPatchHalfExtents`, until *Build plans* needed the same answer.
  It is not about pictures — it is "how much build plane does a domino own" — so it moved to
  `dominoes/footprint.ts`, where a third consumer can reach it without importing from `image-map/`.)
  The **geometry is exact**, and it is worth knowing why rather than assuming it is approximate:
  `resolvePatchBounds` decides a patch misses the picture *before* it rounds outward to whole
  pixels, and that decision, with the mm-to-pixel factors cancelled, is literally this overlap test.
  The rounding picks which pixels a reaching patch reads, never which dominoes it reaches.
  **Transparency is the one thing this does not know about**, and it is not an edge effect: a
  sampler returns null below `MIN_OPAQUE_FRACTION`, so artwork on a transparent background covers
  far more dominoes by rectangle than a run actually colours. Closing that gap means summing alpha
  over the whole pixel buffer, which is affordable once but not while the picture is being dragged —
  hence a deliberate limit rather than an oversight.
- `setImageMapActive(true)` counts as it walks the dominoes to build `imageMapTargets`, and sets
  `imageMapEntryWarning` — `"all-colored"` or `"no-dominoes"`, told apart because they need
  different advice. Decided on entry and **only** on entry: a modal appearing mid-drag would be its
  own kind of awful. **Closing its dialog leaves the mode**, which is why the flag needs no clearing
  action of its own: with nothing to map, every control in the panel is pointless, and leaving is
  the fix in both cases since coming back takes a fresh target list.
- The panel's `{n} Unassigned Dominoes (?)` counts the **frozen target set** narrowed to what the
  picture reaches, never the colours the dominoes currently hold. A live count would drop to nothing
  the moment a run finished and read as though the tool had stopped working. That is also why its
  `useMemo` needs no subscription to the domino data's version: inside this mode the ordinary tools
  are off and the element cannot be resized, so of the three things it reads only the picture moves.
  It is **shown only when some dominoes under the picture are *not* on the list** — over a field
  with nothing coloured in yet the number would only restate what the user can see, and the `(?)`
  would answer a question nobody had. Hence the memo returns `reachable` and `skipped` rather than
  one figure, and walks all the dominoes rather than only the targets.

`colorMappingProgress` is written **only when a run is about to schedule another chunk**, never at
the start. A run finishing in one frame then shows no bar, which is honest; setting it up front
could not have worked anyway, since React coalesces the `0` and the `null` after it into one render
and the bar was never committed at all for a short run.

## What is undoable about a picture, and what isn't

The line is **document state versus view aid**, and it is drawn deliberately:

- **Undoable**, as one `"imageMap"` operation: move, resize, reset size, add, delete, and replace.
- **Not undoable**: show/hide, transparency, layer. These are glances, like the Expand toggle.
  Ctrl+I in particular is a rapid toggle, and filling the undo stack with it would bury the edits
  worth taking back.

**An image operation lives only as long as the domino editing session that made it.**
`exitDominoEditing` filters `kind === "imageMap"` off both stacks, and they are gone for good. The
rule behind that is worth stating on its own, because it is new and it generalises: **the
consequence of an undo or a redo must always be visible.** A picture is only ever drawn inside
domino editing mode, so an operation surviving past it could only ever be undone invisibly. Pulling
entries out of the middle of the stacks is safe because an image operation touches nothing but
`imageMaps`, which no other kind reads. It is also what lets the pruner free the megabytes held by
every picture deleted or replaced during the session — that memory is kept alive *by* those entries,
and only by them. (Note the barrier can't be one of the entries removed: it is captured on entry,
and this purge means no image operation is ever on the stack at that moment.)

**The same rule is enforced from the other side, inside `undo`/`redo`**, because a picture can be on
the element and still not on the screen — hidden, or wound to fully transparent. Two halves, and
both are needed:

- `revealBeforeApplying` — if the element's picture is currently invisible, that press brings it
  into view and does nothing else, leaving the operation where it is. One press, one visible change,
  the same rule the Escape ladder follows. This covers *add → hide → Ctrl+Z*.
- `imageMapsWith` forces any record it writes on screen. This covers what the first half cannot:
  undoing the delete of an invisible picture, where there is no current record left to reveal.

`image-map/visibility.ts` holds both tests plus `DEFAULT_IMAGE_OPACITY`, and **is its own module for
one specific reason**: the history slice needs them as *values*, and `object-model.ts` value-imports
`object-types/registry`, an edge that leads back towards `store.ts`. `visibility.ts` imports nothing
but a type, so it is safe to reach from anywhere. Note the transparency test is a literal
`opacity > 0` with no margin — a picture at 1% is faint but genuinely on screen, and a threshold
would quietly overwrite a setting the user chose.

One operation variant covers all five undoable cases — a null `before` is an add, a null `after` a
delete, two records set is a move/resize or a replacement. Splitting them by kind costs an extra
kind for the replacement, which is neither an add nor a delete but both at once.

`cancelDominoEditing` still discards the picture along with the colour edits, while
`exitDominoEditing` (Done) keeps it, so re-entering finds it where it was left.

**Two things about recording are load-bearing and easy to get backwards.**

- **`recordImageMapChange` must be called BEFORE applying a change that drops or replaces a
  picture** — backwards from every other commit point in the app, which record afterwards.
  `initImageMapPruning` frees any decoded picture nothing points at, it runs synchronously on every
  store write, and an operation on the undo stack is one of the two things that counts as pointing
  at one. Clearing the record first leaves a gap, one store write long, in which the old picture is
  referenced by nothing at all — and the pruner takes exactly that moment to free its pixels, so the
  operation lands naming a picture that no longer exists and undoing it restores a blank. A plain
  move or resize is exempt and records afterwards, since both sides name the same live picture.
- **The no-op check is `imageMapRecordsEqual`, never `ddObjectsEqual`.** That helper compares by
  `JSON.stringify`, which is fine for a DDObject and quietly terrible here: a record carries `src`, a
  base64 copy of the original file, often megabytes, and a drag ends every time the mouse comes up.
  `imageMapRecordsEqual` compares the cheap fields first and only reaches `src` once they all match,
  where the two are nearly always the same string in memory anyway.

`ImageTransformTool` mounts four things — a click-away dismiss plane, the picture's move plane, its
grips, and a mid-drag `CATCH_SIZE` catch plane — **all only while Resize and Move is on**. The *one
catch plane, one gesture* rule holds structurally: `DominoEditor` mounts its plane unless an image
sub-mode is on, and this mounts its own only while one is. **Two things about the four are
load-bearing.** Their z order is what decides which one a press belongs to (dismiss below move below
grips, since the camera is top-down and R3F sorts hits by distance), and **`beginDrag`'s
`e.stopPropagation()` is what stops a press belonging to more than one of them.** Without it, R3F
dispatches to every mesh the ray hits: a grip press ran `beginDrag` twice, once for the grip and
again for the move plane underneath, which overwrote the drag with a move — so grips only worked
where they hung off the edge of the picture. That was a real bug, from removing the line on the
grounds that its only job was the plane that had just been deleted. `SelectionTool` has always
called it, which is why its handles have never had the problem.

`assetStore.ts` is a small store of its own, following `colorLookupStore.ts`'s precedent — a cache
*derived* from the data URL in the record, holding a `THREE.Texture` that must be `dispose()`d and a
pixel buffer of megabytes, neither of which belongs in copy-on-write state. It downscales to
`MAX_SAMPLE_DIM`, since even a 250×250 field needs only a handful of pixels per domino.

**It is keyed by the picture (`assetId`, minted `"IMG-{n}"`), not by the element showing it**, and
that is not a tidiness choice. Keyed by element there is room for exactly one decoded picture per
element, so loading a replacement had to throw the old one's pixels away — fine while nothing about
a picture was undoable, and wrong the moment replacing one became an undo entry, since Ctrl+Z would
restore a record with nothing left to draw. The record carries the id; `modeller.tsx` and
`startColorMapping` look up through it.

`initImageMapPruning` is consequently **the only thing that frees anything** — `clearImageMap`
deliberately disposes nothing, because the delete it performs is undoable. It does two jobs on two
keys: a *session* (the record plus its target set) goes when its element is absent from `ddObjects`
and unreachable via `isDDObjectInUndoHistory`, like `colorMemory` and unlike `selectionStore`, since
undoing a field delete must bring its picture back; a *decoded picture* goes when no live record and
no `"imageMap"` operation on either stack names its `assetId`. It watches `imageMaps` as well as
`ddObjects` and both stacks, and iterates the union of `imageMaps` and `imageMapTargets`, because an
element can hold a target set with no picture — the mode was switched on and nothing was loaded.
