# Safety

Year of the Horse inherits The Hero's Journey's checks, unchanged: the WCAG 2.3.1 flash and red-flash analyser, the regular-pattern analyser after the ITC (Ofcom) guidance, whole-field motion caps from optical flow, red-capped colour, the start gate and held frames. Their rules, sources and limits are written up in [The Hero's Journey's docs/safety.md](../../herosjourney/docs/safety.md). Every effect and preset here runs through them in `npm test`, at the default and at the strong dose (0.7).

The hazards this family expects are in [plan.md](../plan.md): bursts and salutes as flashes, strobe and glitter stars and firecracker strings as rapid flashing, Lunar New Year's saturated red, chasing bulbs and scrolling LED text as moving patterns, neon flicker as it strikes and fails, and bursts expanding as a zoom.

What this family has found so far:

- **A burst's expansion reads as a zoom.** On a dark sky the motion check can only track the stars, so one expanding burst is the whole field it fits. With stars slowed gently (drag 1.5 a second), the median zoom over a run was over the cap. Stars that stop within about a second, as real stars of a few grams do (drag 3 to 3.6 a second), pass with three shells in the air; the strong dose is held to four. Whether a burst in part of the view is whole-field motion at all is plan story 2.8.
- **Falling stars read as drift.** Stars falling at a third to half of the burst's radius a second read 0.06 to 0.1 screen widths a second, over the cap of 0.05. Real stars fall at a tenth to a fifth of the radius a second, and that passes.
- **A burst of thick streaks is a grating.** Streaks a fixed 1.6 px wide in the 480 × 270 test frame (taken as a 1920-pixel view) read pattern `high`. Drawn in proportion to the burst, a pixel wide with their light kept where they would be thinner, they read `none`.
- **A red peony is a red flash.** One analyser cell flashed red once in four seconds as a strontium-red burst lit and burnt out in it: flash `low`, declared, far under three a second.
