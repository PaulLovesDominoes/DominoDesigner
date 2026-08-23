import AngledRectangleSelectSvg from "../assets/Angled-Rectangle.svg?react";
import CircleByDiameterSelectSvg from "../assets/Circle-by-Diameter.svg?react";
import CircleSelectSvg from "../assets/Circle-by-Radius.svg?react";
import NewLayerDefinitionSvg from "../assets/New-Layer-Def.svg?react";
import OvalSelectSvg from "../assets/Oval-Select.svg?react";
import PaintCircleLargeSvg from "../assets/Paint-Circle-Large.svg?react";
import PaintCircleMediumSvg from "../assets/Paint-Circle-Medium.svg?react";
import PaintCircleSmallSvg from "../assets/Paint-Circle-Small.svg?react";
import PaintQuillLargeSvg from "../assets/Paint-Quill-Large.svg?react";
import PaintQuillMediumSvg from "../assets/Paint-Quill-Medium.svg?react";
import PaintQuillSmallSvg from "../assets/Paint-Quill-Small.svg?react";
import QuillNibSvg from "../assets/Quill-nib.svg?react";
import ShowAllLayersSvg from "../assets/Show-All-Layers.svg?react";
import TriangleSelectSvg from "../assets/Triangle.svg?react";
import { createSvgIcon, paddedViewBox } from "./createSvgIcon";

/**
 * Every hand-drawn icon in the app, one line each.
 *
 * These exist because Remixicon has no glyph for the thing in question — and,
 * as it turns out, because a drawing of the gesture itself says more than any
 * stock icon would. Each is interchangeable with a real `Ri*` anywhere one is
 * accepted; see createSvgIcon for how that works.
 *
 * **Adding one** is three steps: drop the exported `.svg` in `src/assets`,
 * import it here with the `?react` suffix, and add a line below.
 *
 * **The two numbers must match the `width` and `height` on the first line of
 * that `.svg`, and nothing checks that for you.** TypeScript cannot see inside
 * the file and the build will pass happily either way; the symptom is only that
 * the drawing sits slightly off-centre or at the wrong size next to its
 * neighbours. PowerPoint recalculates those numbers from the shape's bounding
 * box, so nudging a curve outward by a hair is enough to change them — worth a
 * glance at line 1 after every re-export.
 *
 * This is the one barrel file in `src`. It earns the exception because icons
 * import nothing from the app, so it cannot take part in an import cycle, and
 * because it keeps every consumer to a single import as the list grows. Do not
 * take it as licence to add barrels elsewhere.
 */

/** A ring with a radius drawn from its centre to the rim: press at the centre, drag out to the edge. */
export const CircleSelectIcon = createSvgIcon(CircleSelectSvg, paddedViewBox(826, 826));

/** A ring with a diameter drawn across it: drag from one side straight through to the other. */
export const CircleByDiameterSelectIcon = createSvgIcon(
  CircleByDiameterSelectSvg,
  paddedViewBox(826, 826),
);

/** A tilted oval with its long axis drawn across it: drag from one end to the other. */
export const OvalSelectIcon = createSvgIcon(OvalSelectSvg, paddedViewBox(828, 845));

/** A triangle with one side drawn in: drag that side, then place the third corner. */
export const TriangleSelectIcon = createSvgIcon(TriangleSelectSvg, paddedViewBox(831, 831));

/** A rectangle sitting at an angle: drag one side, then set the width out from it. */
export const AngledRectangleSelectIcon = createSvgIcon(
  AngledRectangleSelectSvg,
  paddedViewBox(852, 834),
);

/**
 * A stack of layers with a plus above it: adds a layer definition to the
 * structure being designed. Two of the plates are drawn parted from the rest, so
 * the drawing says "some layers", against the full stack of Show All Layers
 * below.
 */
export const NewLayerDefinitionIcon = createSvgIcon(
  NewLayerDefinitionSvg,
  paddedViewBox(825, 750),
);

/** A full stack of layers: show every layer of the structure at once. */
export const ShowAllLayersIcon = createSvgIcon(ShowAllLayersSvg, paddedViewBox(825, 840));

/**
 * The quill brush's nib on its own — a thin bar lying lower-left to upper-right,
 * at the exact angle the brush paints at. Nothing consumes it since the six
 * per-size paint icons below took over the quill's size menu; kept because the
 * drawing exists and a plain nib glyph is an obvious thing to want again.
 */
export const QuillNibIcon = createSvgIcon(QuillNibSvg, paddedViewBox(824, 824));

/**
 * The paint brushes' size icons: one drawing per brush per size, each showing a
 * paint droplet with the mark that brush makes coming off its tip — a round dot
 * for the pencil, an angled bar for the quill. The toolbar button and the size
 * menu both just draw these at 20px; the *drawing* carries the size, so nothing
 * scales a glyph to imply one.
 *
 * **All six deliberately share ONE viewBox, and it is NOT each file's own
 * width/height** — which is the rule paddedViewBox otherwise documents. That is
 * load-bearing, so don't "fix" it back to a call per file.
 *
 * What makes one shared box work: every one of the six lands with its top-left
 * at (0,0), every one carries an identical 378-unit droplet anchored at that
 * origin, and the nib grows out of the droplet's tip toward the lower right, the
 * file's declared size growing with it. Sizing the box on the largest of them
 * therefore pins the droplet in place while the nib alone grows — circle nibs
 * 154 -> 367 -> 525 units, quill bars 244 -> 708 -> 1034.
 *
 * Per-file boxes break that two separate ways. They *normalise* the drawings, so
 * at 20px the nib would grow only 1 : 1.74 : 2.12 rather than 1 : 2.38 : 3.41
 * while the shared droplet visibly *shrank* (12.3 -> 9.0 -> 7.6px) — partly
 * inverting the very cue these icons exist to give. And a shared box that
 * *centred* each drawing would fix the scale but move the droplet, since the
 * droplet sits at the drawing's origin rather than its centre. Only one
 * identical viewBox string holds it still.
 *
 * The nibs are indicative, not to scale: drawn at the true millimetre ratios
 * (1 : 3 : 6 for the pencil) a Small nib would be nearly invisible at 20px.
 */
const PAINT_BRUSH_VIEW_BOX = paddedViewBox(828, 826);

export const PaintCircleSmallIcon = createSvgIcon(PaintCircleSmallSvg, PAINT_BRUSH_VIEW_BOX);
export const PaintCircleMediumIcon = createSvgIcon(PaintCircleMediumSvg, PAINT_BRUSH_VIEW_BOX);
export const PaintCircleLargeIcon = createSvgIcon(PaintCircleLargeSvg, PAINT_BRUSH_VIEW_BOX);
export const PaintQuillSmallIcon = createSvgIcon(PaintQuillSmallSvg, PAINT_BRUSH_VIEW_BOX);
export const PaintQuillMediumIcon = createSvgIcon(PaintQuillMediumSvg, PAINT_BRUSH_VIEW_BOX);
export const PaintQuillLargeIcon = createSvgIcon(PaintQuillLargeSvg, PAINT_BRUSH_VIEW_BOX);