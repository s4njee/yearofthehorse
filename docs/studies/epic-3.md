# Cost study: Epic 3

Measured 2026-10-30 on **Apple M1 Max** (apple-silicon; Dawn now reports it as "Metal driver on macOS Version 26.6.2"), Dawn (node webgpu bindings).

Method: GPU timestamps: frame span (first pass start to last pass end) and marginal cost per extra frame. 12 warm-up frames, then the median of 11 rounds; each round encodes the frame once and 4 times in one command buffer.

- **span** is one frame alone, first pass start to last pass end. It includes the timing floor of this adapter (the `(floor)` row).
- **per frame** is the cost of one more frame of the same work (the slope). It is the number to compare effects by, and the one the Scorecard shows.
- `(tail)` is the HDR tail alone at its default settings. Every effect below includes it.

Only this adapter was measured. spanMs includes the timing floor (see the "(floor)" rows); slopeMs is the cost of one more frame of the same work and is the number to compare by. A slope at or below zero means the work is below what this method can resolve.

Two limits on reading these numbers. Repeated runs of a light effect differ by up to about half a millisecond (see the Range column), and a GPU's clock follows its load, so a light effect can read slower per unit of work than a heavy one: differences under about half a millisecond mean nothing. And the Tier A and B budgets are set for an integrated GPU; a time measured on a faster one can show an effect is over budget but cannot show that it fits.

## 1920 × 1080

| Effect         | Configuration                   | Passes | Span (ms) | Per frame (ms) | Range (ms)   |
| -------------- | ------------------------------- | -----: | --------: | -------------: | ------------ |
| (floor)        | one constant-colour pass        |      1 |      0.07 |           0.07 | 0.04 to 0.09 |
| (tail)         | constant scene + bloom + output |     11 |      0.72 |           0.68 | 0.66 to 0.70 |
| crossette      | default                         |     11 |      1.25 |           1.07 | 0.96 to 1.11 |
| crossette      | preset crossettes               |     11 |      1.25 |           1.07 | 1.03 to 1.09 |
| crossette      | preset early                    |     11 |      1.25 |           1.05 | 1.03 to 1.09 |
| crossette      | preset quiet                    |     11 |      1.25 |           1.05 | 0.98 to 1.09 |
| display        | default                         |     13 |      1.84 |           1.49 | 0.87 to 2.88 |
| display        | preset hanabi                   |     13 |      1.51 |           1.25 | 0.83 to 2.49 |
| display        | preset finale                   |     13 |      1.70 |           1.49 | 1.33 to 1.75 |
| display        | preset clear                    |     13 |      1.51 |           1.27 | 1.20 to 1.27 |
| display        | preset still                    |     13 |      1.51 |           1.38 | 0.96 to 1.92 |
| display        | preset photograph               |     13 |      1.90 |           1.31 | 1.00 to 2.29 |
| glitter-finale | default                         |     11 |      0.85 |           0.66 | 0.50 to 0.81 |
| glitter-finale | preset glitter                  |     11 |      1.11 |           0.94 | 0.94 to 0.96 |
| glitter-finale | preset crackle                  |     11 |      1.11 |           0.98 | 0.96 to 1.03 |
| glitter-finale | preset strobe                   |     11 |      1.05 |           0.90 | 0.90 to 0.94 |
| glitter-finale | preset full-strobe              |     11 |      1.05 |           0.90 | 0.87 to 0.92 |
| palm-and-ring  | default                         |     11 |      0.92 |           0.83 | 0.81 to 1.00 |
| palm-and-ring  | preset palms                    |     11 |      0.92 |           0.83 | 0.81 to 0.85 |
| palm-and-ring  | preset rings                    |     11 |      0.98 |           0.87 | 0.85 to 0.90 |
| palm-and-ring  | preset quiet                    |     11 |      0.98 |           0.85 | 0.83 to 0.87 |
| peony-display  | default                         |     11 |      1.05 |           0.92 | 0.90 to 0.94 |
| peony-display  | preset display                  |     11 |      1.05 |           0.92 | 0.90 to 0.92 |
| peony-display  | preset quiet                    |     11 |      1.05 |           0.92 | 0.90 to 0.92 |
| peony-display  | preset close                    |     11 |      1.05 |           0.92 | 0.90 to 0.94 |
| peony-display  | preset distant                  |     11 |      1.05 |           0.92 | 0.90 to 0.94 |
| shaped-shells  | default                         |     11 |      1.05 |           0.92 | 0.90 to 0.96 |
| shaped-shells  | preset hearts                   |     11 |      1.05 |           0.92 | 0.87 to 0.92 |
| shaped-shells  | preset horses                   |     11 |      1.05 |           0.92 | 0.90 to 0.92 |
| shaped-shells  | preset staged                   |     11 |      1.05 |           0.92 | 0.90 to 0.92 |
| shaped-shells  | preset quiet                    |     11 |      1.05 |           0.92 | 0.90 to 0.94 |
| warimono       | default                         |     11 |      1.05 |           0.92 | 0.90 to 0.96 |
| warimono       | preset yae                      |     11 |      1.05 |           0.92 | 0.90 to 0.94 |
| warimono       | preset henka                    |     11 |      1.05 |           0.94 | 0.90 to 0.96 |
| warimono       | preset quiet                    |     11 |      1.05 |           0.92 | 0.90 to 0.94 |
| willow         | default                         |     11 |      1.05 |           0.90 | 0.87 to 0.94 |
| willow         | preset willow                   |     11 |      0.98 |           0.85 | 0.85 to 0.90 |
| willow         | preset kamuro                   |     11 |      1.05 |           0.90 | 0.87 to 0.92 |
| willow         | preset quiet                    |     11 |      1.05 |           0.92 | 0.90 to 0.94 |
| display        | finale, smoke at an eighth      |     13 |      1.18 |           1.09 | 0.96 to 2.18 |
| display        | finale, smoke at a quarter      |     13 |      1.57 |           1.35 | 1.25 to 2.14 |
| display        | finale, smoke at a half         |     13 |      2.23 |           1.70 | 1.33 to 2.97 |
| display        | no smoke, no river              |     13 |      0.72 |           0.57 | 0.50 to 0.74 |

## 960 × 540

| Effect         | Configuration                   | Passes | Span (ms) | Per frame (ms) | Range (ms)   |
| -------------- | ------------------------------- | -----: | --------: | -------------: | ------------ |
| (floor)        | one constant-colour pass        |      1 |      0.00 |           0.07 | 0.04 to 0.11 |
| (tail)         | constant scene + bloom + output |      9 |      0.46 |           0.33 | 0.26 to 0.35 |
| crossette      | default                         |      9 |      0.72 |           0.57 | 0.55 to 0.61 |
| crossette      | preset crossettes               |      9 |      0.72 |           0.57 | 0.55 to 0.61 |
| crossette      | preset early                    |      9 |      0.46 |           0.35 | 0.28 to 0.48 |
| crossette      | preset quiet                    |      9 |      0.72 |           0.57 | 0.50 to 0.59 |
| display        | default                         |     11 |      1.51 |           1.46 | 0.87 to 1.66 |
| display        | preset hanabi                   |     11 |      1.51 |           1.42 | 1.14 to 1.59 |
| display        | preset finale                   |     11 |      1.90 |           1.40 | 0.79 to 1.73 |
| display        | preset clear                    |     11 |      0.85 |           0.68 | 0.61 to 0.72 |
| display        | preset still                    |     11 |      0.98 |           0.85 | 0.66 to 1.05 |
| display        | preset photograph               |     11 |      1.38 |           1.16 | 0.98 to 1.79 |
| glitter-finale | default                         |      9 |      0.59 |           0.48 | 0.44 to 0.50 |
| glitter-finale | preset glitter                  |      9 |      0.33 |           0.31 | 0.31 to 0.35 |
| glitter-finale | preset crackle                  |      9 |      0.52 |           0.44 | 0.28 to 0.52 |
| glitter-finale | preset strobe                   |      9 |      0.52 |           0.42 | 0.37 to 0.44 |
| glitter-finale | preset full-strobe              |      9 |      0.52 |           0.39 | 0.33 to 0.44 |
| palm-and-ring  | default                         |      9 |      0.39 |           0.37 | 0.35 to 0.42 |
| palm-and-ring  | preset palms                    |      9 |      0.39 |           0.37 | 0.35 to 0.42 |
| palm-and-ring  | preset rings                    |      9 |      0.46 |           0.39 | 0.35 to 0.44 |
| palm-and-ring  | preset quiet                    |      9 |      0.46 |           0.37 | 0.35 to 0.39 |
| peony-display  | default                         |      9 |      0.59 |           0.39 | 0.37 to 0.48 |
| peony-display  | preset display                  |      9 |      0.52 |           0.42 | 0.39 to 0.48 |
| peony-display  | preset quiet                    |      9 |      0.33 |           0.33 | 0.31 to 0.35 |
| peony-display  | preset close                    |      9 |      0.46 |           0.35 | 0.31 to 0.42 |
| peony-display  | preset distant                  |      9 |      0.52 |           0.42 | 0.35 to 0.44 |
| shaped-shells  | default                         |      9 |      0.59 |           0.42 | 0.35 to 0.46 |
| shaped-shells  | preset hearts                   |      9 |      0.52 |           0.44 | 0.39 to 0.46 |
| shaped-shells  | preset horses                   |      9 |      0.59 |           0.42 | 0.42 to 0.46 |
| shaped-shells  | preset staged                   |      9 |      0.52 |           0.42 | 0.37 to 0.46 |
| shaped-shells  | preset quiet                    |      9 |      0.59 |           0.42 | 0.33 to 0.44 |
| warimono       | default                         |      9 |      0.33 |           0.35 | 0.33 to 0.39 |
| warimono       | preset yae                      |      9 |      0.52 |           0.42 | 0.35 to 0.46 |
| warimono       | preset henka                    |      9 |      0.59 |           0.44 | 0.37 to 0.46 |
| warimono       | preset quiet                    |      9 |      0.52 |           0.46 | 0.42 to 0.48 |
| willow         | default                         |      9 |      0.33 |           0.33 | 0.28 to 0.33 |
| willow         | preset willow                   |      9 |      0.39 |           0.37 | 0.31 to 0.42 |
| willow         | preset kamuro                   |      9 |      0.52 |           0.39 | 0.35 to 0.44 |
| willow         | preset quiet                    |      9 |      0.59 |           0.48 | 0.44 to 0.61 |
| display        | finale, smoke at an eighth      |     11 |      0.79 |           0.61 | 0.52 to 0.72 |
| display        | finale, smoke at a quarter      |     11 |      0.98 |           0.79 | 0.52 to 1.42 |
| display        | finale, smoke at a half         |     11 |      1.31 |           0.98 | 0.79 to 2.23 |
| display        | no smoke, no river              |     11 |      0.59 |           0.46 | 0.39 to 0.59 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (8.0 kB gzipped, no shaders).

| Effect         | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| -------------- | -----: | ------------------: | --------------: |
| crossette      |     14 |                 0.3 |            39.0 |
| display        |     18 |                 2.4 |            48.4 |
| glitter-finale |     14 |                 0.4 |            39.1 |
| palm-and-ring  |     14 |                 0.4 |            39.0 |
| peony-display  |     13 |                 0.3 |            38.3 |
| shaped-shells  |     13 |                 2.1 |            40.0 |
| warimono       |     14 |                 0.4 |            39.0 |
| willow         |     14 |                 0.4 |            39.1 |
