import type { InventoryEntry } from "../domino-inventory/object-model";

/**
 * Choosing the inventory color nearest to some color you have — the step that
 * turns a pixel from an image into a domino color.
 *
 * There is more than one sensible answer, and the brief anticipates more still
 * (other distance formulas, dithering, palette restrictions), so this is a
 * registry: one file per way of measuring, and registry.ts lists them. Nothing
 * outside this folder names a variant.
 *
 * The shape is built around one performance fact. A mapping run asks the same
 * question once per domino — tens of thousands of times — against the same
 * handful of inventory colors. So the work is split three ways, and each stage
 * runs as few times as it possibly can:
 *
 * - `prepare` depends only on the inventory, so it runs once per mapping run.
 * - `sample` depends only on the color being asked about, so it runs once per
 *   domino.
 * - `distanceTo` is the only thing left in the inner loop, once per candidate
 *   per domino, and is a handful of arithmetic operations.
 */

/**
 * What every metric's prepared candidate must carry: the inventory entry's
 * numericId, which is what actually gets written into DominoData.colorIds.
 * Everything else a metric precomputes is its own business.
 */
export interface PreparedColor {
  numericId: number;
}

export interface ColorDistanceDefinition<TPrepared extends PreparedColor, TSample> {
  /** Registry key. Must match the key used in registry.ts. */
  id: string;
  /** Shown in the panel's Color Distance dropdown. */
  label: string;

  /**
   * The colors this metric is willing to choose from, each with whatever it
   * wants precomputed. Called once per mapping run.
   *
   * Filtering here is deliberate, not incidental: it is what lets "greyscale"
   * be an ordinary metric rather than a special case somewhere else, since the
   * only thing that makes it different is which colors are on the table.
   *
   * "Only use the swatches I picked" narrows the *entries* before they get here
   * (image-map/palette.ts) rather than widening this contract, so a metric's own
   * filter simply composes on top and no metric needed changing for it.
   */
  prepare(entries: readonly InventoryEntry[]): TPrepared[];

  /**
   * Whatever this metric wants worked out once about the color being asked
   * about, before it is compared against anything. Called once per domino.
   *
   * This stage exists because the alternative is measurably worse and looks
   * fine: a metric that converts the color inside `distanceTo` converts it
   * again for every single candidate, so an inventory of forty active colors
   * does forty conversions where one would do. That is what the code here did
   * originally, and the cost only stops being invisible once a metric does real
   * work per color.
   *
   * A metric with nothing to precompute (weighted RGB) just passes the channels
   * straight through.
   *
   * r, g and b are sRGB bytes (0-255), the same form hexToRgbBytes hands back.
   * They need not be whole numbers — a patch average or a dithered value is an
   * ordinary thing to be asked about.
   */
  sample(r: number, g: number, b: number): TSample;

  /**
   * How far one candidate is from the sampled color. Smaller is nearer.
   *
   * This does not have to be a true distance — only ordered the same way one
   * would be, because the caller only ever takes the smallest. That is why
   * every metric here skips the square root: it is strictly increasing, so it
   * cannot change which candidate wins, and it costs real time at this call
   * count.
   */
  distanceTo(candidate: TPrepared, sample: TSample): number;

  /** Shown in the panel when prepare() finds no usable colors at all. */
  emptyMessage: string;
}

/**
 * The registry holds metrics with different prepared-candidate and sampled-color
 * types, so it has to forget both to put them in one map. `any` here rather than
 * `unknown` because each of those types is mentioned in opposite positions —
 * prepare returns the candidate and distanceTo takes it, sample returns the
 * sampled color and distanceTo takes that too — and `unknown` would make every
 * call through the registry fail to typecheck. Contained to this one line and
 * registry.ts, exactly as shape-select's AnyShapeSelectDefinition is.
 */
export type AnyColorDistanceDefinition = ColorDistanceDefinition<any, any>;