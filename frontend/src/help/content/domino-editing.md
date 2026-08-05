# Editing dominoes

Double-click a domino field on the canvas, or in the object list, to start editing
its individual dominoes. The view zooms in to fit the field to the canvas. While
editing, the field is outlined in white and the rest of the app is locked — the
object list is unavailable, and the toolbar's Select and New buttons are replaced by
tools for working on dominoes, until you leave the mode.

Selected dominoes are outlined in white; everything else keeps its usual grey outline.

- **Click** a domino: select just that one.
- **Ctrl+Click** a domino: add or remove it from the selection without disturbing
  the rest.
- **Drag** a box: select every domino the box touches, replacing the current
  selection. A domino only has to be clipped by the box, not enclosed by it, so a
  thin drag straight across a row takes the whole row. Dominoes light up as the box
  sweeps over them, so you can see what you are about to take; press **Escape**
  before releasing to call the whole drag off.
- **Ctrl+Drag** a box: the same, added to the current selection.
- **Arrow keys**: jump to the next domino in that direction.
- **Shift+Arrow keys**: grow or shrink the selection one domino at a time in that
  direction.
- **Ctrl+A**, or the select-all button in the toolbar: select every domino in the
  field, hidden ones included.
- The **invert** button in the toolbar: everything selected becomes deselected and
  everything else becomes selected. With nothing selected it takes the whole field.
- **Delete**: hide the selected dominoes. **Backspace**: clear them back to
  unpainted.
- **Escape**: cancel a drag in progress, or clear the current selection. It does
  not leave the mode.

## Making dominoes easier to click

Dominoes stand on their narrow edge, so seen from above they are thin slivers with
gaps between them — fiddly to click one by one. The **expand** button in the toolbar
grows every domino in the field until they touch, giving each one a target the full
size of the space it sits in. Click it again to put them back.

This only changes how the dominoes are drawn while you are working. Nothing about
the field itself changes, it is not something you can undo, and leaving domino
editing puts them back to their real size on its own. The button is unavailable for
a field whose dominoes are already packed together with no spacing, since there is
nowhere for them to grow.

## Coloring dominoes

While the mode is active, the sidebar shows a swatch for every active color in your
domino inventory in place of the object list. There are two ways to use it:

- **Select dominoes, then choose a color.** Click a swatch, or just type its
  shortcut — matching swatches narrow as you type, and a unique match applies
  straight away. If one shortcut is also the start of a longer one (say `B` and
  `B1`), press **Space** to take the shorter one.
- **Choose a color first, then select dominoes.** Double-click a swatch to lock it;
  a lock badge appears. From then on every domino you select, by any method, is
  colored immediately. Clicking a different swatch unlocks the first one.

**Escape** clears the selection, releases a locked color, and cancels a shortcut
you were part-way through typing. Leaving the mode does the same.

Each color change is a single undo step, and can be undone after you leave the mode.
Clicking a swatch with nothing selected does nothing.

## Hiding dominoes, and the two special swatches

Above the inventory colors sit two swatches that aren't colors:

- **Hide** (hatched, marked `DEL`) makes the selected dominoes invisible. They are
  still there — still part of the design, still selectable — they just aren't drawn.
- **Unassigned** (plain grey, marked `Bksp`) clears the selected dominoes back to
  having no color assigned, the same as **Backspace**. This is what a cut leaves
  behind, minus the effect on what you've copied.

Both behave like any other swatch: click to apply, double-click to lock, and each
has its own menu. Their markings name the keys that apply them — `DEL` and `Bksp`
are not shortcuts you type.

Hiding never toggles. Clicking **Hide** hides, the same way clicking **Red** paints
red, however much of the selection was already hidden — which is what makes it safe
to lock. To bring dominoes back, select them and choose **Unhide** from the Hide
swatch's menu; each one returns to the color it had. Hidden dominoes keep that color
underneath the whole time.

You can still find a hidden domino by dragging a box over where it was, or by
clicking it, and a selected one shows its white outline over nothing — that outline
is how you see what you're about to unhide. **Hide → Select** in the menu picks out
every hidden domino at once, which is usually easier.

Assigning any color to a hidden domino un-hides it, so it appears in the new color
straight away. That includes **Backspace**, which brings it back unpainted.

## Selecting by color

Every swatch's menu — reached from the small arrow on its right — can build a
selection out of the dominoes matching it:

- **Select** replaces the selection with every domino of that color.
- **Add Select** adds them to what's already selected.
- **Deselect** removes them from what's already selected.
- **Deselect others** narrows instead of growing: of what's already selected, only
  the dominoes of that color stay.

These count only dominoes you can see, so a color's **Select** skips any hidden
domino that would return to that color. **Hide → Select** takes exactly the hidden
ones, and **Unassigned → Select** exactly the visible, uncolored ones.

If a swatch is locked while you do this, the dominoes you select are recolored to it
immediately — that is what locking means, whichever way you make the selection,
including select-all and invert. Locking a color and pressing **Ctrl+A** therefore
paints the whole field, as one step you can undo.

## Copying and pasting colors

Colors can be copied from one group of dominoes to another, including between two
different fields.

- **Ctrl+C**: copy the selected dominoes' colors.
- **Ctrl+X**: copy them and clear them to unpainted in one step.
- **Ctrl+V**: paste onto the current selection.

Paste lines the copied pattern's **upper-left** corner up with the upper-left corner
of wherever you've selected, then works across and down from there.

- **Select a single domino** and the whole pattern is stamped starting from it.
  Anything that would fall off the edge of the field is left out.
- **Select a region** and exactly that region is filled: if it's smaller than what
  you copied the pattern is cut short, and if it's larger the pattern repeats until
  the region is full.

Both the shape you copy and the shape you paste onto can be any shape at all — they
don't have to be rectangles. Gaps in what you copied are left alone when you paste,
so an L-shaped copy pastes as an L without disturbing the dominoes around it. And
only dominoes you actually selected are painted, so selecting a ring or a scatter
paints exactly that.

What you copied stays on the clipboard after you leave domino editing, so you can
copy in one field, leave, open another field, and paste there. It survives even if
you resize or delete the field you copied from. Each paste, and each cut, is a
single undo step.

## Leaving domino editing

Both buttons return you to the normal Select tool, but they do opposite things with
your work:

- **Done** keeps everything you changed. Each change stays on the undo stack, so you
  can still undo it afterwards one step at a time.
- **Cancel** throws away *everything* you did in this editing session — every color
  applied, every hide and unhide, every cut and paste — putting the field back exactly as it was when you
  double-clicked into it, however many changes you made. You are asked to confirm
  first, unless you haven't changed anything, in which case Cancel just leaves. Once
  confirmed, discarded work cannot be brought back with Undo or Redo, but anything
  you did *before* entering domino editing can still be undone as usual.

Neither one moves the view back out; use the fit button in the toolbar once you have
left the mode if you want the whole build plane again. *While* editing, that same
button fits the field you are working on, so it puts the view back where entering
the mode set it if you have panned or zoomed away.

Moving and deleting individual dominoes isn't available yet.