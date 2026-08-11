import type { ComponentType } from "react";
import type { RemixiconComponentType } from "@remixicon/react";

import type { ShapePreviewStyle } from "./preview";

/**
 * The contract every shape-select variant implements — the analogue of
 * object-types/base.ts for domino editing mode's region gestures.
 *
 * A "shape select" is a gesture that sweeps out a region and selects the
 * dominoes inside it. Circle is the first; more follow, and some will need a
 * sequence of clicks rather than one press-drag-release, which is what the
 * ShapeSelectStepResult state machine below is for.
 *
 * The rectangle rubber band is deliberately NOT one of these. It is the mode's
 * *default* gesture, active whenever no shape is armed, and it lives in
 * DominoEditor.tsx where it always has.
 */

/**
 * A point in parent-relative mm — the space DominoData.positions lives in, with
 * its origin at the edited DDObject's own position.
 *
 * This is the only coordinate space a variant ever sees. The dispatcher
 * converts world -> parent-relative once on the way in, and re-applies the same
 * offset once on the way out (DominoEditor wraps a variant's Preview in a
 * <group> at the DDObject's origin), so a variant never holds two
 * representations of one shape and they can never drift apart.
 */
export interface ShapePoint {
  x: number;
  y: number;
}

/**
 * How a region gesture combines the dominoes it covers with the selection that
 * was already there when the gesture started.
 *
 *  - replace — a plain drag. Only what the region covers ends up selected.
 *  - add     — Ctrl. The region's dominoes join the existing selection.
 *  - remove  — Alt. The region's dominoes are taken back out of it.
 *
 * Pinned at the sequence's FIRST press and held for the whole sequence, so a
 * shape spanning several clicks means one thing throughout. Holding both Ctrl
 * and Alt gives "remove": the two contradict each other, and the preview colour
 * has to match what the gesture actually does.
 *
 * Deliberately not dominoes/swatches.ts's DominoSelectMode, which is the swatch
 * menus' four-way and carries an "intersect" case no gesture produces.
 */
export type SelectionGestureMode = "replace" | "add" | "remove";

/**
 * Snaps a point onto the edited DDObject's own grid.
 *
 * Handed to nextStep as a separate argument rather than pre-applied to the
 * event's coordinates, because *which* points should snap is shape-specific: a
 * circle snaps only its centre and lets the rim stay continuous, where a future
 * shape may snap every vertex, or none. Passing the capability lets the variant
 * decide; pre-snapping the event would decide for it.
 *
 * Always callable. When the edited type declares no `snapShapePoint`
 * (object-types/base.ts), the tool passes NO_SNAP, so a variant never branches
 * on whether snapping is supported — the same branch-free reasoning as
 * dominoes/expansion.ts returning a zeroed record rather than null.
 */
export type SnapShapePoint = (p: ShapePoint) => ShapePoint;

/** What a DDObject with no grid gets: the point, unchanged. */
export const NO_SNAP: SnapShapePoint = (p) => p;

/**
 * How far outside a shape a domino's centre may sit and still be taken (mm).
 *
 * Without it, a shape drawn from snapped points has an edge that lands exactly
 * on a domino's centre — so that one domino is precisely on the boundary and is
 * taken, while its neighbours, which the shape may cover 49.9% of, are not. The
 * result is a single domino sticking out of an otherwise clean edge, and it
 * reads as a mistake rather than as a choice.
 *
 * Applied by every shape whose drawn-from points snap. `circle` is the
 * exception and deliberately has none: it snaps its *centre* rather than
 * anything on its rim, so its boundary almost never lands exactly on a domino
 * centre and there is no orphan to fix.
 *
 * **Applied when a variant's state is built, never per domino, and only to the
 * containment test — never to the drawn shape.** At any zoom this app reaches,
 * a millimetre is well under one pixel, so there is nothing to see either way;
 * leaving the drawing alone keeps a snapped edge visibly passing through the
 * dominoes the user picked, which is what they aimed at.
 */
export const SELECTION_MARGIN_MM = 1;

/**
 * One pointer event, normalised and already in parent-relative mm. The
 * dispatcher owns everything here that isn't shape-specific — the coordinate
 * conversion and the drag threshold — so no two variants can disagree about
 * what "a drag" means. Snapping is deliberately *not* folded in here for
 * exactly that reason: it is shape-specific, so it arrives as the separate
 * SnapShapePoint capability above rather than as already-moved coordinates.
 *
 * There is deliberately no click count. No planned shape needs a double click
 * to be distinct from two single clicks; a multi-click variant closes on
 * something meaningful instead (clicking its first vertex again, say), which is
 * clearer to the user and simpler here. If one ever does need a count, note it
 * cannot come from `nativeEvent.detail`: the Pointer Events spec pins `detail`
 * at 0 for pointerdown/pointerup, so it would have to be counted from timing
 * and distance in the dispatcher.
 */
export interface ShapeSelectEvent {
  kind: "press" | "move" | "release";
  point: ShapePoint;
  /** Where the press that opened this gesture sequence happened. */
  origin: ShapePoint;
  /** Has the pointer travelled past DRAG_THRESHOLD_MM since `origin`? */
  dragging: boolean;
}

/**
 * What one call to nextStep() produced.
 *
 * - **active** — the sequence is live. The dispatcher previews the selection
 *   this state implies (replacing the stored selection, exactly as the
 *   rectangle band does) and keeps the sequence open. Note the dispatcher does
 *   not close a sequence on pointer release — the variant does, which is how a
 *   multi-click variant spans several press/release pairs.
 * - **done** — the shape is finished. The dispatcher commits the selection,
 *   applies the locked swatch (once, here, never per frame) and ends the
 *   sequence. The tool stays armed for the next shape.
 * - **ignore** — this event isn't part of a shape gesture; the dispatcher falls
 *   back to the tool's plain click / Ctrl+click semantics. Only legal before a
 *   sequence's first "active".
 *
 *   Note this no longer carries the *click* case, and it once did. Preserving
 *   single-domino clicking while a shape was armed used to be each variant's own
 *   decision, and none of them chose to — so clicking a domino did nothing
 *   useful whenever anything was armed. DominoEditor now applies one rule for
 *   every shape instead: a press that never travels DRAG_THRESHOLD_MM never
 *   opens a sequence at all, so it stays an ordinary click. That belongs in one
 *   place because a user cannot be expected to remember which shapes allow a
 *   click. What is left here is a variant's ability to decline a *drag*, which
 *   nothing does today.
 *
 * `state` must be a FRESH object every time, never the one passed in mutated:
 * the dispatcher stores it in React state to trigger the preview repaint, and
 * React compares by identity — a mutated-in-place object looks unchanged and
 * nothing redraws. Same discipline as selectionStore's `replace`.
 */
export type ShapeSelectStepResult<TState> =
  | { status: "active"; state: TState }
  | { status: "done"; state: TState }
  | { status: "ignore" };

/** The few points that define the shape as currently drawn. */
export interface ShapeControlPoints {
  /** Where the sequence started — Shift+Arrow's fixed corner afterwards. */
  selectionFixedCornerPoint: ShapePoint;
  /** Where it currently ends — the corner Shift+Arrow moves afterwards. */
  selectionMovingCornerPoint: ShapePoint;
}

/**
 * TState is a type parameter, not a type: each variant instantiates it with its
 * own state shape (circle's is CircleSelectState). Nothing outside a variant's
 * own module ever names that type, which is why registering a shape needs no
 * central type edit — unlike the DDObject union, which is hand-maintained.
 */
export interface ShapeSelectDefinition<TState> {
  /** Registry key; must match the key this definition is registered under. */
  id: string;
  /** Toolbar button label, used as both tooltip and aria-label. */
  label: string;
  icon: RemixiconComponentType;

  /**
   * Advance this variant's gesture state machine by one pointer event, and say
   * what that means. The only place a variant's click/drag protocol lives.
   * `state` is undefined until this variant's first "active".
   *
   * Pure: it reads nothing but its three arguments — no store, no DominoData,
   * no DOM. `snapPoint` does not weaken that: it is itself a pure function of a
   * point, resolved from the edited DDObject's type before the call. Anything
   * expensive derived from the control points (a polygon's edge table, a
   * bounding box for early rejection) belongs on TState, computed here, because
   * `contains` runs once per domino per frame and TState is opaque to
   * everything but this module.
   *
   * Whether to call `snapPoint`, and on which points, is this variant's
   * decision — see SnapShapePoint.
   */
  nextStep(
    event: ShapeSelectEvent,
    state: TState | undefined,
    snapPoint: SnapShapePoint,
  ): ShapeSelectStepResult<TState>;

  /**
   * Is the domino whose MIDPOINT is (x, y) — parent-relative mm — inside the
   * shape as it currently stands? See indicesInShape in dispatcher.ts for why
   * this is a midpoint test and not a footprint one.
   */
  contains(state: TState, x: number, y: number): boolean;

  /**
   * The shape's defining points, which the dispatcher snaps to the nearest
   * selected domino to seed the two selection corners for a following
   * Shift+Arrow. A point with no domino near it is harmless.
   */
  controlPoints(state: TState): ShapeControlPoints;

  /**
   * What ModeHintBar says. Called with `undefined` while the shape is armed but
   * idle, and with the live state after that, so a variant whose gesture has
   * stages can say something different at each one.
   */
  hint(state: TState | undefined): string;

  /**
   * Draws the translucent region the user is currently sweeping out — the
   * growing disc for a circle, and whatever the equivalent is for a future
   * shape. It returns three.js scene objects (a filled `<mesh>` plus a
   * `<lineLoop>` border, in circle's case), positioned in parent-relative mm;
   * DominoEditor wraps them in a <group> that moves them into world
   * coordinates. Only ever mounted with a live state, so it needs no undefined
   * branch.
   *
   * This draws ONLY that preview region. It never draws dominoes: a domino's
   * own outline is white when selected and grey otherwise, decided per domino
   * in dominoes/modeller.tsx, and nothing here changes that.
   *
   * `previewStyle` is the fill and border colour of the region itself — white
   * while the gesture is adding dominoes to the selection, dark while Alt is
   * removing them (see ShapePreviewStyle). It arrives as a prop rather than
   * being looked up inside the component so that this contract names it: a
   * variant that ignores it and hard-codes a colour is then visibly wrong,
   * instead of quietly showing the selecting colours during an Alt drag.
   */
  Preview: ComponentType<{ state: TState; previewStyle: ShapePreviewStyle }>;
}

/**
 * Element type for the registry map. nextStep/contains/controlPoints/Preview
 * all put TState in a contravariant position, so a concrete definition isn't
 * assignable to any common supertype; the registry erases TState instead.
 *
 * Unlike AnyDDObjectTypeDefinition there is no concrete union to cast *back*
 * to — a variant's state is genuinely private to it — so the erasure is
 * one-way and the dispatcher holds the state as `unknown` (see
 * ShapeGestureSequence). `any` here plus `unknown` there is what lets every
 * call through the registry typecheck with no cast at any call site.
 */
export type AnyShapeSelectDefinition = ShapeSelectDefinition<any>;

/**
 * One in-progress shape: possibly several presses, moves and releases before
 * the variant calls it done — hence "sequence" rather than "gesture", which
 * reads as a single drag.
 *
 * The definition is pinned beside the state only it can interpret, so changing
 * the armed shape mid-sequence is detectable (by identity) rather than feeding
 * one variant's state into another's nextStep().
 */
export interface ShapeGestureSequence {
  definition: AnyShapeSelectDefinition;
  state: unknown;
}