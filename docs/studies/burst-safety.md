# Burst safety

Story 2.8. What the family's safety checks make of a firework burst, and a proposal for the shared rules. By `experiments/burst-safety.test.ts` (raw numbers in [burst-safety.json](burst-safety.json)) and `experiments/finale-safety.test.ts` ([finale-safety.json](finale-safety.json)), at the analysers' 480 × 270 frame, which they take as a 1920-pixel view.

## A burst, through the motion check

One 6-inch shell's stars (110 of the star model's medium kind), drawn as dots on black at four sizes and two places, read a sixth of a second apart at four ages after the break:

| Burst radius (share of the view's width) | Age   | Zoom read (doublings/s) | Burst's own growth | Drift read from a corner (widths/s) | Share of the view the reading came from |
| ---------------------------------------- | ----- | ----------------------- | ------------------ | ----------------------------------- | --------------------------------------- |
| 0.06                                     | any   | 0 (under 20 blocks)     | 0.42 to 3.3        | 0                                   | 0                                       |
| 0.12                                     | 1.5 s | 0.42                    | 0.42               | 0.094                               | 0.11                                    |
| 0.25                                     | 0.8 s | 1.12                    | 1.14               | 0.254                               | 0.18                                    |
| 0.25                                     | 1.5 s | 0.42                    | 0.42               | 0.098                               | 0.31 to 0.39                            |
| 0.5                                      | 1.5 s | 0.43                    | 0.42               | 0.111                               | 0.56 to 0.83                            |

- **The zoom reading is the burst's own growth.** Whenever the estimator can track a burst, it reads the burst's growth in log terms almost exactly (0.42 against 0.42; 1.12 against 1.14), whatever its size. A burst grows at 0.4 to 1.1 doublings a second for its first second and a half, four to eleven times the cap of 0.1.
- **Off-centre, it is also a drift.** A zoom about the burst's centre is a zoom about the frame's centre plus a drift, so a burst in a corner also reads 0.1 to 0.25 screen widths a second of drift, two to five times that cap.
- **Small bursts are invisible.** Under about a twentieth of the view's width, a burst never gives the 20 trackable blocks the estimator needs, and reads zero at every age.
- **So the check passes most displays by not seeing them.** At their defaults, `peony-display`, `warimono` and `display` read zero in most of their readings and 0.17 to 0.67 in the rest. The median of a run is zero, so they pass. `willow`'s dense tails are trackable more often, and its median goes over.
- **What is read is local.** Readings over the cap in the family's displays came from 7% to 29% of the view at their defaults, against a tunnel's or a spiral's 100%. Overlapping bursts at the strong dose gave one from 55%.

## A salute, through the flash check

A white disc that flashes for 60 ms (relative luminance 0.9 at its centre), three sizes, one to five a second:

| Salute radius (share of width) | 1 a second | 2   | 3   | 4    | 5    |
| ------------------------------ | ---------- | --- | --- | ---- | ---- |
| 0.05                           | low        | low | low | high | high |
| 0.12                           | low        | low | low | high | high |
| 0.25                           | low        | low | low | high | high |

A salute is one flash of a cell per break, so the rule is the count: any size passes up to three a second and fails at four. Even the smallest one covers more than the analyser's small-area allowance (37 000 CSS px² against 21 824). The limit for salutes, and for breaks in a finale, is **no two closer than a third of a second over the same part of the view**. `display`'s finale breaks every 0.4 s.

## The display's whole loop

The normal checks look at a few seconds after the held moment, which never reaches the finale at the end of `display`'s 90-second programme. The whole loop:

| Preset   | Dose    | Flash | Most flashes of one cell in a second (red) | Median zoom | Readings over the cap (of 90) | Largest share of the view an over-cap reading came from |
| -------- | ------- | ----- | ------------------------------------------ | ----------- | ----------------------------- | ------------------------------------------------------- |
| `hanabi` | default | low   | 1 (1)                                      | 0           | 16                            | 0.12                                                    |
| `hanabi` | 0.7     | low   | 1 (1)                                      | 0           | 16                            | 0.55                                                    |
| `finale` | default | low   | 1 (1)                                      | 0           | 16                            | 0.21                                                    |
| `finale` | 0.7     | low   | 1 (1)                                      | 0           | 11                            | 0.29                                                    |

The finale, thirty breaks 0.4 s apart over twelve seconds, stays `low`: its breaks are spread across the view, so no cell flashes more than once a second. Over the loop, one reading in six to eight sees a burst grow faster than the cap; the median is zero, so the display passes, as `peony-display` does. At the strong dose one reading came from 55% of the view, where two bursts overlapped.

## Proposal for the shared rules

The whole-field caps (5° a second of turn, 0.1 doublings a second of zoom, 0.05 widths a second of drift) were written for motion of the whole view: tunnels, spirals and kaleidoscopes. The vestibular risk they guard against comes from large-field optic flow. A firework burst is looming in part of the view. Under the caps as they are:

- the calmest shell here, a willow, goes over, and the quieter its display the worse it reads, because one fresh burst is then all the analyser sees;
- displays pass mostly because the analyser cannot see their bursts, which is luck, not safety.

Proposed:

1. **Report the share of the view a motion reading comes from**, as `area` (the bounding box of the blocks the fit kept, as a share of the frame). This is done, in this family's `src/gpu/safety/motion.ts`; it changes no verdict.
2. **Apply the whole-field caps to readings from at least a quarter of the view.** A quarter is the share WCAG 2.3.1 uses for a flash's area (a quarter of the central 10° of vision, which a 1920-pixel view at a typical distance mostly is), and the readings mostly sort around it: single bursts in the displays read from 29% of the view or less, a tunnel from 100%. Overlapping bursts (55%) and a burst half the view's width (up to 83%) would count as whole-field, which is right: by then the view is filled.
3. **Hold local looming to its own cap**: under a quarter of the view, a zoom of up to 1.5 doublings a second (a burst's first second), and no more than one such region growing at a time per half of the view. Faster or more is a gated setting.
4. **Keep the drift cap whole-field only**: a burst's drift reading is its zoom about an off-centre point, not motion.

This is the same question as Wind Temple's lone flag over a flat page (its story 2.7): one moving thing in a still view. The rule above serves both.

**Until the rules change**, this family keeps the caps as they are, and an effect whose own defaults go over them is declared with `motionDefaults` in its scorecard: every setting of it starts behind the gate, the gallery does not play it, and the notice offers no calm version. `willow` is the one so far.
