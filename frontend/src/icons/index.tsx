import AngledRectangleSelectSvg from "../assets/Angled-Rectangle.svg?react";
import CircleByDiameterSelectSvg from "../assets/Circle-by-Diameter.svg?react";
import CircleSelectSvg from "../assets/Circle-by-Radius.svg?react";
import OvalSelectSvg from "../assets/Oval-Select.svg?react";
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