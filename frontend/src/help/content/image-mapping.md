[Home](home) > [Build Designer](designer) > [Editing Dominoes](domino-editing) > Mapping an Image

# Mapping an image

Imagine mapping will automatically choose dominoes from your [domino inventory](home) based on an image you upload.

To use it:
-  Click on the Image icon on the tool bar
    -  You will be prompted to upload an image
-  Move / resize the image so it maps onto your dominoes as you want
    -  Use the handles to resize the image
-  The image icon has a menu, use this menu to choose "Map Image Colors"

Notes:
1. Map Image Colors currently does not pay attention to the number of dominoes in your inventory
2. Showing a transparent image over your dominoes allows you to set domino colors manually to the image. Like tracing paper. :-)

## Image Handling Menu

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

## Using an Image as Tracing Paper

One fun way to use an image is as tracing paper.
-  Use "Show Over" button to show the image over all dominoes
-  Edit/paint the dominoes as normal
-  Click the image icon (or press {{mod}}+I) to show or hide the image

## Mapping Images

-  Choosing **Map Image Colors** from the image toolbar provides tools for automatically mapping your image to domino colors
-  There are several sampling, color distance, and dithering choices to choose from
-  Other options include:
    -  **Dither Strength** - How much to apply dithering to 
    -  **Use Colors** - Choose which colors from your inventory to use when color matching

## Only "Unassigned" Dominoes Get Color Mapped

Any domino to which has already been assigned a color (either manually, or from a previous image map) **will remain untouched**.

This allows you to use images to fill holes in your domino pattern, and to mix/match multiple images into a single domino pattern.

Hopefully, this leads to some creative designs. :-)

## Sampling

Each domino covers a small patch of the picture — usually a few dozen pixels — and this chooses how that patch is boiled down to the one color the domino will be matched against.

-  **Average** blends the whole patch together. Fine detail then comes out as the color that area really reads as, rather than as speckle. **Use this for photographs.**

-  **Dominant** takes the most common color in the patch and ignores the rest. **Use this for flat artwork** — logos, icons, diagrams, anything drawn in solid areas of color.
    -  Probably this version will be removed in a future version, the "merged buckets" version works better in most cases.

-  **Dominant, merged buckets** is the same idea, made harder to fool. Try it when Dominant leaves the odd stray domino in the middle of a region that ought to be one flat color — see below.

## Color Distance

This chooses how "closest color" is decided. Different answers suit different pictures, so it is worth trying more than one on the same image.

-  **Weighted RGB** compares the red, green and blue amounts directly, counting green the most and red the least, (very roughly) matching how sensitive the eye is to each. Quick and good on flat, graphic artwork.

-  **Perceptual (OKLab)** — the starting choice, and the right one for most pictures. It converts both the picture and your inventory colors into a color space built so that an equal distance really does look like an equal difference, then simply takes the nearest. Much better than Weighted RGB on photographs and on anything with rich color, where Weighted RGB can pick a shade that is numerically close but visibly wrong.

-  **Perceptual (CIELAB)** is the older space that does the same job, and mostly agrees with OKLab. Where they part company is the deep blues and violets: CIELAB drifts towards purple as a blue darkens, so it can pick a shade a person would not have. Worth trying against OKLab on a picture with a lot of shadow, since which one wins is sometimes a matter of taste.

-  **Value-weighted** counts light and dark for more than color. When your inventory forces a compromise, it gives up some color accuracy to keep the picture's light-and-dark structure intact.

-  **Greyscale** uses only the black, white and grey dominoes in your inventory, matching each patch of the picture on lightness alone.

Only colors marked **active** in your inventory are ever used, and you can narrow that further by choosing colors for image mapping.

## Choosing Colors to Use for Image Mapping

Above the swatches is a **Use Colors** setting:  **All** (default) automatically uses all colors in your inventory. **Selected** only choses the colors you select.

## Dithering

Dithering mixes colors so the combined effect is the desired color when viewed from afar. For example, if you have no purple, the algorithm will choose alternating Reds & Blues. 

There are several options:

-  **None** — no dithering at all. Domino colors are based only on the pixels directly underneath them. 
-  **Bayer 4x4** lays down a regular crosshatch that repeats every four dominoes.
-  **Bayer 8x8** is the same crosshatch four times the size.
    -  This is almost the same as Bayer 4x4 and will likely be removed in the future.
-  **Random** scatters the shift instead of patterning it — grain rather than crosshatch. Less tidy, but it never competes with the shapes in your picture the way a regular pattern can.
-  **Floyd–Steinberg** measures the difference between the domino chosen and the actual color, then passes on that difference to the dominoes around it, with the idea that the dominos around it will be chosen differently so that, collectively, they average out to the right color.
-  **Atkinson** passes on three quarters of the difference and lets the rest go. Sometimes this works better, by allowing some of the error to go by the wayside rather than having it all accounted for somewhere in the image.

### Dither Strength

This sets how much of the effect you get, e.g. how much each domino is shifted or how much of the color difference gets passed on. At 0% both do nothing whatever, exactly the same as None.

