# DominoDesigner

A graphical **domino build planner** — the successor to the archived
[`Domino3D`](../Domino3D) project. The long-term goal is a full-scale planner usable by the
domino community to design complete build plans made of many domino elements, with nested
tools for choosing colors, mapping images onto domino colors, animating domino pacing, and
more.

This is **v1**: the expandable app framework — a title bar with menu-driven screen switching
and a Designer screen with a working pan/zoom 2D canvas, an extensible object model for the
build's contents, and live property editing.

Future plans:
- More element types beyond the domino field (walls, towers, lines)
- Moving and deleting individual dominoes, alongside the coloring that exists today
- Mapping an image onto domino colors
- Saving and loading a build

## Conventions

-  Units internally are all millimeters, this includes the three.js units.
-  0,0 of the build plane is the lower-left hand corner.
-  The build plane is XY. Vertical objects (such as towers) grow up into the Z dimension.
-  The build plane is at z = 0.

## Stack

- **Frontend:** [Vite](https://vite.dev/) + React + TypeScript +
  [react-three-fiber](https://r3f.docs.pmnd.rs/) / [drei](https://github.com/pmndrs/drei) +
  [three.js](https://threejs.org/), with [Zustand](https://zustand.docs.pmnd.rs/) for state
  and [Remix Icon](https://remixicon.com/) for icons. Styling via CSS Modules.
- **Backend:** [FastAPI](https://fastapi.tiangolo.com/) — a thin static-file server for the
  built frontend. No API endpoints in v1.

## Prerequisites

- **Node.js 18+** (includes npm) — for the frontend.
- **Python 3.9+** — for the FastAPI server.

## Develop (with hot-reload)

```
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (default http://localhost:5173). Editing files hot-reloads the page.

## Run the deployable build (served by FastAPI)

```
cd frontend
npm run build          # outputs frontend/dist

cd ../server
pip install -r requirements.txt
start_server.bat       # or: python -m uvicorn main:app --reload
```

Then browse to http://127.0.0.1:8000. The server just serves `frontend/dist`; rebuild the
frontend (`npm run build`) after changing frontend code.

## What v1 does

- **Title bar** with a logo placeholder, a hamburger menu that switches between the
  **Designer** and **Domino Inventory** screens, a toolbar (Select / New element / Undo / Redo /
  Zoom), and a help panel.
- **Designer** — a 2D three.js canvas (1 unit = 1 mm) showing the build plane, with
  mouse-wheel zoom and right-drag pan. The build's contents are a hierarchy of **DDObjects**
  rooted at the build plane, shown in a left sidebar as a live tree (type icon + name) that
  updates as objects are created.
- **Field** tool - allows dragging a rectangle on the plane to
  place a domino field there; each field draws its dominoes as one instanced mesh with
  line-segment edge outlines. Select a field to move it or drag its handles to resize:
  resizing adds and removes whole rows and columns around a fixed point rather than
  stretching the dominoes, so the dominoes you already have — and the colors on them —
  stay exactly where they are no matter which edge you drag. The outline can therefore
  sit slightly proud of the outermost dominoes; that gap is where the next row or column
  will appear. A row's **⋯** menu opens **Properties** for any object — including the
  build plane's own size and color — in a modeless dialog that previews edits live on
  the canvas, with Save/Cancel.
- **Domino Inventory** screen — a catalog of the domino colors available to build with (color,
  material, finish, brand, shortcut, stock count), each toggleable active/inactive.
- **Domino editing mode** — double-click a field (on the canvas or in the sidebar) to select
  individual dominoes within it (click / Ctrl+click / drag a box / arrow keys) and set their
  color from the inventory, shown as a grid of swatches in place of the object hierarchy while
  the mode is active. Two ways to color a selection:
  - **Select dominoes, then pick a color** — click a swatch, or type its shortcut (e.g. "B2");
    matching swatches highlight live as you type, and a unique match applies immediately.
  - **Pick a color first, then select dominoes** — double-click a swatch to lock it (shown with
    a lock badge); every domino you select afterward, by any method, is colored to it
    immediately, including whatever was already selected at the moment you locked it. Escape
    unlocks (and clears the current selection); so does exiting the mode.
- **Copying and pasting colors** — **Ctrl+C** copies the selected dominoes' colors, **Ctrl+X**
  copies and clears them, **Ctrl+V** pastes onto the current selection. Paste lines the copied
  pattern's upper-left corner up with the destination's: select one domino and the whole pattern
  is stamped from there, or select a region and exactly that region is filled — the pattern
  repeats if the region is larger, and is cut short if it's smaller. Both the shape you copy and
  the shape you paste onto can be any shape, not just rectangles. What you copied survives
  leaving domino editing mode, so a pattern can be carried from one field to another.
- **Undo/Redo** covers both DDObject-level edits (create/delete/move/resize/properties) and
  domino color changes, on one shared history — undoing a color change works even after
  leaving domino editing mode, and editing or deleting an inventory color's RGB immediately
  updates every domino painted with it.
- Nothing is persisted; every load starts a fresh default project.
