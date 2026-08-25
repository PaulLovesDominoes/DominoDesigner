
### Domino data

`frontend/src/dominoes/` holds the dominoes themselves, separately from the DDObject
hierarchy. It is **generic on purpose** — fields today, walls/towers/lines later — so it knows
nothing about grids, rows or spacing. The parent element decides where its dominoes go; the
subsystem stores them (`object-model.ts`/`store.ts`) and draws them (`modeller.tsx`).

`object-model.ts` defines `DominoData`, a **Structure of Arrays**: one flat typed array per
attribute (`positions` stride 3, `orientations` and `colorIds` stride 1), plus
`count`/`capacity`. That shape exists because it is what an `InstancedMesh` consumes and because
tens of thousands of dominoes must cost no per-object allocation. `generateDominoes(count)`
allocates and defaults them; `extent(data)` derives a footprint from the dominoes themselves,
which is how an element type *can* report a footprint without duplicating layout maths — though
no type does today, and `fieldElement`'s `bounds()` deliberately reports something else (its
boundary rectangle, which is not the dominoes' bounding box — see *The field's anchor model*).

**A domino's color is a live reference, not a copy.** `colorIds[i]` holds the `numericId` of a
domino-inventory `InventoryEntry` (`0` = unpainted). Nothing resolves that to actual RGB until
draw time, via `domino-inventory/colorLookupStore.ts`'s `rgbById` table — a plain array indexed
by `numericId`, rebuilt once whenever `inventoryEntries` changes (not per field, not per domino),
so `dominoes/modeller.tsx`'s copy effect never parses hex in its hot path, just indexes into it.
Three things fall out of this for free, with no extra code beyond the lookup table itself:
editing an inventory color's RGB immediately updates every domino painted with it; an undo/redo
entry recording "domino 4812 was color id 7" never drifts even if id 7's RGB changes later
(unlike a baked-in RGB snapshot would); and deleting an in-use inventory color immediately falls
back to `DEFAULT_DOMINO_COLOR` for every domino that referenced it, since `rgbById[deletedId]`
is simply `undefined` after the table rebuilds — the same fallback path the `0` sentinel already
uses, so no separate pruning subsystem was needed. `InventoryEntry` carries both `id`
("INV-{n}", for display/debugging/future persistence) and `numericId` (the same `{n}`, minted
together so they can't drift) specifically so nothing performance-sensitive ever parses the
string form.

**A painted domino must display the exact hex color it was assigned**, matching its inventory
swatch pixel-for-pixel — this took two coordinated fixes, both required together:
`dominoes/modeller.tsx`'s copy effect passes `THREE.SRGBColorSpace` explicitly to
`Color.setRGB(r, g, b, colorSpace)` when converting `rgbById`'s bytes (parsed straight off a
`"#rrggbb"` string by `color.ts`'s `hexToRgbBytes`, so they're sRGB) — omitting the colorSpace
argument makes three treat them as already being in its linear working space, so the renderer's
output conversion gamma-brightens them a second time, washing out dark colors hardest; and
`DesignerCanvas.tsx`'s `<Canvas>` is `flat` (`NoToneMapping`), because R3F's default
`ACESFilmicToneMapping` — built for physically-lit HDR scenes — still visibly shifts saturated
hues (most noticeably reds/oranges) even once the colorSpace fix is in place. This scene is
flat-shaded and unlit by design (no lights anywhere, `meshBasicMaterial` on every domino), so
tone mapping has no physical scene to compensate for and only introduces color error. Both are
load-bearing: dropping either one reintroduces a visible mismatch between a domino and its
inventory color.

**Hiding a domino is a flag over its `colorId`, not a column of its own.**
`HIDDEN_COLOR_FLAG` (`dominoes/object-model.ts`) is added to the id the domino will return to.
That choice is what makes hiding cost almost nothing: `commitDominoColors`, the clipboard,
`rowColPaste`, history's `dominoColors` undo/redo, `colorMemory`'s survival across a regenerate
and the mode's cancel snapshot all move `colorIds` around opaquely, so every one of them
supported hiding the day it landed with no changes. Three consequences are load-bearing:

- **Painting unhides, and there is no code that does it.** Every write path stores a raw
  `numericId` or `0`, both far below the flag, so assigning any color to a hidden domino clears
  the bit as a side effect. A hidden domino's low bits are therefore frozen — they are what it
  returns to, and only unhiding reveals them.
- **"Visible dominoes of color X" is plain equality on the raw value, and needs no masking** —
  a hidden value can never equal a small `numericId` or `0`. That is the whole implementation of
  the swatch menus' select-by-color skipping hidden dominoes (see *Domino color editing*).
  Don't "fix" those predicates by masking; it would silently reverse the behaviour.
- **Use arithmetic, never `|`/`&`.** JS bitwise operators coerce to signed int32. This flag sits
  below 2³¹ so `|` happens to work today, but a wider one would produce a negative that wraps
  into the `Uint32Array` and then compares false against the unsigned value read back, breaking
  `commitDominoColors`' "already this color" early-out.

**A hidden domino is drawn by discarding its pixels, not by shrinking it.** `dominoes/modeller.tsx`
gives the fill geometry an `aVisible` instanced attribute and patches `dominoFillMaterial`'s
fragment shader to `discard` when it is zero; the outline separately takes a zero `aScale` unless
the domino is selected, so a selected hidden domino keeps the white box that is the only way to
see what you are about to unhide. The alternative — collapsing the instance's *matrix* to zero
scale — is simpler and wrong: `Raycaster` is plain CPU JavaScript that reads `instanceMatrix` and
never sees a shader, so a discarded domino stays clickable while a zero-scaled one does not.
Worse, rubber-band selection reads `positions` directly and would keep working, so the failure
would be the confusing kind where drag-select finds dominoes that clicking cannot.

**A domino's `colorIds` entry survives a regenerate**, via `dominoes/colorMemory.ts`'s
`restoreDominoColors`, called once per regenerate (screen-switch remount, resize, undo/redo of
either — anything that makes a domino-producing type's modeller rebuild its `DominoData` from
scratch). Without it, every regenerate would silently wipe every domino back to unpainted, since
`generateDominoes()` always zero-fills `colorIds`. The mechanism is registry-driven, not
`fieldElement`-specific: a type opts in by declaring `dominoCellId(ddObject, flatIndex)`
(`object-types/base.ts`) — a **stable identifier for the domino at `flatIndex` that must not
depend on the parent's current physical size**. This is the load-bearing contract: a domino with
cell id `X` must refer to the same logical domino (e.g. the same `(row, col)`) no matter how many
rows/columns the parent currently has, or memory recorded at one size becomes meaningless — or
worse, silently wrong — when looked up at another size. `fieldElement` encodes `(row, col)`
*relative to its anchor* — `(row - originRow + CELL_ID_BIAS) * CELL_ID_MULT + (col - originCol +
CELL_ID_BIAS)`, the bias being there because `originRow`/`originCol` go negative once those edges
shrink past the anchor (see *The field's anchor model*). Only the *decode* from `flatIndex` to the
live `(row, col)` depends on the field's current `dominoes_per_row`; the anchor-relative meaning
laid over it never does, which is what makes an id survive a resize. A future spiral/rings type
must uphold the same contract for whatever coordinate scheme it uses — `restoreDominoColors`
itself never interprets a cell id, only uses it as an opaque `Map` key, so any stable scheme
works. `colorMemory.ts`'s store is keyed by `DDObjectId` and holds, per parent, a `colorByCell`
map plus the last `ddObject` snapshot seen (needed to decode the *previous* regenerate's flat
indices before they're overwritten). Cells that merely fall outside the currently-live range
(a shrink) are never deleted from `colorByCell` — which is also why a shrink followed by a later
grow, even in a wholly separate gesture or session, restores the old colors rather than
defaulting new cells to unpainted: nothing here scopes memory to a single "UndoEdit," by design.

`colorByCell` has a second writer besides `restoreDominoColors`'s regenerate-time absorb/restore:
`syncDominoColorMemory`, called from the three places that mutate a live `colorIds` array
directly without going through a regenerate — `commitDominoColors` (`dominoes/appStoreSlice.ts`'s shared write
path, covering the swatch paint, the unassign, hide/unhide, cut, and paste alike) and the
`"dominoColors"` cases of `undo()`/`redo()`. Routing every colour write through
`commitDominoColors` is what keeps that list at three even as the number of *writes* grows — the
unassign clear, then hide and unhide, were all added later and each inherited the sync for free,
which is exactly the property to preserve. This exists because
`restoreDominoColors`'s absorb step only ever *adds* entries (it records a cell's color when
absorbing it off the live array only if that color is nonzero, so a live color of `0` is treated
as "nothing to absorb," never as "clear this cell") — so on its own it could never learn that a
previously-painted cell had been explicitly reverted to unpainted by an undo. Without
`syncDominoColorMemory`, that stale nonzero entry survives in `colorByCell` until some later
regenerate reads it and repaints the cell, resurrecting a color the user had explicitly undone —
concretely: paint a field, undo the paint (colors correctly disappear, since that only touches
the live array), then delete the field and undo the delete (a regenerate, since the DDObject
remounts) — the field would come back wrongly recolored. `syncDominoColorMemory` closes this by
writing (or, for a revert to `0`, deleting) each affected cell's entry immediately, keeping
`colorByCell` a live mirror of "current colorId per painted cell," not just a lazily-absorbed
snapshot from the last regenerate.

Load-bearing conventions:

- **Nothing ever compacts or swap-removes a buffer**, so **a domino's index is stable for the
  life of its parent**. The UndoEdit/undo stack depends on that: an op names "domino 4812" and
  stays valid across any undo/redo. There was once a `hidden: Uint8Array` tombstone column
  reserving this for a per-domino delete; it was removed, having accumulated six read sites and
  never a single writer. When a delete does land it must pick its own representation and uphold
  index stability the same way — the drawing half still has the mechanism it needs, since the
  outline's `aScale` collapses an instance to nothing at zero and the fill's matrix does the
  same. Do not reintroduce a column speculatively.
- **Positions are parent-relative**; the modeller puts them under a `<group>` at the parent's
  position, so moving a whole element is a transform, not a buffer rewrite.
- `positions` carries a **z** and `orientations` carries **sideways/flat** that are unused in
  this version. They exist so later element types need no data migration.
- Buffers are **mutated in place**; `versions[parentId]` in the store is the change signal.
  Consumers subscribe to the version, not the buffer.
- `initDominoData()` must be called once at startup (it is, from `main.tsx`). It frees an
  element's dominoes when the element is deleted, by watching the DDObject store. It is an
  explicit call rather than a module-load side effect because subscribing at load would read
  the main store mid-construction through the module cycle. `initDominoColorMemoryPruning()`
  (`colorMemory.ts`) is the same pattern for a parent's cross-regenerate color memory, called
  alongside it. **Neither prunes the instant a DDObject leaves `ddObjects`** — a delete is
  undoable, so both defer via `store.ts`'s `isDDObjectInUndoHistory(id)`, which scans
  `undoStack`/`redoStack` for any UndoEdit still referencing `id` (a `delete` whose subtree
  includes it, chiefly). Pruning immediately would mean undoing a delete brings the DDObject
  back with its dominoes already garbage collected — no positions, no colors, nothing to
  restore. Both subscriptions re-check on `undoStack`/`redoStack` changes too, not just
  `ddObjects`, since reachability can change on its own (a delete aging off the 100-entry
  history cap, or being discarded when a later action clears the redo stack) without
  `ddObjects` itself changing on that particular update. `dominoes/selectionStore.ts`'s
  `initDominoSelectionPruning()` deliberately does **not** follow this pattern — it prunes
  immediately, since which dominoes were *selected* isn't state a user expects back after
  undoing a delete.

The subsystem is split into a **parent half** (per element type, decides layout) and a **shared
drawing half** (`dominoes/modeller.tsx`, one implementation for every type).
`object-types/fieldElement/modeller.tsx` is the worked example of the parent half: it owns the
grid maths, and when a layout parameter changes it regenerates the dominoes, calls
`restoreDominoColors` (above) to carry forward any existing colors, and `put()`s the result into
the store — then renders `<DominoModeller>` and draws nothing itself. Any future domino-producing
type does the same: compute a layout, restore colors, write the store, render `DominoModeller`,
and declare its own `dominoCellId` to opt into the restore step at all.

`dominoes/modeller.tsx`'s `DominoModeller` draws a parent's dominoes as two objects sharing one
set of per-domino transforms: a **filled `InstancedMesh`** (one geometry/material/draw call,
per-domino `instanceColor`, resolved from `colorIds` through the color lookup table above) and an
**edge outline**, white for a selected domino and black otherwise (domino editing mode's
selection, see *Selection and direct manipulation* and *Domino color editing* below). Note
`InstancedMesh` does *not* read `DominoData` — it owns `instanceMatrix`/`instanceColor`, so
`DominoModeller` copies the columns across (expanding x/y/z into a 4×4 matrix) and sets
`needsUpdate`; its instance count is fixed at construction, hence the `key={capacity}` remount
when a field is resized. The outline can't be an `InstancedMesh` (that renders triangles, not
lines), so it is an **instanced `LineSegments`**: one base `EdgesGeometry` of a domino box, drawn
once per domino via per-instance `aOffset`/`aScale`/`aOutlineColor` attributes placed by an
`onBeforeCompile`-patched `LineBasicMaterial` (one shared material for every field in the app —
`aOutlineColor` is what lets each instance differ). Same one-draw-call, no-per-object-allocation
budget as the fill.

**The fill material's `polygonOffset` is load-bearing, not a tweak.** A domino's outline lies
exactly on the boundary of its own top face, so wherever a line covers fill rather than
background the two tie the depth test, and which wins a tie is nothing but draw order. With
gaps between dominoes that only costs the inner half of each line and goes unnoticed; the
moment dominoes touch — expanded (*Domino editing mode*), or a field whose spacing is zero —
every shared edge disappears into the neighbour's face and the field renders as one solid
block. Offsetting the *fill* away from the camera fixes it at any camera angle. Nudging the
outline toward the camera in +Z would too, but only while the view stays top-down, and
`polygonOffset` on the line material is not an option: WebGL only exposes
`POLYGON_OFFSET_FILL`, never a line equivalent.

**`SELECTED_OUTLINE_Z_BIAS` is the same problem one level up**, between two *outlines*. Every
outline in a field is a single instanced draw call, so two dominoes sharing an edge tie there
too, and the winner is simply the higher instance index. Layout is row-major, so the neighbours
above and to the right always win — leaving a selected domino's white box drawn as an **L**,
missing its top and right edges. Lifting a selected instance's `aOffset.z` a hair breaks the tie
in its favour. It is applied to the outline only, never the fill, so a selected domino is never
drawn at a different height than its neighbours. Note the two fixes are not interchangeable:
`polygonOffset` can't separate two lines from each other, and the z-bias can't be given to every
domino (it would just re-tie at the new height).

Per-domino selection and color editing now exist (domino editing mode — see *Domino editing
mode* and *Domino color editing* below), both riding the same `UndoEdot` union DDObject-level
undo/redo already used (see *Undo/redo*), exactly as anticipated when that union was designed.
