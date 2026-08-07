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
- **Alt+Drag** a box: the opposite — everything already selected stays selected
  except the dominoes the box touches, which are dropped. This is how you take a
  bite out of a selection without starting it over.
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

The box you drag tells you which of these is happening, so you can see it before
you let go. Dragging **white** means the dominoes under it are being taken into
the selection — the same white a selected domino is outlined in. Dragging
**dark** means Alt is held and they are being dropped instead.

Alt only works while you are dragging out a region. Alt+click on a single
domino, or on empty space, does nothing at all and leaves your selection exactly
as it was. If you hold Ctrl and Alt together, Alt wins and the drag deselects.

## Selecting with a shape

Dragging a box is the default, and the toolbar's **rectangle** button shows it is the
one in use. Next to it sits a button for each other shape you can select with —
two kinds of **circle**, an **oval**, a **triangle** and an **angled rectangle**.

Click one and it stays on until you turn it off, so you can sweep out one shape
after another. To go back to box selection, click the rectangle button, or press
**Escape**.

Every one of them works the same way at heart: you draw the shape out, the
dominoes inside light up as you go, and the shape is taken when you finish. The
ones that need two steps say so below.

### Circle

There are two circle buttons, and they differ only in how you draw the circle —
both give you the same kind of selection. Which one is easier depends on what you
are aiming at, so use whichever suits the moment.

With the circle armed, press at the **centre** of the circle you want and drag
outward. The circle grows from where you started and follows your cursor, and the
dominoes inside light up as it sweeps over them. Release to keep them. Hold **Ctrl**
as you press to add the circle's dominoes to what is already selected instead of
replacing it, or **Alt** to drop them from it — a circle cut out of the middle of
a selection is the quickest way to make a ring. The circle takes the same white
and dark colouring as a dragged box, so you can see which it is doing.

**Circle by diameter** is the other one. Instead of starting at the middle, press
at one side of the circle and drag straight across to the opposite side. The
circle fills the space between the two, and lets go when you do — there is no
extra click.

Both ends of that drag snap to the grid, so the circle passes exactly through two
dominoes you picked. That is the trade between the two buttons: **by radius**
keeps the circle even all the way round its middle, while **by diameter** pins
down exactly where its two sides fall.

### Oval

An oval takes three steps instead of one, because it has an angle and two
different sizes to describe.

1. **Press at one end** of the oval and **drag to the other end**, letting go
   there. That one drag sets both how long the oval is and which way it points —
   it always lies along the line you dragged, from end to end. While you drag it
   is shown twice as long as it is wide, just as a placeholder.
2. **Move the cursor** — the button is up now — and the oval's **width** follows
   it. Only how far you are off to the side of the oval's long axis counts, so
   sliding along its length changes nothing.
3. **Click** to take the dominoes inside.

**Both ends of that first drag snap to the grid**, so an oval runs exactly from
one domino you picked to another. The end you pressed stays put while the far
end follows your cursor, which means the oval's middle shifts as you drag. The
width you set in step 2 does not snap, so you can size it freely.

Ctrl and Alt work exactly as they do for a circle, and are read at that first
press.

If you change your mind part-way through, **Escape** throws the half-built oval
away and lets you start it again without disarming the tool.

### Triangle

A triangle takes two steps, because three corners are more than one drag can
describe.

1. **Press at one corner** and **drag to a second**, letting go there. This only
   draws a line — you are laying down one side, and nothing is selected yet.
2. **Move the cursor** — the button is up now — and the third corner follows it.
   The triangle fills in and the dominoes inside light up.
3. **Click** to take them.

You can swing that third corner right across to the other side of the first line,
and the triangle simply flips over to follow. All three corners snap to the grid,
so a side you meant to be level comes out exactly level.

### Angled rectangle

This is a rectangle that can sit at any angle, unlike the plain box you get by
dragging with the rectangle button on. It also takes two steps.

1. **Press at one corner** and **drag along one side**, letting go at the far
   end. This draws a line and sets both how long that side is and which way the
   rectangle leans. Nothing is selected yet.
2. **Move the cursor** and it becomes the corner opposite the one you started
   from. Moving away from the line sets how **wide** the rectangle is; moving
   along it stretches or shortens the **length**. So you can fix up a side that
   came out too short without starting again.
3. **Click** to take the dominoes inside.

The corner you first pressed never moves — the rectangle grows and shrinks from
the far end only.

The side you drew is an **edge** of the rectangle, not its middle, so the
rectangle appears on whichever side of that line your cursor is on. Cross over
the line and it flips to the other side; pull the cursor back past your starting
corner and it reaches the other way along its length too.

### What every shape has in common

Ctrl and Alt are read when you first press, and held for the whole shape. Pressing
or letting go of either one part-way through changes nothing.

Some shapes **snap** to the field's grid — there is a snapping point on the middle
of every domino, and another halfway between each pair, in the middle of the gap.
Which points snap depends on the shape, and each choice is there to fix a
particular annoyance:

- **Circle by radius** snaps its **centre**. You cannot click exactly on a domino
  or exactly between two, and a centre slightly off takes more dominoes on one
  side than the other. Snapped, it comes out even all the way round.
- **Every other shape** snaps the points you draw it from — both ends of a
  circle-by-diameter or an oval, both ends of the rectangle's first side, and all
  three corners of a triangle. This is what makes their angles come out exact: a
  side you meant to be level ends up exactly level instead of a degree or two off.
  Before it, level ovals and triangle sides always looked slightly tilted.

**Sizes never snap.** A circle's edge, an oval's width and the rectangle's
closing click all follow your cursor freely, so you can still size things
however you like.

Shapes also take dominoes sitting a whisker outside their edge. Without that, an
edge landing exactly on a domino's middle would take that one domino and leave its
neighbours behind even when they are very nearly as covered, which shows up as a
single domino poking out of an otherwise clean curve.

A domino is taken when its **centre** is inside the shape, so one sitting half
across the edge goes by where its middle is rather than by how much of it shows.
That is what keeps the edge of the selection as smooth as the dominoes allow, and it
is also why the expand button makes no difference to what a shape takes — expanding
changes how big the dominoes are drawn, not where they sit.

**Escape** steps back out one layer at a time, changing exactly one thing per
press:

1. Abandons a shape you are part-way through, so you can start it over. The shape
   stays chosen.
2. Clears your selection. The shape still stays chosen.
3. Returns you to box selection.
4. Releases a locked color and any shortcut you were part-way through typing.

So from "circle chosen, dominoes selected", one press clears the selection and a
second returns you to box selection. Steps that have nothing to do — no shape part
way through, nothing selected — are simply skipped.

That is also the difference between Escape and the rectangle button. Clicking
**rectangle** just changes how the next drag behaves and leaves your selection
alone; pressing **Escape** is backing out, so you end up with the selection gone.

**Clicking still works normally whichever shape is chosen.** A shape only starts
once you actually drag, so a plain click picks the single domino under it, a
click on empty space clears the selection, and **Ctrl+Click** adds or removes
one — exactly as with the rectangle button on. The arrow keys carry on from
there as usual. You never have to switch back to the rectangle to click a
single domino.

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