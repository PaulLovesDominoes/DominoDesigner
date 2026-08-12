import {
  PaintCircleLargeIcon,
  PaintCircleMediumIcon,
  PaintCircleSmallIcon,
} from "../../icons";
import type { DominoBrushDefinition } from "../base";
import PencilBrushPreview from "./preview";

/**
 * A round nib. The size is its diameter, so Small covers roughly one domino and
 * Large covers a patch — and because the nib is round, it paints the same width
 * whichever way it is dragged. That is what lets the pencil go as small as it
 * does, where the quill next door cannot.
 */
export const pencilBrushDefinition: DominoBrushDefinition = {
  id: "pencil",
  label: "Paint with Circle (selected color)",
  sizeMm: { small: 20, medium: 60, large: 120 },
  sizeIcons: {
    small: PaintCircleSmallIcon,
    medium: PaintCircleMediumIcon,
    large: PaintCircleLargeIcon,
  },
  hint: "Click then drag to paint the selected color. ESC during a stroke undoes it.",

  contains: (sizeMm, dx, dy) => {
    const radius = sizeMm / 2;
    return dx * dx + dy * dy <= radius * radius;
  },

  Preview: PencilBrushPreview,
};