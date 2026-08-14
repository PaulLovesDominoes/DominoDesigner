[Home](home) > [Build Designer](designer) > [Editing Dominoes](domino-editing) > Mapping an Image

# Mapping an image

Image mapping lays a picture over your dominoes and then picks, for each one, the closest color you have in your [domino inventory](home). It is a fast way to turn a photo or a piece of artwork into a build.

Image mapping is a mode inside [domino editing](domino-editing). Click the picture button in the toolbar — just to the right of the Expand button — to switch it on, and click it again to switch it off.

While image mapping is on, the rest of the domino editing tools are switched off and shown greyed out: selection, the shapes, the paint brushes, and the color swatches. This is deliberate. Placing a picture takes several steps, and having a stray click paint a domino part-way through would be very easy to do by accident. Everything comes back the moment you leave image mapping.

The one exception is the **Expand** button, which stays usable. It only changes how big the dominoes are *drawn*, and lining a picture up against the grid is easier when they tile edge to edge. It makes no difference to the colors that get chosen.

## The image panel

A new panel appears at the top of the sidebar, above the color swatches. It has four buttons in a row, then a transparency slider, the settings that decide how colors are chosen, and the Map Colors and Clear buttons.

**New Image** asks you for a picture file. PNG, JPEG, WebP, GIF and BMP all work.

The picture is placed so that it covers the whole element, keeping its own proportions — so it will usually hang off two of the edges. It arrives already selected, ready to be moved and resized.

Each element can have one picture at a time. Loading a second one replaces the first, and you will be asked before that happens.

> The picture is only held in this browser tab. Nothing in DominoDesigner is saved between visits yet, so reloading the page loses it — along with everything else in your build.

**Select** turns the picture's handles on and off. You can also just **click the picture on the build plane** to select it — and dragging straight away moves it, so selecting and moving are one gesture. Clicking anywhere away from the picture puts the handles away again, as does Escape.

With the handles on you can:

-  Drag a **corner** handle to make the picture bigger or smaller. The proportions are kept, so the picture is never squashed.
-  Drag a **side** handle to stretch the picture in that direction only. The proportions are *not* kept — use this when you want to fit a picture to a differently shaped element.
-  Drag the **middle** of the picture to move it.

The picture is free to hang off the element and off the build plane. Nothing is clipped, so you can push most of a picture out of the way and map just the part you want. You can zoom out well past the build plane to reach a picture you have dragged a long way off it.

Clicking Select again puts the handles away. So does clicking any other control in the panel.

**Pressing DEL with the picture selected removes it.** That is the only way to get rid of a picture without loading another over the top of it. Note it cannot be undone — nothing about a picture's position or settings goes into the undo history.

**Above / Below** decides what the picture covers.

-  **Below** — the starting position — puts the picture behind every domino you have already given a color, and in front of the ones you have not. This is the useful one while you work: you can watch your colors appear against the picture as you go.
-  **Above** floats the picture over everything, so you can see it whole and line it up.

**Show / Hide** takes the picture off the screen without forgetting it or where you put it. Handy for a quick look at how the dominoes are coming along on their own.

## Transparency

The slider fades the picture. A half-faded picture is often easier to line up against a grid than a solid one, because you can see both at once.

Transparency is only about what you can see. It makes no difference to the colors that Map Colors chooses.

## Sampling

Each domino covers a small patch of the picture — usually a few dozen pixels — and this chooses how that patch is boiled down to the one color the domino will be matched against.

-  **Average** blends the whole patch together. Fine detail then comes out as the color that area really reads as, rather than as speckle. **Use this for photographs.**

-  **Dominant** takes the most common color in the patch and ignores the rest. **Use this for flat artwork** — logos, icons, diagrams, anything drawn in solid areas of color.

-  **Dominant, merged buckets** is the same idea, made harder to fool. Try it when Dominant leaves the odd stray domino in the middle of a region that ought to be one flat color — see below.

The difference matters more than it sounds, because of anti-aliasing. Artwork is drawn with a fringe of in-between pixels along every edge so that it looks smooth on screen. When a domino's patch straddles such an edge, Average blends the two sides together and produces a color that is in neither of them — so a boundary between orange and white comes out as a row of yellow dominoes, and a boundary between purple and white as a row of pink. Those colors are nowhere in your picture. The same thing happens even without anti-aliasing wherever an edge falls part-way across a domino.

Dominant has no such problem: the blended pixels are always outnumbered by the solid ones on the majority side, so they are simply outvoted and the edge lands crisply on one color or the other.

Used on a photograph either of them will look wrong, and for the same reason in reverse — no color has a real majority in a patch of photograph, so the winner is close to arbitrary and neighbouring dominoes jump about. That is what Average is for.

> A rule of thumb: if your picture would still look right saved as a GIF, use one of the Dominant settings. If it needs to be a JPEG, use Average.

### Why there are two Dominant settings

To find the most common color, DominoDesigner has to treat colors that are very slightly different as the same one — otherwise a photograph or a JPEG, where no two pixels are exactly alike, would have every color tied at one vote. It does that by sorting colors into a grid of small ranges and counting how full each one is.

That works, but the grid has fixed edges, and a color that happens to sit right on one has its pixels split between two ranges, each getting half the count. A smaller but better-placed pile can then win, and the domino comes out a color that covered only a fraction of its patch. From the outside it looks like a stray domino or two in the middle of a flat band — and moving the picture by a fraction of a domino makes them appear somewhere else, because different pixels fall into each patch.

**Dominant, merged buckets** counts ranges that sit next to each other as one pile, so a color split across an edge is put back together. Nothing is blurred: only ranges that actually contain pixels are ever joined, and neighbouring ranges are far closer together than any two colors in your inventory.

It costs a little more, and on perfectly clean artwork the two give identical results. Reach for it when plain Dominant gives you strays.

## Color Distance

This chooses how "closest color" is decided. Different answers suit different pictures, so it is worth trying more than one on the same image — and since mapping the same dominoes again simply replaces the previous result, comparing them costs nothing.

-  **Weighted RGB** compares the red, green and blue amounts directly, counting green the most and red the least, roughly matching how sensitive the eye is to each. Quick and good on flat, graphic artwork.

-  **Perceptual (OKLab)** — the starting choice, and the right one for most pictures. It converts both the picture and your inventory colors into a color space built so that an equal distance really does look like an equal difference, then simply takes the nearest. Much better than Weighted RGB on photographs and on anything with rich color, where Weighted RGB can pick a shade that is numerically close but visibly wrong.

-  **Perceptual (CIELAB)** is the older space that does the same job, and mostly agrees with OKLab. Where they part company is the deep blues and violets: CIELAB drifts towards purple as a blue darkens, so it can pick a shade a person would not have. Worth trying against OKLab on a picture with a lot of shadow, since which one wins is sometimes a matter of taste.

-  **Value-weighted** counts light and dark for more than color. When your inventory forces a compromise, it gives up some color accuracy to keep the picture's light-and-dark structure intact. This is the one to reach for on **paintings**, which build their shapes out of light and shade rather than out of hue — and it suits a domino build generally, since from across a room the eye reads the pattern of light and dark long before it reads the colors. The cost is real: skin tones and anything else where the hue carries the meaning will drift.

-  **Greyscale** uses only the black, white and grey dominoes in your inventory, matching each patch of the picture on lightness alone. If you have no greys marked active, it will tell you so and change nothing.

Only colors marked **active** in your inventory are ever used.

## Dither

Dithering is the second choice, and it does something different from the first. Color Distance decides which inventory color is nearest; dithering shifts each domino's color a little *before* that question is asked.

The problem it solves is banding. Your inventory holds a few dozen colors and a photograph holds millions, so a smooth gradient across a field snaps to one color, then abruptly to the next, and the steps show up as stripes. Shifting each domino up or down makes the dominoes near a boundary fall on either side of it, so the two colors interleave and your eye blends them into the shade in between. Each domino is a little less accurate; the picture as a whole gains a great deal.

There are two kinds on offer, and they go about it in completely different ways.

### Pattern dithers

These lay a fixed texture over the field, the same one every time regardless of the picture. Quick, entirely predictable, and the texture is part of the look.

-  **None** — no shifting at all. Fine on flat artwork, and the place to start if you are not sure.
-  **Bayer 4x4** lays down a regular crosshatch that repeats every four dominoes. Tighter than the 8x8, and the pattern shows plainly enough in the finished build to be worth using as an effect in its own right.
-  **Bayer 8x8** is the same crosshatch four times the size. It blends far more finely, so gradients come out smoother, at the price of a pattern too long to read as a weave.
-  **Random** scatters the shift instead of patterning it — grain rather than crosshatch. Less tidy, but it never competes with the shapes in your picture the way a regular pattern can.

> A pattern dither works on the domino grid, not on the picture, so the crosshatch is a rectangle rather than a square — a domino's spacing across is not the same as its spacing up.

### Error diffusion

These work the other way round. Instead of following a pattern, each domino is compared with the color the picture actually asked for, and whatever it fell short by is handed to the dominoes next to it, so that one of *them* gets pushed over the line to make up the difference. Nothing is laid over the picture, so there is no weave or crosshatch to see — the grain follows the detail in the image. And because the shortfall is measured rather than invented, a color your inventory does not hold can be suggested by a mixture of ones it does: red and blue dominoes side by side, read at a distance, give you the purple you asked for.

-  **Floyd–Steinberg** passes on all of the shortfall. The most faithful on average — over any area, the colors asked for and the colors given add up to the same total.
-  **Atkinson** passes on three quarters of it and lets the rest go. That sounds worse and frequently looks better, especially with only a few colors active: whites stay white, blacks stay black, and edges keep their snap. Floyd–Steinberg, having to place every last bit of shortfall somewhere, can drag one it will never settle across a wide area and take the extremes off a picture in the process.

Which of the two suits a build is a matter of taste and of how many colors you have. The fewer there are, the more often Atkinson wins. Try both — they cost nothing to compare.

> Error diffusion stops at the edge of anything it is not coloring. A region you painted by hand is left alone, and the grain restarts cleanly on the far side of it rather than smearing out around it.

### Dither Strength

This sets how much of the effect you get, and it means the natural thing in either kind: for a pattern it is how far each domino is shifted, and for the two diffusing ones it is how much of the shortfall gets passed on. At 0% both do nothing whatever, exactly the same as None.

For a pattern, how far full strength actually is depends on your inventory, and DominoDesigner works that out for itself each time you press Map Colors. With only black and white to choose from, a domino has to be pushed a long way to land on the other one, so the shift is large. With forty colors the neighbours are close together and the same push would send a domino several colors away from the one the picture asked for, so the shift is small. At full strength it is always half the distance to the neighbouring color — far enough to cross the line where the picture is close to it, never far enough to skip past a color entirely.

So there is no need to re-tune this when you change your inventory or your Color Distance setting. Turn it down when the effect is more visible than you want.

Nothing here uses chance, so mapping the same picture twice with the same settings always gives you the same field. That is what makes it possible to compare two settings honestly.

## Which dominoes get colored

**The moment you switch image mapping on, DominoDesigner notes which dominoes have no color yet. Those are the ones every Map Colors in this session will fill, and it will never touch any other.**

That one rule is worth understanding, because everything else here follows from it:

-  Dominoes you colored by hand are safe. They were not blank when you switched the mode on, so they are not on the list, and no amount of mapping will overwrite them. Hidden dominoes are safe for the same reason.
-  Pressing Map Colors again always replaces the previous result rather than adding to it. So you can change the Color Distance or the Dither setting and press it again as often as you like, comparing results, without undoing anything in between.
-  **Leaving image mapping and coming back makes the current result permanent.** Those dominoes have real colors now, so when the mode starts again they are not blank and are not on the new list. That is the way to lock a mapping in and then map something else — switch the mode off and on again.

If every domino already had a color when you switched the mode on, there is nothing to map and the panel will say so. Leave image mapping, unassign the dominoes you want filled in, and switch it back on.

## Map Colors

This is the button that actually colors dominoes.

-  It starts by putting every domino on the list back to unassigned, then fills them in from the picture. That is why moving the picture and mapping again never leaves stray colors behind where the picture used to be.
-  Each domino is matched against the whole patch of picture it covers rather than a single point — see Sampling above for the two ways that patch can be read.
-  Anywhere the picture does not reach, or is transparent, the dominoes are left unassigned.
-  This version assumes you have as many dominoes of each color as you need. Your inventory counts are not taken into account.

On a large element a progress bar appears under the button, with a Cancel next to it. Cancel puts every domino it has already colored back the way it was. On smaller elements the whole thing finishes in a fraction of a second and no bar appears at all — that is not a fault, there is simply nothing to wait for.

The whole mapping is a single step in the undo history, so **Ctrl+Z** takes all of it back at once — not one domino at a time.

## Clear

**Clear** puts every domino on the list back to unassigned, leaving your hand-colored ones exactly as they are. It is the way to start the picture over without undoing your own work along with it.

Like Map Colors, it is a single step in the undo history.

## What is remembered

The picture, where you put it, and its transparency and layer settings all survive leaving image mapping mode, and survive clicking **Done** in domino editing. Come back to the same element and it will be waiting where you left it.

Clicking **Cancel** in domino editing throws the picture away along with your color edits, since that returns the element to how it was when you started.

Moving and resizing the picture is *not* undoable in this version. Only the colors that Map Colors sets go into the undo history.