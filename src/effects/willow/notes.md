## How it works

The shell renderer and programme of `peony-display`, with willow shells (`src/gpu/shells/designs.ts`). A willow's stars are big and charcoal-rich: lighter than a colour star (1100 kg/m³ against 1700), 14 mm across, burning for about five seconds. A light star slows sooner and then hangs, falling at the speed the air allows its shrinking weight, which is a willow's look. Each star sheds sparks as it burns. A shed spark falls slowly (2 m/s) and spreads, and fades over its own life, so the tail droops below the star's path. The tail is part of each star's ribbon: the samples further back along the path are the sparks shed then, moved down by how far they have fallen since.

- **Willow:** fewer stars, tails of 2.6 s.
- **Kamuro** (the brocade crown): denser, tails of 1.6 s, a little brighter. `kind: mix` makes two in five shells kamuro.

Willows are slow, so the programme is too: 12 shells a minute at the default, at least two seconds between breaks.

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-3.md](../../../docs/studies/epic-3.md)): 0.90 ms per frame at 1080p, the HDR tail included (the tail alone reads 0.68 ms). In Chrome, started past its gate, one frame on a 1920 × 1080 canvas reads 0.98 ms (0.96 to 1.00 over 3 loads, [browser-check.md](../../../docs/studies/browser-check.md)): Tier A on this machine. 39.1 kB gzipped with the shared chunks.

## Pitfalls

- **A long exposure of willows is a grating.** With the camera's trails (`trails: camera`, a 1.5 s shutter), dozens of near-parallel drooping arcs read pattern `high` (0.345 of the view). The camera is not offered here; it is in `display`, whose shells are mixed.
- **Dense crowns read as a zoom.** A kamuro's crown is the most trackable thing in the family, and its first second of expansion reads 0.1 to 0.6 zoom doublings a second: the burst's own growth (story 2.8). `kamuro` and `quiet` go over the caps and start behind the gate. `quiet` goes over because, with a shell every eight seconds, one fresh burst is all the analyser sees.
- **Gold only.** Charcoal burns at about 1 800 K, and its sparks are this colour; a willow in a salt colour is a different shell (a coloured willow's stars carry colour in a charcoal body), not built.

## Safety

Flash `low`: a cell flashes once in a few seconds as a burst lights it, sometimes red-flagged by the orange of charcoal. Pattern `none` with the eye's trails. Motion: over the zoom cap at every setting, since a fresh willow's growth is the most trackable burst in the family (0.09 to 0.35 doublings a second as medians, at the default and the strong dose). Declared `motionDefaults`, so every setting of it starts behind the gate and the gallery holds it still; see [burst-safety.md](../../../docs/studies/burst-safety.md) for why that is the rules' question as much as the effect's.

## When to use it

The calmest fireworks here: a slow, warm backdrop behind a dark hero, for a summer festival or an evening event. Its bursts move slowly and stay a long time, so text over it is easier to read than over peonies.

## References

- Year of the Horse [plan.md](../../../plan.md), story 3.2.
- Takeo Shimizu, _Fireworks: The Art, Science and Technique_ (1981), on charcoal stars, willows and kamuro.
