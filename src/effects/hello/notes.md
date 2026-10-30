## How it works

One instanced draw of short streaks (`fireworks.wgsl`), added into the HDR scene, then the shared tail with its bloom, over the page. Up to four shells are in the air, each a rising comet and 120 stars. Everything about a star is a pure function of its shell, its index and the time: where the shell breaks, which way the star leaves, how far it has flown, how bright it burns. There is no state, so a held frame and a poster are the same stars.

- **Shells.** Each of the shell slots launches once a period, the slots spread evenly through it, so breaks are spaced and never land together. A comet rises from below the view, slowing to its break.
- **Flight.** A star leaves the break at the shell's speed and is slowed by the air and pulled down by gravity. With drag proportional to speed (a = g − kv), the path has a closed form: p = p₀ + v_t t + (v₀ − v_t)(1 − e^(−kt)) / k, with v_t = g / k the speed at which it falls once the air has stopped it. No integration, so any frame can be drawn at any time.
- **The burst's shape.** Stars leave in directions spread evenly over a sphere (a Fibonacci spiral, turned per shell), seen from the side. A burst is a filled globe, brightest at its rim where the stars are seen edge-on, not a flat ring.
- **Colour.** Each peony takes one of the colour-giving metals' emission colours: strontium's red, barium's green, copper's blue, sodium's yellow, and strontium and copper's violet. One shell in three is a chrysanthemum of charcoal stars, whose gold is a blackbody's glow, not a line. These are hand-picked linear colours for now; story 2.2 derives them from spectra.
- **Trails.** A peony's stars leave almost no trail (an eighth of a second). A chrysanthemum's shed sparks that live three quarters of a second, so they draw long gold tails that droop as the stars slow. The streak is the star's own past path, recomputed, so it survives resizes and pauses. The head keeps the star's brightness, and the tail fades behind it.
- **Burning.** A star lights over a quarter of a second, so the break is not a step, and burns out in its own time (75% to 125% of the mean), so a burst thins away rather than switching off.
- **Size.** A burst's radius is a fifth of the canvas's shorter side. A streak's width is in proportion to the burst. Thinner than a pixel, it is drawn a pixel wide with its light kept.

`dose` ("intensity") sets how many shells are in the air (one to four), their size and their brightness. `size` and `pace` scale the bursts and how often they come. The held frame shows each shell open at its own age, never at a break.

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-1.md](../../../docs/studies/epic-1.md)): 0.55 ms per frame at 1080p, the HDR tail included. The tail alone measures 0.92 ms in the same run, so most of the cost is the bloom, and repeated runs differ by about half a millisecond. In Chrome, one frame on a 1920 × 1080 canvas reads 0.71 ms (0.70 to 0.73 over 3 loads, [browser-check.md](../../../docs/studies/browser-check.md)): Tier A on this machine. 28 kB gzipped with the shared chunks.

## Pitfalls

- **A burst's expansion reads as a zoom.** On a dark sky the motion check can only track the stars, so one expanding burst is the whole field it fits. With stars slowed gently (drag 1.5 a second), bursts kept expanding for most of their life and the median zoom read over the cap. Real stars of a few grams stop within about a second. With drag at 3 to 3.6 a second, three shells at the default pass, and the strong dose is held to four.
- **Fast-falling stars read as drift.** The first version let stars fall at a third to half of the burst's radius a second, for a visible droop. That read 0.06 to 0.1 screen widths a second of whole-field drift, over the cap of 0.05. Real stars fall at about a tenth to a fifth of the radius a second, and that passes. A burst that hangs in the sky is the real look.
- **Thick streaks are a grating.** At a fixed 1.6 px, 120 streaks in the 480 × 270 test frame (which the analyser takes as a 1920-pixel view) were a field of bright stripes, and the pattern check read `high`. Streaks in proportion to the burst read `none`.
- **Hand-picked colours.** The colours are chosen, not derived, and sRGB cannot show the real barium green or strontium red. Story 2.2 replaces them.

## Safety

Flash `low`: one analyser cell flashes red once in four seconds, as a strontium-red peony lights and burns out in it, far under three a second. Pattern `none`. Motion inside the caps up to the strong dose. No preset goes over.

## When to use it

As the template for a new effect. For fireworks on a page, `peony-display` (3.1) once it is built, or Fire Temple's `fireworks` until then.

## References

- Year of the Horse [plan.md](../../../plan.md), story 1.2.
- Fire Temple's [`fireworks`](../../../../firetemple/src/effects/fireworks/notes.md), whose shells run on GPU emitters.
- Takeo Shimizu, _Fireworks: The Art, Science and Technique_ (1981), on star compositions, shells and bursts.
