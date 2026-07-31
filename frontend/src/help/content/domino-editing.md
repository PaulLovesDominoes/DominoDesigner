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

Select **Done** or **Cancel** to leave domino editing and return to the normal
Select tool.

This version only selects dominoes — moving, recoloring, or deleting individual
dominoes isn't available yet.