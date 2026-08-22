# CLAUDE.md — colour distance

Guidance for `frontend/src/color-distance/`. This registry answers *which inventory colour is
nearest to this one* for an image-mapping run; `image-map/CLAUDE.md` covers the run itself, and
`dither/CLAUDE.md` the separate registry deciding which colour gets asked about.

`color-distance/` follows the usual four-part accessor shape (map → `Id` → `_LIST` → `get`), with
**one file per metric rather than one folder**: a metric is pure arithmetic with no preview
component to keep beside it. Maths two metrics share gets its own module beside them —
`linearRgb.ts` (sRGB bytes → linear light), `lab.ts` (CIELAB) and `oklab.ts` (OKLab) are not
registered variants.

**A metric is three stages, and the middle one is the one a fresh session would drop.** `prepare`
runs once per run and depends only on the inventory; **`sample` runs once per domino** and depends
only on the colour being asked about; `distanceTo` runs once per candidate per domino and is
arithmetic. `nearestColor` is what enforces it, calling `sample` outside its own loop. Folding
`sample` back into `distanceTo` looks tidier and silently multiplies the conversion by the number of
active inventory colours — which is exactly what the original code did, unnoticed while CIELAB was
the only metric doing real work.

`prepare` both filters the inventory and precomputes per colour, which is what makes Greyscale an
ordinary metric rather than a special case somewhere else — the only thing that distinguishes it is
which colours are on the table. **"Only use the swatches I picked" narrows the *entries* before they
reach `prepare` rather than widening this contract** (`image-map/palette.ts`, below), so a metric's
own filter composes on top of it and not one metric changed when that landed. Don't move the
narrowing inside `prepare`: five metrics would each have to reimplement it, and it would then be
invisible to `resolveDitherAmplitude`, which is handed the prepared candidates.

Five metrics today. **OKLab is the default and CIELAB is kept beside it deliberately** — the two
mostly agree and part company in the deep blues, where CIELAB's hue drifts towards purple as a
colour darkens; keeping both lets a picture be judged rather than argued about. **`valueWeighted` is
built on OKLab, not CIELAB, and the choice is load-bearing**: OKLab's lightness runs 0..1 and its
colour axes reach about the same magnitude, so `VALUE_WEIGHT` is the whole of the bias with no scale
correction. Ported to CIELAB, whose lightness runs to 100, the same constant would mean something
entirely different.

**`linearRgb.ts`'s `toByteIndex` is load-bearing and its absence fails silently.** Callers
legitimately pass *averages* of pixels, so a channel is `137.42` rather than `137` — and dithering
then adds an offset on top — and reading a typed array at a fractional index gives `undefined`, not
a rounded or interpolated value. Every Lab component then becomes `NaN`, every distance becomes
`NaN`, `NaN < best` is false for every candidate, and the nearest-colour search returns nothing and
paints nothing, with no error anywhere. This shipped once and cost a debugging session: Perceptual
and Greyscale mapped nothing at all while Weighted RGB worked, because that one never indexes
anything. **TypeScript cannot catch it** — a typed array's index signature is `number` whatever the
index is. Any lookup table added here needs the same guard. Its *clamping* half is what makes a
dither offset safe to add before the conversion rather than after.
