# CLAUDE.md — dithering

Guidance for `frontend/src/dither/`. This registry decides *which colour gets asked about* for
each domino in an image-mapping run; `color-distance/CLAUDE.md` covers the separate registry that
answers which inventory colour is nearest, and `image-map/CLAUDE.md` the run itself.

`dither/` is the second stage of the colour choice and a registry of its own: `base.ts`,
`registry.ts`, three shared-maths modules that are **not** variants (`ordered.ts` for the Bayer
matrix, `pattern.ts` and `diffusion.ts` for the two kinds of dither), and one file per registered
entry — `none`, `bayer4`, `bayer8`, `random`, `floydSteinberg`, `atkinson`. Same four-part accessor
shape, same one-file-per-variant rule as `color-distance/` and for the same reason.

**It is a separate registry from colour distance, not a member on it.** A metric answers *which
inventory colour is nearest to this one*; a dither changes *which colour gets asked about*. Every
dither composes with every metric, so merging them would give a dropdown of every combination.

**There are two kinds of dither and the contract's whole shape follows from the second.** A
*pattern* (the two Bayers, `random`, and `none`) works its shift out from the domino's grid position
alone. *Error diffusion* (`floydSteinberg`, `atkinson`) measures how far each domino actually missed
and hands the shortfall to dominoes it has not reached yet — so it carries state for the length of a
run, has to be told what each domino came out as, and has to see them in a fixed order. Hence
`DitherDefinition` is `{ id, label, scanOrder, createRun(context) }` and the answering happens on a
per-run `DitherRun` (`colorShiftAt` / `recordChoice`) rather than on the definition.

The contract was deliberately stateless until diffusion existed to exercise it, per the standing
rule against reserving machinery speculatively (the `hidden: Uint8Array` column that gathered six
readers and never a writer). This is what widening it actually cost: a pattern variant is still one
line, because `pattern.ts` supplies the empty `recordChoice` and the `scanOrder: "any"`.

Nine decisions worth not reversing:

- **`AnyDitherDefinition` is still a plain alias, not an `any` erasure**, unlike
  `AnyColorDistanceDefinition` and `AnyShapeSelectDefinition`. A run's state hides behind the
  `DitherRun` interface instead of surfacing as a type parameter on the definition. Keep it that
  way — a variant wanting its state in the type would put `any` back in the registry.
- **A pattern supplies one scalar; only diffusion moves channels independently.** Adding the same
  amount to red, green and blue moves a colour along the light-to-dark axis, which is what makes a
  pattern read as a blend between two inventory colours. Independent per-channel *noise* shifts hue
  too, and against a scattered handful of inventory colours — rather than a regular colour cube,
  which is what classic per-channel dithering assumes — that scatters dominoes into unrelated hues;
  it also keeps dithering meaningful under Greyscale, where a hue nudge could not change the answer
  at all. **`pattern.ts` is what enforces this rather than leaving it as a rule to remember**: a
  pattern variant hands over a `PatternAt` returning one number and has no way to express three.
  Diffusion is the exception and earns it — its amount is a *measurement* of how the last choice
  missed, not invented noise, and passing it on is self-correcting (overshooting red makes the next
  domino pick something less red). That is exactly what lets red and blue dominoes average into a
  purple the inventory does not hold.
- **`base.ts`'s `scanRunsForward(row)` is the single definition of serpentine order, and it has two
  readers that must agree**: `image-map/mapping.ts` when it sorts the dominoes, and a diffusing run
  when it decides which side of a domino is "ahead". Both derive it from `row` alone rather than
  counting rows as they go, specifically so a row with no targets in it cannot put them out of step.
  If they ever disagree, half the rows hand their shortfall to dominoes already finished with.
- **The 0-255 clamp in `mapping.ts` *is* the runaway guard — do not add a second cap on carried
  error.** A neutral-only palette asked for a saturated colour would otherwise accumulate chroma it
  can never discharge. Clamping the colour that gets *asked about* stops it at the source: once a
  channel is pinned at an end, the shortfall measured against it cannot keep growing. (The clamp is
  applied for every dither, not just diffusion. It changes nothing for four of the five metrics,
  which already clamp inside `linearRgb.ts`'s `toByteIndex`.)
- **Diffusion ignores the measured amplitude, and that is not an oversight.** `resolveDitherAmplitude`
  returns `0` for a palette the grey ramp cannot tell apart — red and blue only, say — which
  correctly silences the patterns, there being no lightness axis to nudge along. Diffusion still
  works there, because its shortfall is measured rather than scaled from the palette. Feeding the
  amplitude into the diffusion path would break exactly that case.
- **The shortfall stopping at a hole is a decision, not a gap.** A run only visits the dominoes it
  may colour, so error aimed at a hand-painted one lands in the buffer and is never read. Three
  reasons it stays that way: the natural order of work is to map a blank field *first* and paint on
  top afterwards, so there are rarely holes when mapping runs; a region deliberately outside the
  picture is arguably right to be a hard edge; and diffusion flowing *around* an obstacle is a usable
  effect. An earlier version of this file anticipated "measure through them" as the obvious next
  step — it is an option not taken, and it would cost a full-grid scan instead of a target-list one,
  a third method on `DitherRun`, sampling the picture for dominoes the run will not colour, and a
  large false shortfall wherever the hand-painting disagrees with the picture.
- **`none` is a registered entry**, deliberately unlike shape-select's Rectangle. Rectangle is
  excluded there because `null` already encodes it and two encodings of one state is a bug waiting
  to happen; here the value backs a `<select>`, whose value is a string, so a `DitherId | null` would
  put a special case in the store, the panel and the mapping run to save four lines.
- **`random` hashes `(row, col)` and must never call `Math.random()`.** A run has to be
  reproducible, or pressing Map Colors twice gives two different fields and comparing a metric or a
  strength setting becomes impossible.
- **`diffusion.ts`'s ring of error rows takes its depth from the weights**, `1 + max(rowsAhead)`,
  and must not be fixed at two. Floyd–Steinberg reaches one row ahead and Atkinson two, so a
  hard-coded pair of rows would silently drop Atkinson's last weight — it would still map, still
  look like dithering, and just be a slightly wrong kernel, which is the worst kind of bug to
  notice. Holding only a few rows rather than the whole field is itself sound for a reason worth
  keeping in view: a weight only ever points *forward*, so once a row has been walked nothing can
  add to it again.

Both kinds are indexed through the type's own `dominoRowCol` — already contracted to be
*structurally* meaningful, so adjacent dominoes differ by 1 in exactly one coordinate — which is
what makes dithering correct for a polar element type as readily as for a field, and makes a type
declaring none simply get no dithering. That adjacency is load-bearing twice over now: a pattern
needs it to land on the dominoes, and diffusion needs it to hand a shortfall to the domino
physically next door. Note a Bayer repeat is a **rectangle** on the ground, since a field's X and Y
pitch differ; indexing by row/col is still right.

**A *pattern* variant returns only the pattern — a unit value in `[-0.5, +0.5)` — and knows nothing
about bytes.** How far to push it is `image-map/ditherAmplitude.ts`'s
`resolveDitherAmplitude(metric, candidates)`, measured **once per run from the palette**, and the
slider is a multiplier on that. So the amplitude lives at the seam between the two registries rather
than in either, `dither/` never imports `color-distance/`, and a new pattern cannot disagree with the
existing ones about how hard to nudge.

**The strength slider means the natural thing in each kind, and `mapping.ts` no longer multiplies
the two together.** `ColorMappingSettings` carries `ditherAmplitude` and `ditherStrength`
separately, because a pattern scales its pattern by both while diffusion ignores the amplitude and
uses the strength to decide how much of its shortfall to pass on. At 0 both do nothing, which is
what keeps "0% is identical to None" true without a special case.

**`mapping.ts` does a grid pre-pass at job creation**: every target's row and column into two
`Int32Array`s, the column range for the run context, and — only when the dither asks for it — a
`Uint32Array` sorted into serpentine order. It is a small win even for the patterns, saving the loop
a call and a fresh `{row, col}` object per domino. The chosen colour's RGB, which diffusion needs to
measure against, comes from `colorLookupStore.ts`'s `rgbById`, **snapshotted into
`ColorMappingSettings` by the caller** alongside `candidates` — deliberately not by widening
`PreparedColor` with three fields four of the five metrics would never read, and snapshotted rather
than read live because a run spans many frames and an inventory edit must not shift the table
underneath it.

**Measuring it is not optional tuning — a constant is wrong by construction**, and this shipped
once. `MAX_DITHER_AMPLITUDE_BYTES` was a flat `64`, which is exactly right for a five-level palette
and wrong everywhere else: the textbook ordered-dither amplitude is `255 / (N - 1)`, so a
black-and-white inventory wants `255` and a forty-colour one wants about `7`. With black and white
the symptom was a photograph coming out as a plain threshold — Greyscale's only boundary is
L\* = 50, sRGB byte 119, and a ±32 nudge can only flip patches averaging 87–151, a quarter of the
range. The other direction was invisible but real: a full inventory was being over-nudged ninefold,
which is why the slider had to be kept low there.

**The measurement is a grey-ramp probe, and asking through `nearestColor` is the whole trick.** It
walks `v` = 0…255, asks the *selected metric* which candidate wins for `(v, v, v)`, and counts the
distinct answers — so Greyscale, which throws most of the inventory away in `prepare`, measures a
much coarser palette than OKLab does over the same inventory, and switching metric re-measures with
no extra code. Reading the inventory directly instead would need each candidate's RGB on
`PreparedColor` — widening a type four metrics implement, to compute a worse answer that ignores
which colours the metric will actually use. (Error diffusion *does* need a chosen candidate's RGB,
and gets it from `colorLookupStore.ts`'s `rgbById` for the same reason — the two agree deliberately,
so don't resolve the apparent tension by putting RGB on `PreparedColor` after all.) It costs 256 lookups per run and is computed
unconditionally; branching on `ditherId === "none"` to skip it would put registry knowledge back in
the caller to save microseconds. Fewer than two distinct winners returns `0`, so the caller
multiplies and needs no branch — the same idiom as `dominoes/expansion.ts`'s zeroed record and
`NO_SNAP`.

It measures how finely the palette divides *lightness*, which is the axis a **pattern** moves a
colour along, and is therefore an estimate for a palette of strong colours, which divides lightness
differently at different hues. That is what the strength slider sits on top of. The panel's range
stops at 100% because past one full palette step a domino takes colours that are not adjacent to its
true one — scatter, not blending — and full strength is the textbook half-step rather than an
aggressive setting, so `DEFAULT_DITHER_STRENGTH` is free to sit wherever it looks best without any
of this needing to change.

**Note the whole of this only concerns the pattern dithers.** A diffusing one never reads the
amplitude (see the fifth bullet above), so nothing here bounds what Floyd–Steinberg or Atkinson do,
and the strength slider means something different to them — how much of the shortfall is passed on.
