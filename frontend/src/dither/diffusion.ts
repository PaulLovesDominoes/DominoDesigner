import {
  scanRunsForward,
  type DitherDefinition,
  type DitherRun,
  type DitherRunContext,
  type Rgb,
} from "./base";

/**
 * Building an *error-diffusion* dither — one that measures how far off each
 * domino actually landed and hands that shortfall to the dominoes next to it.
 * floydSteinberg.ts and atkinson.ts are both one call to this. Not a registered
 * variant itself, the same arrangement ordered.ts and pattern.ts have.
 *
 * The idea, in one paragraph. A domino is given the nearest inventory colour to
 * the patch of picture it covers, and that is almost never exact — a patch of
 * pale orange might come out as plain white. The difference between what was
 * asked for and what was given is the *shortfall*: here, "quite a lot of orange
 * still owed". Rather than throw it away, it is added to the neighbouring
 * dominoes' colours before *they* are matched, so one of them is pushed over the
 * line into orange. Across a region the two colours interleave in whatever
 * proportion the picture called for, and the eye reads the mixture. Any error in
 * one domino is paid back by the ones around it, which is what makes this so
 * much better than a fixed pattern at colours the inventory does not hold.
 *
 * It differs from the pattern dithers in three ways, and all three are why
 * base.ts's contract has the shape it does:
 *
 * - It carries state — the shortfalls owed to dominoes not yet reached — so a
 *   definition makes a *run* rather than answering questions directly.
 * - It has to be told what each domino came out as, which is `recordChoice`.
 * - It has to see the dominoes in a fixed order, which is `scanOrder:
 *   "serpentine"`.
 *
 * **The shortfall is carried per channel**, unlike a pattern's single
 * light-to-dark nudge (see pattern.ts for why a pattern must not do that). It is
 * right here for a reason that does not apply there: this amount is not invented
 * noise but a measurement of how the last choice actually missed, and passing it
 * on is self-correcting — overshooting red makes the next domino pick something
 * less red. That is exactly what lets a red domino and a blue one average into
 * the purple the picture asked for.
 */

/**
 * One neighbour's share of the shortfall.
 *
 * Positions are given relative to the domino being left behind, and `colsAhead`
 * is measured **along the direction of travel** rather than in fixed columns.
 * That is what makes the serpentine scan free: on a row being walked right to
 * left, "one ahead" is simply mirrored, and no variant has to say so.
 */
export interface DiffusionWeight {
  /** Rows ahead: 0 is the row being walked now, 1 the next one. */
  rowsAhead: number;
  /** Columns ahead along the direction of travel. Negative is behind. */
  colsAhead: number;
  /** The fraction of the shortfall this neighbour takes, 0 to 1. */
  share: number;
}

/** How many colour channels each column of the buffer holds. */
const CHANNELS = 3;

export function diffusionDither(
  id: string,
  label: string,
  weights: readonly DiffusionWeight[],
): DitherDefinition {
  // Only ever reaching forward is what keeps the memory down to a few rows
  // instead of the whole field: once a row has been walked, nothing can add to
  // it any more.
  const depth = 1 + Math.max(...weights.map((weight) => weight.rowsAhead));

  return {
    id,
    label,
    scanOrder: "serpentine",

    createRun({ strength, colMin, colMax }: DitherRunContext): DitherRun {
      // Guarded because a run over a single column, or over an element whose
      // columns could not be worked out, would otherwise ask for a zero-width
      // buffer.
      const width = Math.max(1, colMax - colMin + 1);

      /**
       * The shortfalls owed, one row of the grid per entry and three numbers per
       * column. Used as a ring: `ringStart` is where the row being walked now
       * sits, and the rows after it wrap round the end. Advancing to the next
       * row of dominoes just moves `ringStart` along and blanks the row that
       * dropped off the back, so nothing is ever copied.
       */
      const rows: Float32Array[] = [];
      for (let k = 0; k < depth; k++) rows.push(new Float32Array(width * CHANNELS));
      let ringStart = 0;

      /** The row being walked, or null before the first domino. */
      let currentRow: number | null = null;

      // Handed back from every colorShiftAt call and refilled each time — one
      // allocation for the run rather than one per domino, as pattern.ts does.
      const shift: Rgb = { r: 0, g: 0, b: 0 };

      /** The buffer row `rowsAhead` further on than the one being walked. */
      const rowBuffer = (rowsAhead: number) => rows[(ringStart + rowsAhead) % depth];

      /**
       * Moves the ring on to `row`. Usually one step, but a row with no dominoes
       * to colour in it is skipped entirely, so it can be several — and if that
       * skips further than the ring is deep, every row in it is stale and the
       * whole thing is blanked.
       */
      const advanceTo = (row: number) => {
        if (currentRow === null) {
          currentRow = row;
          return;
        }
        const steps = Math.min(row - currentRow, depth);
        for (let k = 0; k < steps; k++) {
          // The row being left behind becomes the far end of the ring, so it has
          // to start empty.
          rows[ringStart].fill(0);
          ringStart = (ringStart + 1) % depth;
        }
        currentRow = row;
      };

      return {
        colorShiftAt(row, col) {
          if (row !== currentRow) advanceTo(row);

          // A column outside the range the run was told about owes nothing —
          // there is no buffer for it, and nothing ever wrote to it.
          if (col < colMin || col > colMax) {
            shift.r = 0;
            shift.g = 0;
            shift.b = 0;
            return shift;
          }

          const buffer = rowBuffer(0);
          const at = (col - colMin) * CHANNELS;
          shift.r = buffer[at];
          shift.g = buffer[at + 1];
          shift.b = buffer[at + 2];
          return shift;
        },

        // Always called for the domino colorShiftAt was just asked about, so the
        // ring is already sitting on `row`.
        recordChoice(row, col, wanted, chosen) {
          // The strength slider is applied here, once, rather than to each
          // neighbour: it is how much of the shortfall gets passed on at all. At
          // 0 nothing is, every shift stays zero, and the result is identical to
          // no dithering.
          const shortfallR = (wanted.r - chosen.r) * strength;
          const shortfallG = (wanted.g - chosen.g) * strength;
          const shortfallB = (wanted.b - chosen.b) * strength;

          // Which way "ahead" points on this row. base.ts owns this rule, and
          // image-map/mapping.ts reads the same one when it puts the dominoes in
          // order — if the two disagreed, half the rows would hand their
          // shortfall to dominoes already finished with.
          const direction = scanRunsForward(row) ? 1 : -1;

          for (const weight of weights) {
            const targetCol = col + weight.colsAhead * direction;
            // Shortfall aimed off the end of a row is dropped. So is shortfall
            // aimed at a domino this run is not colouring — that one lands in
            // the buffer and is simply never read, which is how a hand-painted
            // region comes out as a hard edge rather than smearing.
            if (targetCol < colMin || targetCol > colMax) continue;

            const buffer = rowBuffer(weight.rowsAhead);
            const at = (targetCol - colMin) * CHANNELS;
            buffer[at] += shortfallR * weight.share;
            buffer[at + 1] += shortfallG * weight.share;
            buffer[at + 2] += shortfallB * weight.share;
          }
        },
      };
    },
  };
}