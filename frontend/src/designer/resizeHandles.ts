import type { Bounds } from "../types";

/**
 * The eight resize grips around a rectangle on the build plane: where each one
 * sits and what cursor it shows.
 *
 * Shared by SelectionTool (which resizes a DDObject) and image-map's
 * ImageTransformTool (which resizes an overlaid picture). Pure geometry over a
 * rectangle — neither what is being resized nor how the drag is applied belongs
 * here, and the two callers differ on both.
 */

export type ResizeHandleId = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const RESIZE_HANDLES: ResizeHandleId[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

/** True for the four corner grips, which drive two edges rather than one. */
export const isCornerHandle = (id: ResizeHandleId) => id.length === 2;

/** Centre of a handle, in build-plane mm. */
export function handlePos(b: Bounds, id: ResizeHandleId): [number, number] {
  const left = b.x, right = b.x + b.width, bottom = b.y, top = b.y + b.height;
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  switch (id) {
    case "n": return [cx, top];
    case "s": return [cx, bottom];
    case "e": return [right, cy];
    case "w": return [left, cy];
    case "ne": return [right, top];
    case "nw": return [left, top];
    case "se": return [right, bottom];
    case "sw": return [left, bottom];
  }
}

// The view is top-down with +Y up on screen, so a bottom-left/top-right diagonal
// is nesw and a top-left/bottom-right diagonal is nwse.
export function cursorFor(id: ResizeHandleId): string {
  switch (id) {
    case "n": case "s": return "ns-resize";
    case "e": case "w": return "ew-resize";
    case "ne": case "sw": return "nesw-resize";
    case "nw": case "se": return "nwse-resize";
  }
}