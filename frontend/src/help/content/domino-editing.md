[Home](home) > [Build Designer](designer) > Editing Dominoes

# Editing dominoes

In this mode you can edit domino colors and hide dominoes from the build. This includes:

-  Methods and shapes for selecting and de-selecting dominoes
-  Browsing all available (e.g. "active") domino colors from your inventory
-  Applying colors to selected dominoes
-  Cut, Copy & paste of domino colors
   -  Including fun ways to tile domino color patterns
-  Undo / redo to return to previous domino colors
-  The ability to "hide" or "unhide" dominoes from the build
    -  Hidden dominoes will not be included in the build output
-  [Laying an image over the dominoes](using-an-image) to trace over by hand
-  [Mapping an image](image-mapping) onto the dominoes to set their colors automatically

To leave domino editing mode:

-  Click the [Done] button at the top of the build plane window
    .  This saves all your edits
-  Click [Cancel]
    .  This abandons all your edits
    .  Note:  Cancel is un-doable! You will lose all your edits, permanently

## The sidebar of color swatches

The sidebar shows all active domino colors from your inventory.

Note that each color swatch also contains a pop-up menu of options for selecting dominoes by color. See below for more information.

### Setting domino colors - The Basic Method

First, select some dominoes and then use one of the methods below to set the color of the selected dominoes:

1.  Click on a color swatch
    -  The dominoes will be set to that swatch's color
    -  The swatch also becomes your **selected color** - see below

2.  Type the "shortcut" key combination shown on the color swatch
    -  For example, if the blue color swatch shows a "B", then typing "B" will change the color of the selected dominoes to blue
    -  This picks the swatch exactly as clicking it does, including making it your selected color
    -  See "Details on shortcut keys" below for more information

3.  Cut & paste colors from someplace else

### The selected color

Whenever you pick a color - by clicking its swatch or by typing its shortcut - that swatch
stays outlined in blue. That is the **selected color**, and it is what the paint brushes
paint with.

A few things worth knowing:

-  One click does both jobs. It colors whatever dominoes are selected right now, *and* it
   becomes the selected color. There is nothing extra to do to pick up a color for a brush.
-  Clicking the same swatch again does not un-pick it. To change color, click a different
   swatch.
-  The selected color stays put. ESC does not clear it, and neither does picking up a
   brush, so you can choose a color once and keep painting with it. It is cleared only when
   you leave domino editing mode.
-  **Hide** and **Unassigned** can be the selected color too, which is what turns a brush
   into an eraser - see *Hidden and Unassigned Dominoes* below. The **Delete** and
   **Backspace** keys are simply those two swatches on the keyboard, and behave exactly as
   clicking them does, selected color included.
-  Swatches press in like a physical button when you use them - held down under the mouse,
   or a quick flash when you use a shortcut key. That is there so a click still looks like it
   landed even when nothing on the build plane changes, for example re-applying red to
   dominoes that are already red.
-  This all works the same with a paint brush in hand. Picking a color colors whatever is
   selected *and* loads the brush, exactly as it does otherwise.

Selecting dominoes never changes their color on its own. Only clicking a swatch, typing a
shortcut, pasting, or dragging a brush does that.

### Details on shorcut keys

Shortcut keys allow you to quickly set a domino color by typing the key combination associated with the color.

Type keys until there is only a single color that can match, and that will immediately set the color. Use "space" to select a shorter key combination.

For example, if there are the following colors:
- Simple Blue = "B"
- Sky Blue = "B1"
- Dark Blue = "B2"

Typing "B1" will immediate set the color to Sky Blue.
Typing "B2" will immediately set the color to Dark Blue.
Typing "B" followed by "Space" will set the color to Simple Blue.

Typing "B" by itself will not set a color (it is waiting for either "1", "2" or a space).

Example 2:  If there are the following colors:
-  Purple = "P"

If no other color starts with "P", then typing "P" will immediately set the color to purple (no space bar is required).

## Selecting Dominoes

Selected dominoes are outlined in white.

There are a lot of different ways to select dominoes:
-  By using arrow keys
-  By color
-  By region or shape

For many of these methods, two key combinations are common:
-  Use **CTRL** to _add_ more dominoes to an existing selection
-  Use **ALT** to _remove_ dominoes from an existing selection

### Selecting single dominoes

-  **Click** - To select a single domino (deselect any already selected)
-  **CTRL - Click** - To add a single domino to the selection set

### Selecting dominoes with arrow keys

Once a domino is selected, you can use the arrow keys:

-  **Simple arrow keys** (left, right, up, down) selects the domino in the specified direction
    -  All other dominoes are de-selected

-  **SHIFT-<arrow>** extends or shrinks the selection in the specified direction
    -  Note:  This only works reliably for single dominoes or a simple rectangular selection

### Selecting dominoes by region or shape

There are multiple ways to select regions of dominoes by shape.

For all of these methods, there are three modes:

-  **Click & drag** - To select a new region of dominoes (deselect any already selected)
-  **CTRL - Click & Drag** - To add a region of dominoes to the existing selection
-  **ALT - Click & Drag** - To remove a region of dominoes from the existing selection

#### Different shapes to select

There are many different shapes that can be selected. These can be selected with the toolbar buttons at the top of the domino editor.

Remember:  All of these methods *start* with *Click & Drag*.

-  **Simple, flat rectangles**
    -  Click and drag to select a rectangular range of dominoes
-  **Circle by radius**
    -  Click and drag from the center of the circle to the perimiter
-  **Circle by diameter**
    -  Click and drag from one side of the circle to the other
-  **Oval**
    -  Click & Drag to from one side of the oval to the other to define the main axis
    -  THEN:  Click to determine the width of the oval's perpendicular axis
-  **Triangle**
    -  Click & Drag to define one side of the triangle
    -  THEN:  Click to determine the final point point of the triangle
-  **Angled rectangle**
    -  Click & Drag to define one side of the rectangle (can be at any angle)
    -  THEN:  Click to determine the final width and length of the rectangle

### Selecting dominoes by color

Each of the color swatches has a menu which allows for dominoes to be selected by color. These menus contain the following options:

-  **Select** - Select all dominoes of the specified color. Any prior selected dominoes are deselected.
-  **Add Select** - Adds all dominoes of the specified color to the selection set.
-  **Deselect** - All dominoes of the specified color are removed from the selection set.
-  **Deselect Others** - All selected dominoes which are NOT of the specified color are removed from the selection set.
    -  This is the intersection of the existing selected dominoes and the dominoes of the specificed color.

Some ideas on how to use these features:

-  Change colors
    .  For exampe:  Select all Yellow dominoes and change them to orange
-  Set the background color
    .  For example: Select all "unassigned" dominoes and change their color
-  Select patches of color
    .  Select a rectangular section of dominoes which contains the color patch
    .  Use "Deselect others" to retain only the patch
-  Replacing solid colors with a pattern
    .  Create a pattern and use the "Copy" feature to copy it
    .  Select all of a specific color
    .  Use "Paste" to paste the pattern over that color
-  To merge / replace multiple colors
    .  Use "Add Select" for each color that is to be merged
    .  Click on the new color

### Select All / Select None / Invert Selection

-  **Select all dominoes** - Use CTRL-A or the "Select All" toolbar button
-  **Clear all selections** - Press ESC or click someplace empty on the build plane
-  **Invert selection** - Press the "Invert Selection" toolbar button
    -  Selected dominoes become de-selected and vice-versa


## Painting with the Circle and Bar brushes

The two paint brushes at the right-hand end of the toolbar are freehand painting tools.
Instead of selecting dominoes and then choosing a color, you drag a small shape across the
build plane and the dominoes it passes over are painted as you go - just like a brush in a
drawing program.

**Both brushes paint the selected color** (see *The selected color* above). If you have
not chosen one yet, the brush shows nothing and paints nothing, and the hint bar says so;
click any swatch and it comes to life. Because the two special swatches can be selected
too, choosing **Hide** turns a brush into an eraser that hides dominoes, and choosing
**Unassigned** turns it into one that clears them back to unpainted.

The two differ only in the shape of the nib:

- **Circle** - paints the same width whichever way you drag.
- **Bar** - a thin bar held at an angle, running from lower-left to upper-right. Drag
  *along* that angle and you leave a hairline; drag *across* it and you leave a broad
  mark. This is how a real calligraphy pen behaves.

### Choosing a brush and its size

Each brush is a single toolbar button, and the icon on it *is* the nib at the size
currently chosen - so you can see which size you are holding without opening anything.
**Clicking the button opens that brush's size menu**, and picking Small, Medium or Large
from the menu is what picks up the brush.

The two brushes do not use the same measurements, because they do not stay useful over
the same range:

- **Circle** - Small 20mm, Medium 60mm, Large 120mm, measured across the circle. Small is
  roughly one domino, which is the size to reach for when placing single dominoes.
- **Bar** - Small 60mm, Medium 100mm, Large 140mm, measured along the nib's *length*.
  Its width never changes, which is what keeps the thick/thin contrast at every size -
  and it is also why the bar starts at 60 rather than 20. A nib barely longer than it
  is wide is just a blob, with no angle left to draw with.

Clicking a brush you are already holding just reopens the menu, so you can change size
without putting the brush down. As with every other tool in this toolbar, the way to put
it down is to pick up a different tool - a shape, or plain Rectangle select - or to press
ESC.

### How painting works

1. **Pick up the brush**, by choosing a size from its menu. Your selected color is kept, so
   a brush picked up after choosing one is ready to paint immediately. Anything you had
   selected is kept too - see *Selecting dominoes while painting* below.
2. **Hover.** Move the pointer over the build plane and you will see a faint shape
   following it, with no outline. The dominoes underneath it are outlined in white to
   show what you *would* paint. Nothing is changed yet.
3. **Press and drag.** The shape gains a white outline, and every domino it passes over
   is painted with the selected color immediately.
4. **Release.** The stroke is finished.

To change color part-way through a drawing, click another swatch or type its shortcut -
the brush stays in your hand either way.

### Selecting dominoes while painting

Selecting still works normally with a brush in hand - Ctrl+A, Invert, and the Select
commands in each swatch's menu all do what they always do, and what you select **stays**
selected while you move the pointer around. Clicking a swatch or typing a shortcut colors
it, just as anywhere else.

So the quickest way to start over is **Ctrl+A** then **Backspace**.

Two things to know:

-  **Pressing the mouse to paint clears the selection.** That is the moment the brush takes
   over: from then on only what the nib passes over gets painted.
-  **Selected dominoes and the dominoes under the nib are both outlined in white**, so with
   a selection standing you cannot tell them apart. If you want to see exactly what the
   brush would hit, clear the selection first (press ESC).

One thing that can surprise you: if dominoes are selected and you click a swatch just to
load the brush with a color, that click *also* colors the selection - because that is what
clicking a swatch means everywhere. Press ESC first if you did not want that.

### Undoing a stroke

**A whole stroke undoes as one step.** However many dominoes you painted between pressing
and releasing, a single Ctrl+Z takes them all back - individual dominoes within a stroke
cannot be undone separately.

If you change your mind part-way through, **press ESC before releasing the mouse**. Every
domino painted since you pressed goes back to the color it had, the tool leaves painting
mode, and nothing is recorded in the undo history at all.

## Copying and pasting colors

Colors can be copied from one group of dominoes to another, including between two
different fields from your build plane.

- **Ctrl+C**: copy the selected dominoes' colors.
- **Ctrl+X**: copy them and then clear them to "unassigned"
- **Ctrl+V**: paste onto the current selection.

There are two ways to paste selected dominoes:

- **Paste onto a single, selected domino**
    - The copied pattern is pasted starting at the selected domino as its upper-left hand corner.
    -  Any dominoes that would fall of the edge of the field are left out
- **Paste into a selected set of dominoes**
    -  The entire set of selected dominoes (and only the selected dominoes) will be filled with copied domino colors
    -  *If the new region is smaller* - dominoes from the copy buffer that don't fit are simply left out
    -  *If the new region is bigger* - The copied domino color pattern is repeated, from left to right and top to bottom, until all of the destination dominoes are filled out

**This is super cool** - You can paste a small set of copied dominoes into a large field, and *your pattern will be repeated*, over and over!
-  It's a great way to "tile" domino patterns across your field

## Miscellaneous Topics

### ESC handling

Press the "ESC" key, repeatedly, to return the system to its default state. 

Pressing ESC multiple times will (in order):

1. Cancel any range (click-drag) or shape selection which is in-progress, or any paint
   stroke in progress
    -  If your shape is not looking like you want, use ESC to cancel it so you can try again
    -  A cancelled paint stroke puts back every domino it had painted
2. De-select all dominoes
    -  This works with a paint brush in hand too, and is how you clear a selection so you
       can see exactly what the nib would paint
3. Return to the default simple Rectangle selection mode, putting away any paint brush
4. Clear any partly-typed color shortcut

ESC deliberately never changes your **selected color**. It is a choice rather than a mode,
and it paints nothing on its own - taking it away would only leave a brush inert for no
visible reason. Click a different swatch to change it, or leave domino editing mode
(Done or Cancel) to clear it.

### Hidden and Unassigned Dominoes

Two special swatches exist at the top of the sidebar for hidden and unassigned dominoes:

-  **Unassigned** - These are dominoes not assigned to a color
    -  All dominoes start as "unassigned"
    -  Pressing "Backspace" will remove color from any selected dominoes and return them to "unassigned"
-  **Hidden** - These are hidden dominoes (as if they were not part of the build)
    -  Hidden dominoes do not show up at all
    -  They will be removed from exported build plans
    -  NOTE:  Hidden dominoes can still be selected
        -  When selected and unhidden, they return to their original color
        -  When selected and set to a color, they are automatically unhidden

How to hide dominoes:
1.  Select some dominoes then:
2.  Press DEL to hide them, OR
        -  Click on the "Hide" color swatch in the left hand sidebar
        -  These are the same thing: DEL and Backspace are the "Hide" and "Unassigned"
           swatches on the keyboard, so each also becomes your selected color, which is how
           a paint brush is turned into an eraser

How to un-hide dominoes:
1.  Select some hidden dominoes by either:
       -  Using the "Select" menu command in the "Hide" color swatch, OR
       -  Selecting hidden dominoes where they were originally located
2.  Choose the "Unhide" menu command from the "Hide" color swatch menu

### Expanded Domino Mode

There is a toolbar button (it looks like two arrows facing away from each other) which expands the dominoes so there are no gaps.

-  This makes it easier to select and edit domino colors in domino-editing mode
-  It does not actually change the size of the dominoes in the build
-  Click it again to return to normal domino size

### Undo / Redo

Domino color changes can be undone / redone using the Undo and Redo commands (CTRL-Z / CTRL-Y) or the toolbar buttons at the upper right.

Two notes:
- Domino selections can NOT be undone or redone.
- The current undo stack is 100 changes (this may be increased and/or made configurable in the future)
    -  Changes beyond 100 can not be undone
    -  So, setting the color of 100 single dominoes individually, say, would exceed the stack

---

[Home](home)





