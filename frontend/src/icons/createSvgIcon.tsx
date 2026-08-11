import type { ComponentType, SVGProps } from "react";
import type { RemixiconComponentType } from "@remixicon/react";

/**
 * How much bigger an icon's box is than the drawing sitting inside it.
 *
 * A Remixicon glyph does not fill its own box — it leaves a margin all round.
 * A drawing that runs edge to edge therefore reads as visibly larger and
 * heavier than the icons beside it, even at the same nominal size. This is the
 * factor that puts a comparable margin back, chosen to match the proportion
 * Remixicon draws to.
 */
const GLYPH_BOX_RATIO = 1.2;

/**
 * The viewBox for a drawing `drawingWidth` by `drawingHeight`: a square box
 * enough bigger than the drawing to leave a Remixicon-like margin, with the
 * drawing centred in it.
 *
 * **The two numbers come straight off the first line of the exported .svg**,
 * which for a PowerPoint export reads `<svg width="829" height="845" ...>`.
 * Copy them across; there is no arithmetic to do by hand.
 *
 * Square regardless of the drawing's own shape, so a tall icon and a wide one
 * still occupy the same space in a toolbar row and their strokes come out at
 * the same weight. A drawing that is far from square gets most of its padding
 * on one axis, which is what keeps it from being stretched.
 */
export const paddedViewBox = (drawingWidth: number, drawingHeight: number): string => {
  const boxSize = Math.max(drawingWidth, drawingHeight) * GLYPH_BOX_RATIO;
  const originX = -(boxSize - drawingWidth) / 2;
  const originY = -(boxSize - drawingHeight) / 2;
  return `${originX} ${originY} ${boxSize} ${boxSize}`;
};

/**
 * Turns a hand-drawn SVG into an icon component interchangeable with a
 * Remixicon one.
 *
 * The gap it closes: `import X from "./x.svg?react"` (vite-plugin-svgr, wired
 * up in vite.config.ts) hands back a component that takes raw SVG attributes —
 * `width`, `height`, `fill`. Everything in this app instead passes an icon
 * around as a `RemixiconComponentType`, which takes `size` and `color`, and is
 * rendered as `<Icon size={20} />`. This translates between the two, so a
 * drawing of your own can be dropped anywhere a `Ri*` is accepted — a shape's
 * `icon`, a tool's `Icon`, a DDObject type's icon — with nothing else adapted.
 *
 * Adding an icon is then two lines, and re-exporting the drawing from
 * PowerPoint needs no code change at all:
 *
 *     import MySvg from "../assets/My-Thing.svg?react";
 *     export const MyThingIcon = createSvgIcon(MySvg, paddedViewBox(826, 826));
 *
 * **`viewBox` is required, and it does two jobs.**
 *
 * The first is scaling at all. PowerPoint writes `width` and `height` and no
 * viewBox, which pins a drawing to one fixed size — asking for it at 20px would
 * crop it rather than shrink it. Nothing upstream fills that in: SVGO does run
 * (see vite.config.ts) but only to keep ids from colliding, and it cannot invent
 * a viewBox that was never there. So this is the only place one can come from,
 * and requiring it rather than defaulting is what turns forgetting it into a
 * compile error instead of an icon that quietly renders at the wrong size.
 *
 * The second is the margin around the drawing, which is what makes a custom
 * icon sit at the same visual weight as the Remixicon ones beside it. That is
 * paddedViewBox's job above, and passing its result is the normal thing to do.
 * A plain string is still accepted, for an icon that wants an off-centre or
 * deliberately tight crop.
 *
 * @param Svg the component from a `?react` import
 * @param viewBox usually paddedViewBox(width, height) — see above
 */
export function createSvgIcon(
  Svg: ComponentType<SVGProps<SVGSVGElement>>,
  viewBox: string,
): RemixiconComponentType {
  const Icon: RemixiconComponentType = ({
    color = "currentColor",
    size = 24,
    className,
    ...rest
  }) => {
    // These four win over whatever the drawing declares, because svgr builds
    // its component as `<svg ...itsOwnAttributes {...props}>` — the spread goes
    // last, so a prop of the same name replaces the file's version. That is
    // what lets width/height/viewBox override PowerPoint's own numbers without
    // the .svg file needing to be edited.
    return (
      <Svg
        width={size}
        height={size}
        // On the <svg>, never on the paths inside it. `fill` is inherited, so
        // this is what lets the drawing follow a button's text colour through
        // its rest/hover/disabled/active states, the same way a Remixicon icon
        // does. A path carrying its own fill would ignore it and stay one
        // colour, and would stop matching its neighbours.
        fill={color}
        viewBox={viewBox}
        className={className}
        {...rest}
      />
    );
  };
  return Icon;
}