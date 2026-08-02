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

Select **Done** or **Cancel** to leave domino editing and return to the normal
Select tool.

Moving and deleting individual dominoes isn't available yet.