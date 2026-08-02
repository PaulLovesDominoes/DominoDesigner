# Editing dominoes

Double-click a domino field on the canvas, or in the object list, to start editing
its individual dominoes. While editing, the field is outlined in white and the rest
of the app is locked — the toolbar, undo/redo, and the object list are unavailable
until you leave the mode.

Selected dominoes are outlined in white; everything else stays outlined in black.

- **Click** a domino: select just that one.
- **Ctrl+Click** a domino: add or remove it from the selection without disturbing
  the rest.
- **Drag** a box: select every domino fully inside it, replacing the current
  selection.
- **Ctrl+Drag** a box: select every domino fully inside it, added to the current
  selection.
- **Arrow keys**: jump to the next domino in that direction.
- **Shift+Arrow keys**: grow or shrink the selection one domino at a time in that
  direction.
- **Escape**: cancel a drag in progress, or clear the current selection. It does
  not leave the mode.

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

Select **Done** or **Cancel** to leave domino editing and return to the normal
Select tool.

Moving and deleting individual dominoes isn't available yet.