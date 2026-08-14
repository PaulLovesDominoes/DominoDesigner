/**
 * Dithering: shifting the colour each domino is matched on, so that a palette of
 * a few dozen inventory colours can suggest shades it does not actually hold.
 *
 * The problem it solves is banding. An inventory holds a few dozen colors, and a
 * photograph holds millions, so a smooth gradient across a field snaps to one
 * inventory color, then abruptly to the next, and the steps between them are
 * plainly visible as stripes. Shifting each domino's color a little before the
 * search makes dominoes near a boundary fall on either side of it, so the two
 * colors interleave and the eye blends them into the shade in between. The
 * picture loses a little accuracy per domino and gains a great deal of apparent
 * color depth.
 *
 * **This is a separate stage from color distance, not a kind of it.** A metric
 * answers "which inventory color is nearest to this one"; dithering changes
 * which color gets asked about. Every dither works with every metric, so they
 * are two registries and two dropdowns rather than one list of every
 * combination.
 *
 * ---- Two kinds of dither ----
 *
 * **Pattern** dithers (none, the two Bayers, random) work out their shift from
 * the domino's grid position alone — a fixed crosshatch or a scatter laid over
 * the field. They are built by pattern.ts, which is also what holds them to a
 * single shift applied to all three channels; see the comment there.
 *
 * **Diffusing** dithers (Floyd-Steinberg, Atkinson) instead measure how far off
 * each domino actually landed and hand that shortfall to the dominoes next to
 * it, so a color the inventory cannot reach is approximated by a mixture of the
 * ones it can. They are built by diffusion.ts.
 *
 * The second kind is why a definition makes a **run** rather than just answering
 * questions: a diffusing dither carries state for the length of one mapping run
 * (the shortfalls owed to dominoes it has not reached yet), and has to be told
 * what each domino actually came out as. A pattern dither's run holds nothing
 * and ignores that second call, which costs it four lines in pattern.ts and
 * keeps the mapping loop down to one code path.
 */

/**
 * Three sRGB byte amounts. Used both for a color and for a shift applied to one,
 * which is why it is not called a color.
 */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** What a run is told once, before it is asked about the first domino. */
export interface DitherRunContext {
  /**
   * One step of the palette, in sRGB bytes — how far apart the inventory colors
   * this run can choose from actually are, as measured by
   * image-map/ditherAmplitude.ts.
   *
   * A pattern dither scales its pattern by this, because a pattern has no idea
   * on its own how hard to push. A diffusing dither ignores it: the shortfall it
   * carries is measured rather than invented, so it already has the right size.
   */
  amplitude: number;
  /** The panel's Dither Strength slider, 0 to 1. */
  strength: number;
  /**
   * The lowest and highest column this run will be asked about. A diffusing
   * dither sizes its buffer of owed shortfalls from these; a pattern dither
   * ignores them.
   */
  colMin: number;
  colMax: number;
}

export interface DitherRun {
  /**
   * How far to shift this domino's sampled color, in sRGB bytes, before asking
   * which inventory color is nearest to it. Shifting the color that gets asked
   * about is the whole of what a dither does.
   *
   * `row` and `col` are the domino's own grid coordinates, so a pattern lands on
   * the dominoes rather than on the picture behind them.
   */
  colorShiftAt(row: number, col: number): Rgb;

  /**
   * What the domino actually came out as. `wanted` is the color that was asked
   * about — the sampled patch plus the shift above, clamped to 0-255 — and
   * `chosen` is the inventory color that won.
   *
   * This is what a diffusing dither measures its shortfall from. A pattern
   * dither does nothing with it.
   */
  recordChoice(row: number, col: number, wanted: Rgb, chosen: Rgb): void;
}

export interface DitherDefinition {
  /** Registry key. Must match the key used in registry.ts. */
  id: string;
  /** Shown in the panel's Dither dropdown. */
  label: string;

  /**
   * "any" — the shift comes from (row, col) alone, so the dominoes can be
   * visited in whatever order suits. "serpentine" — the run hands part of its
   * shortfall to dominoes it has not reached yet, so it has to see them row by
   * row, in the order scanRunsForward describes.
   */
  scanOrder: "any" | "serpentine";

  /** Makes the object that will answer for one mapping run. */
  createRun(context: DitherRunContext): DitherRun;
}

/**
 * Which way along a row the dominoes are visited: left to right on one row, back
 * right to left on the next. That back-and-forth is called a serpentine scan,
 * and it matters for a diffusing dither because the domino a shortfall is handed
 * to should be the one physically next to it — at the end of a plain
 * left-to-right row, the "next" domino is all the way back at the other side of
 * the field, and the error visibly streaks that way.
 *
 * **This is the one definition of that order, and it has two readers that must
 * agree**: image-map/mapping.ts when it puts the dominoes in order, and a
 * diffusing run when it decides which side of itself is "ahead". Both work it
 * out from `row` alone rather than counting rows as they go, so a row with no
 * dominoes in it — every one of them already colored by hand, say — cannot put
 * the two out of step.
 *
 * `& 1` is a bit-by-bit "and" against 1, which keeps only the lowest bit and so
 * answers "is this row even". It gives 0 or 1 for negative rows too, which a
 * plain `% 2` would not.
 */
export const scanRunsForward = (row: number) => (row & 1) === 0;

/**
 * The registry holds every variant behind one type, and unlike shape-select and
 * color-distance there is nothing to erase — a run's state hides behind the
 * DitherRun interface instead of becoming a type parameter on the definition, so
 * this stays a plain alias. It exists so the registry reads the same way its
 * neighbours do.
 */
export type AnyDitherDefinition = DitherDefinition;