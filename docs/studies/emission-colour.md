# Star colours from emission spectra

Story 2.2. Each composition's spectrum (its bands as Gaussians, plus a blackbody continuum carrying the given share of the power) integrated against the CIE 1931 2° observer (Wyman, Sloan and Shirley's fit), then mapped into sRGB and Display P3 as a light: a colour outside the gamut becomes the most saturated colour of its hue the gamut holds. Made by `node experiments/emission-table.ts` from `src/gpu/spectra/emission.ts`; checked by `tests/spectra.test.ts`.

Band centres are from the pyrotechnic literature, rounded; widths and strengths are rough. The swatches are the mapped colours at full brightness, as CSS.

| Composition                   | Emitter                           | Bands                                | Continuum      | x, y         | In sRGB | In P3 | sRGB      | Display P3                            |
| ----------------------------- | --------------------------------- | ------------------------------------ | -------------- | ------------ | ------- | ----- | --------- | ------------------------------------- |
| Strontium red                 | SrCl and SrOH                     | 606, 636, 648, 662, 682 nm           | 15% at 2400 K  | 0.661, 0.325 | no      | yes   | `#ff0a0b` | `color(display-p3 1.000 0.144 0.099)` |
| Barium green                  | BaCl                              | 507, 513, 517, 524, 532 nm           | 20% at 2400 K  | 0.133, 0.745 | no      | no    | `#00ffa1` | `color(display-p3 0.000 1.000 0.568)` |
| Copper blue                   | CuCl                              | 428, 435, 443, 452, 476, 488 nm      | 20% at 1800 K  | 0.169, 0.042 | no      | no    | `#6600ff` | `color(display-p3 0.376 0.000 1.000)` |
| Sodium yellow                 | Na (the D lines)                  | 589, 589.6 nm                        | 10% at 2400 K  | 0.566, 0.432 | no      | no    | `#ff930c` | `color(display-p3 1.000 0.589 0.026)` |
| Calcium orange                | CaCl and CaOH                     | 554, 593, 618, 622 nm                | 15% at 2400 K  | 0.600, 0.394 | no      | no    | `#ff7102` | `color(display-p3 1.000 0.460 0.006)` |
| Violet (strontium and copper) | SrCl and CuCl together            | 428, 435, 443, 452, 636, 648, 662 nm | 15% at 1900 K  | 0.237, 0.054 | no      | no    | `#c50cff` | `color(display-p3 0.724 0.000 1.000)` |
| Charcoal gold                 | charcoal and iron sparks, glowing | —                                    | 100% at 1900 K | 0.535, 0.414 | no      | yes   | `#ff8804` | `color(display-p3 1.000 0.592 0.219)` |
| Magnesium white               | MgO and Al2O3 particles, glowing  | —                                    | 100% at 3300 K | 0.416, 0.397 | yes     | yes   | `#ffc280` | `color(display-p3 1.000 0.801 0.562)` |

## What the numbers say

- **Every strong firework colour is outside sRGB.** Strontium red, barium green, copper blue, sodium yellow, calcium orange and the violet all fall outside it. On an sRGB canvas each is shown as the most saturated colour of its hue that sRGB has, which is always duller than the real one.
- **Display P3 holds the red and the gold, not the green or the blue.** Strontium red (x 0.661) and charcoal gold fit inside P3, so a P3 canvas shows them as they are. Barium green and copper blue are outside P3 too: the green is far beyond P3's green primary, and the blue is nearly on the spectral locus.
- **The continuum is the purity.** A blackbody behind the bands pulls every colour towards white. A star with more magnesium in it burns brighter and paler, which is the trade a pyrotechnist makes; the `continuum` share is that trade.
- **Gold and white are not colours a salt gives.** They are glowing particles: charcoal and iron at about 1 900 K for gold, magnesium and aluminium oxides at over 3 000 K for white.
- **A light maps by its cusp, not at its lightness.** The shared gamut mapping, made for surfaces, keeps lightness and reduces chroma, and turned copper blue into a pale lavender, because every blue the gamut holds is dark. A light's brightness is free, so it maps to the cusp of its hue.
