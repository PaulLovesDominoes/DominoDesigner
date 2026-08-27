[Home](home) > Structure Designer

# The Structure Designer

This is the page where you design three-dimensional domino structures — towers, walls, and
anything else built upward rather than flat on the floor.

A structure is designed here on its own, separately from any particular build. Once it has been
designed, it becomes a pattern you can place into a build on the [Build Designer](designer) page,
size to fit, and then colour like any other element.

This page is still under construction. You can lay out the layers, set the grid your dominoes stand
on, place dominoes onto it, and select and delete the ones you have placed; moving them, and
copying and repeating whole groups of them, come next.

## The build plane

The build plane here is the floor space a structure is built on. It is 1.5m square, and it is
light grey-blue so you can tell at a glance which page you are on.

Unlike the build plane on the Build Designer page, this one cannot be resized or recoloured — it
is simply the ground a structure stands on.

## Choosing a layer

A structure is built up in layers, one course of dominoes at a time. The control down the
right-hand side of the screen chooses which layer you are working on.

- The layer number is shown at the top
- Drag the dot up the line to work on a higher layer, down to work on a lower one
- Layer 1 is at the bottom, resting on the build plane; layer 100 is at the top
- You can also click anywhere on the line to jump to that layer

The keyboard works too. **Page Up** and **Page Down** move one layer, and holding **Shift** with
them moves five. Those work whenever the pointer is over the canvas, so you can change layer
without reaching for the control at all — and they work when the control itself has been clicked.
With it clicked, **Home** and **End** also jump to the lowest and highest layers.

The arrow keys deliberately do *not* move the layer. They place dominoes — see below.

The layer you have chosen is shown on the canvas as a grey sheet, sitting at the height that layer
is built at. Layer 1's sheet lies flat on the build plane; each layer above it sits 24mm higher
unless a layer definition says otherwise.

## The two canvas tools

Two buttons in the toolbar decide what a left-drag on the canvas does, and one of them is always
chosen:

- **Domino Creation** (`Esc`) — drags place dominoes. This is where the page starts.
- **Rectangular Select** (`R`) — drags draw a box over the dominoes already there.

A single click works the same way in both: it selects the domino you clicked on.

## Placing dominoes

Dominoes stand on the **junction points** of the grid — the small dark dots drawn across the layer
you are working on. To place one, drag on the canvas from the junction you want it to start at
toward the one you want it to face.

- Before you press, the junction nearest the pointer is marked in blue — that is the one you would
  start from
- Press and drag, and a faint domino appears, pinned at that junction and turning to follow the
  pointer
- The junction you are dragging toward sets the **direction only**, never the length: a domino is
  as long as a domino is
- Let go to place it
- Press **Esc** while still holding the button to give up, and nothing is placed

A press that does not move places no domino, because there is no direction to face. It selects
whatever it landed on instead.

### Dominoes cannot be put where there is no room

Two dominoes may never occupy the same space, and the page enforces that rather than letting you
draw something you could not build:

- A junction with a domino already standing on it **takes no blue mark**, and pressing there does
  nothing. The mark going out is how you can tell — the dot itself is still there, just hidden
  underneath the domino
- While you drag, a domino that would run into another simply does not appear. The mark still
  follows the junction you are aiming at, so you can see which way you are pointing
- Letting go there places nothing

**This is why two dominoes cannot be laid end to end on neighbouring junctions.** A domino is 48mm
long, and on a Length-overlap grid the junctions are 40.5mm apart, so the two would run into each
other by the thickness of a domino. Real structures work the same way: a course always has gaps in
it, and what closes a gap is a **bridging** domino on the layer above, resting on the two either
side. That is what the overlap spacings are for — and it is what makes a structure stand up and
still topple properly when it is pushed.

The check sees height as well as floor space, so an upright domino reaching two courses up will
refuse anything built into the space it fills.

### Placing with the arrow keys

With the pointer over the canvas and a junction marked, the arrow keys lay a domino without your
having to drag.

- An **arrow on its own** lays the domino exactly the way the arrow points — always along a side of
  the build plane. Which side that is follows the view: tip the view round until a different edge
  faces you and "up" follows it.
- **Shift + an arrow** lays it diagonally, hunting round clockwise from the arrow for the nearest
  junction between about twenty and seventy degrees. That is what finds the thirty- and sixty-degree
  neighbours of the isometric and hexagonal grids, not just the forty-five of a rectangular one. If
  there is no junction in that wedge, nothing is placed.

After each one the mark steps to the next free junction **to the right**, whichever way the domino
itself went — so holding an arrow walks a wall rightward across the plane. "Right" follows the view
the same way the arrows do, so tipping the view round takes the wall along a different side.

Junctions the new domino is standing on are stepped over. A sideways domino is longer than the gap
between two junctions, so it covers the one immediately to its right and the mark moves on to the
one after — leaving exactly the gap a bridging domino on the next layer up is meant to close.

Moving the mouse puts the mark back under the pointer.

### Which way up

Three buttons in the toolbar choose how the next domino is set down, and one of them is always
chosen. Each has a single-key shortcut:

- **Upright** (`U`) — standing on one end, the tallest way a domino goes
- **Sideways** (`S`) — lying on a long narrow edge, which is how most dominoes in a structure sit
- **Flat** (`F`) — lying on a broad face, the lowest way a domino goes

Whichever is chosen is shown both by the pressed button and by the domino drawn at the left of the
hint bar under the toolbar.

Upright and sideways dominoes straddle the line between the two junctions. A flat one lies mostly
to one side of it — dragging in the opposite direction puts it on the other side.

### Dominoes and layers

**A domino is always placed on the layer you are working on.** To build higher, move the layer
chooser up first and then place. One structure can have dominoes on as many layers as you like.

If the layers above the one you are on get in the way, the **hide dominoes above this layer** button
in the toolbar leaves them out until you press it again. It does not change the structure — only
what you can see of it.

### Grids and spacing

Two of the grid spacings offered in a grid definition are named after a domino's own dimensions less
its thickness — **Length-overlap** and **Width-overlap**. They are the ones worth knowing about: on
a grid spaced that way, a domino on one layer bridges exactly between two on the layer below, which
is how a real structure holds together.

There are also **half** versions of both. Halving an overlap spacing adds a junction halfway between
each pair, which is where a bridging domino wants to start — so a half grid is the whole grid with
the bridging positions added, rather than a different grid.

## Selecting and deleting dominoes

- **Click** a domino to select it — in either tool. Its outline turns white.
- **Ctrl+click** another to add it to the selection.
- **Click empty space** to clear the selection.
- In **Rectangular Select**, drag a box over the canvas. Every domino it touches is selected as you
  drag, so the box shows what it is about to take before you let go. **Ctrl+drag** adds to what was
  already selected, and **Esc** part-way through gives up and puts the old selection back.
- Press **Delete** to remove the selected dominoes. **Ctrl+Z** brings them back.

A box takes the dominoes on the layer you are working on **and every layer above it** — the rule is
that it takes what you can see. Turn on **hide dominoes above this layer** and it takes only the
course you are on. Layers below are never taken; they are behind the grey sheet you are drawing on.

## Groups

Every domino you place goes into a **group**, which appears in the sidebar with the number of
dominoes in it shown before its name. The group is made for you when you place your first domino —
there is nothing to set up.

Double-click the group to see how many dominoes it holds. Later versions will let you copy a group,
move it, and repeat it. A group emptied by deleting every domino in it stays in the list, showing
`(0)`; use its **⋯** menu to remove it.

Deleting a group from its **⋯** menu deletes every domino in it. Undo brings them all back.

## Undoing

Every domino you place can be undone with **Ctrl+Z**, one domino at a time, and redone with
**Ctrl+Y**. Undoing your very first domino takes its group away with it, and a Delete comes back all
at once however many dominoes it took.

Undoing or redoing clears the selection, because the dominoes it was pointing at may have moved.

## Moving the view

- **Pan** around the build plane with right-click-drag
- **Rotate** the view with Shift + right-click-drag
    - This tips the view away from looking straight down, which is how you see the layer sheet —
      and eventually the structure itself — standing up off the build plane
    - The view will not go below the build plane
- **Zoom** with the middle-mouse wheel, or the zoom in and zoom out buttons in the toolbar
- The **fit** button in the toolbar fits the whole build plane in the window *and* straightens the
  view back to looking straight down, which is how you get back from a rotation

The view you leave this page on is the view you find when you come back to it.

## The sidebar

The sidebar lists the steps your structure is built from, in order — the layer definitions saying
how tall each layer is, the grid definitions saying what the dominoes on each layer stand on, and
the group holding the dominoes you have placed. It is empty until you add the first of them.

Double-click a step to open its properties, or use its **⋯** menu to delete it.

### Definitions stack up the layers

Layer definitions and grid definitions both work the same way. Each covers a run of layers starting
where the one before it left off, and how many is its own setting:

- **Once** — a single pass. For a grid definition that is one layer; for a layer definition it is
  one time through its list of heights.
- **Count** — that many passes. The box for the number appears beside the pull-down.
- **Forever** — all the way to the top of the structure. This is what a new definition starts at.

Any layer no definition reaches falls back to the standard: 24mm tall, on a plain rectangular grid
spaced a Length-overlap apart.

A definition that would cover no layers at all — because the ones before it already reached the top
— says so in red, both in the list and at the top of its own properties.

The layer definition calls this setting **Repeat** and the grid definition calls it **Layers**. They
do the same thing; the grid says "Layers" because a grid already repeats across the plane, and one
row labelled Repeat sitting next to the spacings would have been asking which repetition was meant.

---

[Home](home)