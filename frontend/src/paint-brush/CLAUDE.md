### Paint brushes

`paint-brush/` holds domino editing mode's freehand painting tools — two today, `pencil` (a round
nib) and `quill` (a thin bar fixed at 45°, lower-left to upper-right). Drag one across the field and
every domino it passes over takes the selected swatch as it goes. Note the two are **labelled**
"Paint with Circle" and "Paint with Bar", and the help topic calls them the Circle and Bar brushes:
the icons draw a nib rather than a drawing implement, and the user-facing names follow the icons.
The registry ids, folder names and `DominoBrushId` still say `pencil`/`quill` — renaming those is
mechanical but wide (two folders, six `PaintCircle*`/`PaintQuill*` icon exports) and has not been
done. It follows the `object-types/`
layout, per the *Guiding principle*: `base.ts` (the `DominoBrushDefinition` contract, the three
sizes), `registry.ts` (`DOMINO_BRUSHES` and its accessors), `coverage.ts` (the shared per-frame
scan), one folder per variant holding `object-model.ts` and `preview.tsx`, plus
`appStoreSlice.ts`. **Adding a brush is a folder plus one line in `DOMINO_BRUSHES`** — the toolbar,
the hint bar and `DominoEditor` are all driven off the map and none of them names a brush. It is
built for the ones after these two (an airbrush is the expected next), which is why pencil and quill
differ in only two members of substance — `contains`, the shape that is *tested*, and `Preview`, the
shape that is *drawn*. **Those two must agree**, for the reason `dominoes/expansion.ts` documents
one level down: if the nib is drawn bigger than it paints, the user sees the shape pass over a
domino it never takes.

**It is deliberately not another entry in `SHAPE_SELECTS`**, and the four differences are what
justify the separate subsystem rather than four optional members only brushes would ever set. A
brush has no gesture *stages* — nothing is dragged out, so there is no `nextStep`, no state object
and no control points (nothing extends a Shift+Arrow out of a stroke). A brush follows the cursor,
so it never snaps to the element's grid. A brush **writes**, where a shape only ever changes which
dominoes are selected. And a brush carries a size menu.

`DominoBrushDefinition` is correspondingly small: `label`, `hint`, `contains(sizeMm, dx, dy)`,
`Preview`, plus `sizeMm` and `sizeIcons` (below). `contains` is a **midpoint test on the domino's
own centre**, exactly as shape-select's is and for the same reason — Expand changes how big a
domino is *drawn*, not where its centre sits, so a brush takes the same dominoes with it on or off.
`coverage.ts`'s `indicesUnderBrush` is a second copy of `shape-select/dispatcher.ts`'s
`indicesInShape` loop rather than a shared generic: the two registries erase different definition
types and their `contains` signatures differ, so sharing would cost more machinery than the eight
lines it saves. Both must stay **ascending**, since `DominoEditor` compares frames elementwise.
A future airbrush will want a per-domino *strength* (`0..1`) here rather than an in/out answer,
since it lays down density; widen `contains` when that lands and can exercise it, not before.

**Millimetres are per brush, and that reverses an earlier decision.** `DOMINO_BRUSH_SIZES` holds
only the size *identity* — which three there are, their order, their labels — because that is what
the store records and what the menu iterates, neither of which needs to know a brush's reach. The
magnitude lives on the definition as `sizeMm: Record<DominoBrushSizeId, number>`: pencil 20/60/120,
quill 60/100/140. The array once carried the millimetres itself, arguing that "Medium" ought to mean
a comparable mark whichever nib drew it. Using it disproved that. 20mm is a useful single-domino dot
for a round nib, but the quill's is fixed at `QUILL_NIB_WIDTH_MM` across, so a 20mm *length* is a
squat blob — too short to show the thick/thin contrast the tool exists for, and barely distinct from
a small circle. The quill's floor sits about where the pencil's middle does. There is no global
`dominoBrushSizeMm` lookup any more, and reintroducing one would re-import the assumption.

**One stroke is one undo entry, and that inverts the rule every other colour write follows.** All
of those write and record in the same breath, which here would mean an undo entry per frame. A
stroke must write live, so paint appears under the nib, yet
record once, so Ctrl+Z takes back the whole stroke rather than one flick of it. Four actions in
`dominoes/appStoreSlice.ts` do it, over `dominoStroke` (the dominoes painted so far and the colour
each had *before*):

- **`paintDominoStroke`** resolves the selected swatch through the shared `swatchTargets` and calls
  `commitDominoColors` like everything else, inheriting the in-place column write, the version bump
  the modeller redraws on, and the `colorByCell` sync. The one difference is the last step: the
  operation it hands back is **folded into `dominoStroke` instead of being pushed**. First value
  seen per domino wins — a nib passing twice over the same domino would otherwise remember what its
  *first* pass left, and undoing the stroke would leave it painted. Safe to call every frame with a
  set the previous frame already covered, since `commitDominoColors` drops any domino already at the
  target colour and returns `null`.
- **`endDominoStroke`** builds one `"dominoColors"` operation from the map and pushes it. Built by
  hand rather than through `commitDominoColors`, because the columns are already written and the
  memory already synced; only the history entry is left.
- **`cancelDominoStroke`** feeds the map straight back through `commitDominoColors` and drops the
  operation on the floor — the same idiom `restoreDominoColorSnapshot` uses, and the reason the
  revert re-syncs colour memory too. Without that, a later regenerate would repaint the very colours
  the cancel discarded.
- **`beginDominoStroke`** opens the map. It and `paintDominoStroke` both bail with no
  `dominoSelectedSwatchId`.

`designer/DominoEditor.tsx` drives all of it, and a brush is the **first gesture in the file that
acts with no button down**. Its branch therefore sits *above* the `if (!g) return` in
`onPointerMove` — that one line is what makes every other gesture a no-op until a press. One
function, `trackBrush`, handles a frame whether hovering or painting: it draws the nib, marks what
the nib covers as hovered, and, when a stroke is open, paints it. Load-bearing details:

- **The paint call goes before the `sameIndices` redraw guard, never after.** The first frame of a
  stroke usually covers exactly what the last hovering frame covered, so a guarded paint would skip
  the press itself.
- **`resetBrushView` runs off `[brushId, brushCanPaint]`, and the derived boolean is why that is one
  effect rather than two.** Arming, disarming, swapping brushes, and a colour arriving where there
  was none are all "what the brush should be showing changed wholesale". Depending on
  `dominoSelectedSwatchId` *directly* would be too permissive twice over: choosing a different
  colour mid-drawing would reset needlessly, and choosing one with no brush armed would reset a
  brush that isn't in hand. Once a guard
  inside the effect filters those out you can no longer tell which dependency fired, which is what
  forced two effects before. Note it resets only the brush's own view — the nib, the stroke, the
  hover — and deliberately leaves the selection alone, which is what lets dominoes picked out
  before a brush was reached for survive being armed.
- **`onPointerLeave` commits a stroke rather than ignoring it.** Nothing captures the pointer, so a
  button released outside the canvas never reaches this component; an earlier version bailed out
  while painting and the brush stayed in painting mode, silently resuming the moment the pointer
  came back with the button long since up. This was a real bug — do not "considerately" re-add a
  guard against interrupting a stroke here. Leaving also clears the hover, which has no nib left
  to belong to.
- **The nib preview sits in world coordinates**, unlike a shape variant's `Preview`, which is
  wrapped in a `<group>` at the edited DDObject's origin. A shape works in parent-relative mm; a nib
  just follows the pointer and is as happy off the field as on it.

**A brush's hover footprint is not a selection, and that separation is the load-bearing thing in
this subsystem.** `dominoes/selectionStore.ts` holds two per-domino sets: `entries` (what the user
picked out) and `brushHover` (what the nib covers right now). `dominoes/modeller.tsx` draws the
**union** of them in white — colour, Z bias and the hidden-domino outline reveal all take the
union, so a hidden domino under the nib shows the same warning box that selecting it does.

They were one set, and every awkward rule the brush needed came from that. Restoring the
conflation would bring all of them back at once, so it is worth naming what the split bought:

- A selection survives being hovered over, so Ctrl+A then Backspace clears a field the way it does
  in any other mode — the case that prompted this.
- A selection survives *arming a brush*, so reaching for one is not a way to lose work.
- `pickDominoSwatch` needs no brush guard, and Escape's rung 2 needs no skip. Both were deleted.
- A swatch click no longer has to fear recolouring a stale footprint, so `onPointerLeave`'s clear
  is ordinary tidiness rather than a correctness fix.

**Only a press to paint discards the selection** (`onPointerDown`'s brush branch), and it sits
*after* the no-swatch early return: an inert brush must not throw away work when pressed.

**`hoverVersions` is a separate counter from `versions`, and must stay separate.** A brush
rewrites its hover on nearly every pointermove, and `DominoEditor` subscribes to `versions` to
rebuild the clipboard handlers whose enablement tracks the selection — one shared counter would
re-register both handlers, and re-render every `useClipboardCapabilities` consumer, at
pointer-event rate. The modeller subscribes to both because it draws both.

**`exitDominoEditing` clears the hover explicitly**, and cannot leave it to `resetBrushView`: that
update nulls `dominoBrushId` and `dominoEditingId` together, so by the time the effect runs it has
no id to clear under and the hover would be stranded — white boxes over a field nobody is editing.

**A brush arms with or without a selected swatch, and is simply inert without one** — no nib, no
hover, nothing paintable, with `ModeHintBar` saying why. The button carries **no disabled
state**, and that is not laziness: what the user has is a colour still to pick, not a broken tool,
and they can only be told that by a button they are allowed to press. Greying it out instead made
the whole feature look unimplemented.

**Arming a brush deliberately does not clear the selected swatch either**, so a brush picked up
while a colour is already chosen paints straight away. Adding a clear to `setDominoBrush` is the
obvious-looking change and it is a trap: `DominoBrushButton`'s size menu calls that action again
for a brush already in hand, so a clear would drop the colour on every size change, and again on
every swap between brushes. Nothing extra is needed to clear the *dominoes* selected on arming —
`brushId` changes, so `resetBrushView` above fires and starts the brush on a clean plane.

`designer/DominoBrushButton.tsx` is one control per brush, and **the button only opens the size
menu; the menu arms the brush.** Clicking an armed brush is therefore not a disarm — it just reopens
the menu, matching every other tool in this toolbar, none of which turns itself off. It carries a
14px caret beside its size glyph saying so — the same caret the New button and the colour swatches
use — marked `aria-hidden`, since `aria-haspopup` already announces it. It borrows
`Toolbar.module.css`'s `.iconBtn`/`.active` rather than keeping a byte-identical copy; what it can't
borrow is `ToolButton`, which takes no ref to anchor a popup to and emits no
`aria-haspopup`/`aria-expanded`.

**The caret's layout modifier, `.iconBtnWithCaret`, lives in `Toolbar.module.css` beside `.iconBtn`
and not in this component's own module.** `.iconBtn` is a fixed 34px square, so the caret needs
`width: auto` and a gap — an override of the same specificity. Across two CSS modules, which one
wins would come down to the order the stylesheets happen to land in the bundle, which nothing pins
down; in one file, after the rule it overrides, it is certain. The popup follows `NewElementMenu`'s pattern, and adds one thing:
an effect that claims **Escape in the capture phase while open**, so closing a menu never also runs
`DominoEditor`'s ladder and disarms the tool underneath. Same answer `ConfirmDialog` uses against
the same window listeners, but for that one key only — a menu is a popup, not a modal, and has no
business swallowing the rest.

**`sizeIcons` is one hand-drawn glyph per brush per size, and every one renders at a single pixel
size.** The drawing carries the size, so scaling a glyph to imply one would double the cue and fight
it — a Small icon rendered small would shrink its own droplet too. There is deliberately no generic
per-tool glyph on the definition: the button shows the size-specific drawing, so one would have no
consumer. See *Hand-drawn icons* for the shared-viewBox rule those six drawings depend on.