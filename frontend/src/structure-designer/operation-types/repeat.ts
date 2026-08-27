/**
 * How many layers a definition covers, for the two kinds of definition that
 * cover a run of them.
 *
 * A layer definition says how tall each layer is; a grid definition says which
 * grid the dominoes on it stand on. Both describe a run of layers starting where
 * the definitions before them left off, and both offer the same three answers to
 * "how many": once through, a number of times, or all the way to the top. The
 * arithmetic is one sentence and it lives here rather than twice.
 *
 * Pure and free of React, like the rest of operation-types/. It is a file rather
 * than a folder because it is not an operation type — it is a piece two of them
 * share, the same standing this has as `base.ts`.
 *
 * **The word "repeat" is this file's, not the user's.** A layer definition's
 * dialog does say Repeat, but a grid definition's says *Layers*: a grid already
 * repeats across the plane in X and Y, so a row labelled Repeat beside it would
 * be asking the reader to tell two kinds of repetition apart from context. The
 * field names are shared so the shared control and this function fit without a
 * translation layer; only the label above the row differs.
 */

/** How many times a definition's run of layers is laid down. */
export type RepeatKind = "once" | "forever" | "count";

/**
 * How the three are written in their pull-down.
 *
 * Once before Forever before Count, which is least to most to be said about it —
 * and puts the one answer that needs a second control last.
 */
export const REPEAT_KINDS = [
  { kind: "once", label: "Once" },
  { kind: "forever", label: "Forever" },
  { kind: "count", label: "Count" },
] as const satisfies readonly { kind: RepeatKind; label: string }[];

/**
 * How many layers a repeating definition claims.
 *
 * `runLength` is how many layers one pass through the definition covers — the
 * length of a layer definition's list of heights, or a single layer for a grid
 * definition, which describes one grid rather than a sequence of them.
 *
 * `remaining` is how many layers the definitions before this one left unclaimed,
 * and it is the ceiling on the answer however the repeat is set. That single cap
 * is why "Forever" needs no case of its own beyond asking for everything left:
 * the ceiling on the whole structure is applied once here rather than in each
 * branch.
 */
export function repeatSpan(
  kind: RepeatKind,
  count: number,
  runLength: number,
  remaining: number,
): number {
  if (runLength <= 0 || remaining <= 0) return 0;
  if (kind === "forever") return remaining;
  // Count = 1 is exactly what Once means, so a typed number below one is read as
  // one rather than refused — the box is being typed in and an empty one parses
  // to nothing.
  const times = kind === "once" ? 1 : Math.max(1, Math.floor(count));
  return Math.min(runLength * times, remaining);
}