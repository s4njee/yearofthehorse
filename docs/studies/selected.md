# Cost study: selected effects

Measured 2026-10-31 on **Apple M1 Max** (apple-silicon), Dawn (node webgpu bindings).

Method: GPU timestamps: frame span (first pass start to last pass end) and marginal cost per extra frame. 12 warm-up frames, then the median of 11 rounds; each round encodes the frame once and 4 times in one command buffer.

- **span** is one frame alone, first pass start to last pass end. It includes the timing floor of this adapter (the `(floor)` row).
- **per frame** is the cost of one more frame of the same work (the slope). It is the number to compare effects by, and the one the Scorecard shows.
- `(tail)` is the HDR tail alone at its default settings. Every effect below includes it.

Only this adapter was measured. spanMs includes the timing floor (see the "(floor)" rows); slopeMs is the cost of one more frame of the same work and is the number to compare by. A slope at or below zero means the work is below what this method can resolve.

Two limits on reading these numbers. Repeated runs of a light effect differ by up to about half a millisecond (see the Range column), and a GPU's clock follows its load, so a light effect can read slower per unit of work than a heavy one: differences under about half a millisecond mean nothing. And the Tier A and B budgets are set for an integrated GPU; a time measured on a faster one can show an effect is over budget but cannot show that it fits.

## 1920 × 1080

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.07 | -0.02 to 0.28 |
| (tail) | constant scene + bloom + output | 11 | 0.72 | 0.46 | 0.24 to 0.90 |
| river-tour | default | 14 | 1.31 | 1.22 | 0.76 to 1.70 |
| river-tour | preset tour | 14 | 1.38 | 1.46 | 0.83 to 2.53 |
| river-tour | preset plain | 13 | 1.38 | 1.18 | 0.92 to 1.99 |
| river-tour | preset clear | 14 | 1.05 | 0.79 | 0.44 to 1.81 |
| river-tour | preset photograph | 14 | 1.38 | 1.18 | 0.94 to 1.46 |

## 960 × 540

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.04 | 0.00 to 0.09 |
| (tail) | constant scene + bloom + output | 9 | 0.46 | 0.33 | 0.31 to 0.48 |
| river-tour | default | 12 | 0.79 | 0.70 | 0.44 to 1.44 |
| river-tour | preset tour | 12 | 0.85 | 0.68 | 0.15 to 1.92 |
| river-tour | preset plain | 11 | 0.98 | 0.98 | 0.55 to 1.64 |
| river-tour | preset clear | 12 | 0.59 | 0.63 | 0.37 to 0.81 |
| river-tour | preset photograph | 12 | 0.85 | 0.74 | 0.50 to 1.35 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (8.5 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
| river-tour | 21 | 18.2 | 68.5 |
