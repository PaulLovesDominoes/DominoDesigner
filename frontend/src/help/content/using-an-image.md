[Home](home) > [Build Designer](designer) > [Editing Dominoes](domino-editing) > Using an Image

# Using an image

You can lay a picture over an element while you work on it. There are two quite different reasons to want one, and DominoDesigner keeps them apart:

-  **As tracing paper.** The picture sits under your dominoes, and you draw over it by hand with the selection shapes and the paint brushes. This is how you get a logo or a piece of lettering into dominoes with control over every one. All your normal tools keep working.
-  **As a source of colors.** DominoDesigner looks at the picture and picks the closest inventory color for each domino, automatically. That is [image color mapping](image-mapping), and it is a mode of its own.

The same picture does both, so you can trace part of an image by hand and let the mapping fill in the rest.

## The image button

The picture button sits in the toolbar just to the right of the Expand button, whenever you are [editing dominoes](domino-editing). Next to it is a small arrow that opens the image menu.

**The button itself** does the thing you want most often:

-  With no picture loaded, it asks you for one.
-  With a picture loaded, it hides and shows it.

**Ctrl+I** does exactly the same as the button, without reaching for the mouse. It is worth learning: while tracing you will want the picture out of the way every few minutes to see how the dominoes look on their own, and back again straight after.

## The image menu

The arrow beside the button opens everything else.

**New Image** asks you for a picture file. PNG, JPEG, WebP, GIF and BMP all work.

The picture is placed so that it covers the whole element, keeping its own proportions — so it will usually hang off two of the edges.

Each element can have one picture at a time, and each element has its own. Loading a second one over the top replaces the first, and you will be asked before that happens.

> The picture is only held in this browser tab. Nothing in DominoDesigner is saved between visits yet, so reloading the page loses it — along with everything else in your build.

**Transparency** is a slider at the top of the menu. It fades the picture, which usually makes it *easier* to line up against a grid, not harder, because you can see both at once. The menu stays open while you drag it so you can watch the result.

Transparency is only about what you can see. It makes no difference to the colors that mapping chooses.

**Resize and Move** puts handles on the picture — see below.

**Hide / Unhide** is the same as clicking the button, and takes the picture off the screen without forgetting it or where you put it.

**Image Over / Image Under** decides what the picture covers.

-  **Under** — the starting position — puts the picture behind every domino you have given a color, and in front of the ones you have not. This is the useful one while you work, whichever job you are doing: your colors appear against the picture as you go, and the parts you have not reached yet still show the picture underneath.
-  **Over** floats the picture above everything, so you can see it whole.

**Reset Size** puts the picture back to the size it arrived at, at its own proportions, without moving it, and shows it if it was hidden. Use it after a side handle has stretched the picture out of shape — it is the only way back.

**Map Image Colors** opens the color mapping panel. That is a mode, and it is covered in [its own topic](image-mapping).

**Delete** removes the picture, and it is the only thing that does — there is no key for it, so a picture cannot be lost to a stray keypress. Unlike most things, this one *can* be undone: Ctrl+Z brings the picture straight back where it was. If the picture was hidden at the time, it comes back showing, so you can see what you got.

## Moving and resizing

Choose **Resize and Move** from the menu to put handles on the picture. It is deliberately the only way in: clicking the picture on the build plane does nothing, so that a stray click while you are painting can never pick the picture up by accident.

While the handles are on, dominoes cannot be edited — the picture has the canvas. With the handles on you can:

-  Drag a **corner** handle to make the picture bigger or smaller. The proportions are kept, so the picture is never squashed.
-  Drag a **side** handle to stretch the picture in that direction only. The proportions are *not* kept — use this to fit a picture to a differently shaped element.
-  Drag the **middle** of the picture to move it.

To finish and get your domino tools back: press **Esc**, click anywhere away from the picture, or pick Resize and Move again.

The picture is free to hang off the element and off the build plane. Nothing is clipped, so you can push most of a picture out of the way and use just the part you want. You can zoom out well past the build plane to reach a picture you have dragged a long way off it.

Moving and resizing go into the undo history, so **Ctrl+Z** puts a picture back where it was if you nudge it by accident. Pressing Esc part-way through a drag does the same thing straight away.

That history is kept only while you are editing this element's dominoes. Pressing **Done** clears every image step out of it — the picture stays exactly where you left it, but Ctrl+Z will no longer walk back through how it got there. Nothing an undo does would be visible from outside the mode anyway, since that is the only place a picture is drawn.

## Tracing by hand

This is what the picture is for when you are not mapping colors, and it needs nothing special switched on. Load a picture, leave it **Under**, and use your ordinary tools:

-  The [selection shapes](domino-editing) — circles, ovals, triangles, angled rectangles — are unexpectedly good at this. Most logos are built out of exactly these shapes, and a shape selection snapped to the grid gives you a cleaner edge than freehand ever will.
-  The paint brushes follow the picture for lettering and for anything irregular.
-  Turn **Expand** on to see the dominoes tile edge to edge, which makes it much easier to judge where an edge really falls.

As you color dominoes they cover the picture, so what is left showing is exactly what you have not done yet. Hide the picture with Ctrl+I now and then to see the build on its own.

## What is remembered

The picture, where you put it, and its transparency and layer settings all survive clicking **Done** in domino editing. Come back to the same element and it will be waiting where you left it.

Clicking **Cancel** in domino editing throws the picture away along with your color edits, since that returns the element to how it was when you started.

Adding, deleting, moving and resizing a picture are all undoable. Hiding it, fading it and changing its layer are not — those are just ways of looking at it, and cluttering the undo history with them would bury the edits you actually want back.
