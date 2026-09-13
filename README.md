# DominoDesigner

A graphical **domino build planner** to help design domino builds.

My long-term goal is to create a full-scale, open source planner usable by the
domino community to design complete build plans made of many domino elements, with nested
tools for choosing colors, mapping images onto domino colors, animating domino pacing (possibly), and
more.

This version has:
- Creating fields
- Editing field colors
    -  With many fun tools :-)
- Mapping images to fields
- Outputting build plans and sort plans
- Managing domino inventory with upload/download

Future plans:
- More flat element types (circle-bombs, spirals, lines, curves, triangles, etc.)
- Handling three-dimensional structures
    - Including patterns for variable-sized structures
- Saving, loading, and sharing build plans

BIG NOTE:  THIS VERSION HAS NO SAVE!
-  Anything you build will be erased if you refresh the screen, your laptop gets rebooted, or you close the browser!

## Limitations

These are current limitations, and may exist forever.

-  Designed for desktops with a mouse
    -  Is not tested or intended for ipads, phones, etc
-  Only tested with Google Chrome
    -  May work on other browsers, but this is not guaranteed

Why?  Because I only have limited hours in the day and I can't build and test every possible variation. Maybe, if there's enough community support, others can step in.

## Conventions

-  Units internally are all millimeters, this includes the three.js units.
-  0,0 of the build plane is the lower-left hand corner.
-  The build plane is XY. Vertical objects (such as towers) grow up into the Z dimension.
-  The build plane is at z = 0.

## Stack

- **Frontend:** [Vite](https://vite.dev/) + React + TypeScript
    -  [react-three-fiber](https://r3f.docs.pmnd.rs/) / [drei](https://github.com/pmndrs/drei)
    -  [three.js](https://threejs.org/)
    -  [Zustand](https://zustand.docs.pmnd.rs/) for state
    -  [Remix Icon](https://remixicon.com/) for icons
        -  Alongside a few hand-drawn SVGs inlined by [vite-plugin-svgr](https://github.com/pd4d10/vite-plugin-svgr). 
    - Styling via CSS Modules.
- **Backend:** [FastAPI](https://fastapi.tiangolo.com/) — a thin static-file server for the
  built frontend. No API endpoints in v1.

NOTE:  Backend is UNUSED right now. My intention is to someday use it for saving, sharing and real-time collaboration. It could go away. TBD. Deployments currently only need the front-end. No calls are made to the backend at all.

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

(see notes above about use of backend)

```
cd frontend
npm run build          # outputs frontend/dist

cd ../server
pip install -r requirements.txt
python -m uvicorn main:app --reload      # or server.bat, from the repo root
```

Then browse to http://127.0.0.1:8000. The server just serves `frontend/dist`; rebuild the
frontend (`npm run build`) after changing frontend code.

## Deploying

This project's own deployment is the static build published to Firebase Hosting at
https://domino-designer.web.app. Nothing server-side goes with it — `server/` exists for running
the built frontend locally, not in the cloud. It needs the Firebase CLI
(`npm install -g firebase-tools`) and a one-time `firebase login`.

```
deploy.bat                            # the live site; refuses if the working tree is dirty
deploy.bat preview                    # a temporary URL, expiring in 7 days
deploy.bat preview -Project my-proj   # ...to your own Google Cloud project instead
```

`.firebaserc` names the project published to; `-Project` overrides it, so a fork never has to edit
a tracked file. Any other host can serve this build just as well, and needs the same three things
`firebase.json` asks for: serve `frontend/dist` at the site root, send `index.html` with
`Cache-Control: no-cache`, and send `/assets/**` as immutable — those filenames carry a content
hash, so a given one never changes meaning, while a cached `index.html` would go on asking for a
bundle that no longer exists.

## What v1 does

### Two main screens

- **Domino Inventory** screen — a catalog of the domino colors available to build with (color,
  material, finish, brand, shortcut, stock count), each toggleable active/inactive.
- **Designer** — a 2D three.js canvas (1 unit = 1 mm) showing the build plane, with
  mouse-wheel (and toolbar button) zoom and right-drag pan. The build's contents are a hierarchy of **DDObjects**
  rooted at the build plane, shown in a left sidebar as a live tree (type icon + name) that
  updates as objects are created.

NOTE WELL: Nothing is persisted today; every load starts a fresh default project.

### The Domino Designer

- **New Element** tool - allows dragging a rectangle on the plane to
  place a new domino element. Only "Domino Field" is currently available; each element draws its own dominoes as an R3F instanced mesh with
  line-segment edge outlines. 
- **Select** Tool to select an element to move it or drag its handles to resize:
        - Resizing adds and removes whole rows and columns around a fixed point rather than
  stretching the dominoes, so the dominoes you already have — and the colors on them —
  stay exactly where they are no matter which edge you drag. 
- **Hierarchical List of Build Elements** for selecting elements
    NOTE:  The only element type available currently is a field.
    -  Each element in the list has **⋯** (hover over) menu:
        -  **Delete** - remove the element entirely (undoable)
        -  **Properties** - Edits the properties (size, spacing)
        -  **Edit Colors** - Allows you to edit the colors of the element (same as double-clicking the element)
        -  **Print Layout** - Allows you to print out the layout of the element
            -  With many options to control how many rows/columns show per page
        -  **Print Sort Plan** - Prints the run-length sort plan
        -  **Export CSV** - Exports the build plan as a CSV to be used elsewhere

### Domino Editing Mode

Domino editing mode is for editing the colors and the hide/unhide status of individual dominoes within a build element.

Double-click the element (on the build plane or in the sidebar) to enter domino editing mode for the dominoes in that element.

- **Color Swatches** - The inventory colors appear as a grid of swatches in the sidebar in place of the
  object hierarchy
- **Selecting** — There are many, many ways to select dominoes in build editing mode
    -  **Simple Clicks** for individual domino operations:  click to select, Ctrl+click to add to selection, ALT+click to remove
    -  **Simple Rectangle Drag** to select simple rectangular regions, CTRL-drag to add to selection, ALT-drag to remove from selection
    -  **Arrow Keys** to move the selection from domino to domino, SHIFT-Arrow to extend/shrink a previous rectangular drag
    -  **Select All** with CTRL-A or the toolbar button
    -  **Invert Selection** with the toolbar button
    -  **Selecting with a shape** — a variety of fun selection shapes are available:
        - **circle by radius** - Drawn from the centre out
        - **circle by diameter** - Drawn from one side to the other
        - **oval** - Drag across one axis then click to specify the width
        - **triangle** - Drag along to specify two corners, then click to specify the third
        - **angled rectangle** - Drag along one side, then click to specify length and width
    -  **Selecting by Color** - Every color in the color-swatch sidebar has a menu with selection options:
        -  Select all of color
        -  Add all dominoes with the color to the selection
        -  De-select all of color
        -  De-select others (anything not of the color)

- **Setting Colors** - Select the dominoes you want, then choose a color
    - **Choosing Colors** - Can be done by clicking on a color swatch or typing the color's shortcut combination
    - **Unassigned** - dominoes not assigned to colors are "unassigned". Use the Backspace key to clear the colors for selected dominoes
    - **Hidden** - dominoes can be hidden from the build. Use the DEL key to hide dominoes
        -  Hidden dominoes can still be selected so they can be unhidden or assigned to colors (automatically also unhides them) 

- **Painting Colors** — freehand, as an alternative to selecting first. Pick a brush from the
  toolbar, choose its size from the same button's menu, click a color swatch to load it, then
  drag across the field to paint as you go. The whole stroke is a single undo step.
    -  **Circle** — a round nib, for filling and for dabbing single dominoes
    -  **Bar** — a thin nib fixed at 45°, which gives thick and thin strokes depending on which
       way you draw, for lettering and anything calligraphic
    -  Loading **Hide** or **Unassigned** into a brush instead of a color turns it into an eraser

Getting out of Domino Editing Mode:

  - **Done** keeps the session's work on the undo stack; 
  - **Cancel** discards all of it and puts the build element back exactly as it was on entry.

Other Features:

- **Expand** — a toolbar toggle that draws every domino at the full size of the space it sits
    in, so tightly-spaced dominoes are easier to click.
        - Note that it changes only the drawing, and resets
    when you leave the mode.
- **Copying and pasting colors**
    - **Ctrl+C** copies the selected dominoes' colors
    - **Ctrl+X** copies and immediately clears them to unassigned
    - **Ctrl+V** pastes onto the current selection.
        - **Paste onto Single Domino** - Copies the domino colors onto the destination, using the single domino as the starting point
        - **Paste onto Smaller Selection** - When pasting into a smaller selection, dominoes which don't fit are simply skipped
        - **Paste onto larger selection / Tiling Colors** - Pasting domino colors into a destination selection which is larger will automatically tile the original pattern into the larger selection
    -  **Works across elements** - You can copy colors, leave domino editing mode, then go edit the colors of a different element on the build plane and click "paste"

### Image Mapping

Clicking the image toolbar allows you to upload an image.
-  Once uploaded, you can scale it and move it over your dominoes
-  The image toolbar contains many sub-commands:
    -  **Transparency** - Chooses how transparent the image is
    -  **Resize and move** - To change how the image maps onto your dominoes
        -  Use the corner handles to resize and preserve aspect ratio
        -  Use the side handles to squeeze the image
        -  Click on the image itself to move it
    -  **Hide** - Hides/Unhides the image
    -  **Show Over** - Displays the image over ALL dominoes vs just over the unassigned dominoes
    -  **Reset Size** - Resets any sizing changes to show the full image as uploaded
    -  **New Image...** - Allows you to choose a new image
    -  **Delete** - Removes the image entirely
- Mapping Images:
    -  Choosing **Map Image Colors** will automatically choose domino colors
    -  There are several sampling, color distance, and dithering choices to choose from
    -  Other options include:
        -  **Dither Strength** - How much to apply dithering to 
        -  **Use Colors** - Choose which colors from your inventory to use when color matching

Note 1:  Map Image Colors currently does not pay attention to the number of dominoes in your inventory
Note 2:  Showing a transparent image over your dominoes allows you to set domino colors manually to the image. Like tracing paper. :-)

### Undo / Redo

Undo/Redo covers both DDObject-level edits (create/delete/move/resize/properties) and domino color changes, hiding included, on one shared history — undoing a color change works even after leaving domino editing mode, and editing or deleting an inventory color's RGB immediately updates every domino painted with it.

A picture's placement — adding, moving, resizing, replacing and deleting one — is undoable too, but only for as long as you are editing that element's dominoes. Pressing **Done** clears those steps out of the history: a picture is only ever drawn inside domino editing mode, so an undo from outside it would have nothing visible to show for itself.

## License

MIT — see [LICENSE](LICENSE). Use it, change it, build with it; just keep the copyright notice.

