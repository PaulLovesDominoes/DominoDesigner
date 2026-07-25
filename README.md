# DominoDesigner

A graphical **domino build planner** — the successor to the archived
[`Domino3D`](../Domino3D) project. The long-term goal is a full-scale planner usable by the
domino community to design complete build plans made of many domino elements, with nested
tools for choosing colors, mapping images onto domino colors, animating domino pacing, and
more.

This is **v1**: the expandable app framework — a title bar with menu-driven screen switching
and a Designer screen with a working pan/zoom 2D canvas, an extensible object model for the
build's contents, and live property editing.

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
  **Designer** and **Settings** screens, and a help panel.
- **Designer** — a 2D three.js canvas (1 unit = 1 mm) showing the build plane, with
  mouse-wheel zoom and right-drag pan. A toolbar with Select/Field tools and Zoom In / Zoom
  Out / Reset Zoom buttons. The build's contents are a hierarchy of **DDObjects** rooted at
  the build plane, shown in a left sidebar as a live tree (type icon + name) that updates as
  objects are created. Choosing the **Field** tool and dragging a rectangle on the plane
  places a domino field there; each field draws its dominoes as one instanced mesh with
  line-segment edge outlines. A row's **⋯** menu opens **Properties** for any object —
  including the build plane's own size and color — in a modeless dialog that previews edits
  live on the canvas, with Save/Cancel.
- **Settings** — currently empty. The build-plane size it once held now lives on the
  build-plane object itself, edited through its properties. Nothing is persisted; every load
  starts a fresh default project.
