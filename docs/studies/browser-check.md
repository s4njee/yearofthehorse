# Browser check

Every registered effect, loaded in Google Chrome 156.0.8078.74 (headless, this machine's GPU) on 2026-10-30 by `npm run browser-check`.

Views per effect: `hero-light` (1280 × 900), `hero-dark` (1280 × 900), `cards-dark` (1280 × 900), `band-light` (1280 × 900), `backdrop-dark` (1280 × 900), `phone-light` (390 × 844 at 2x), `phone-dark` (390 × 844 at 2x), `hud-1080p` (1920 × 1080). The layouts are the mock pages of the effect page; "light" and "dark" are the page tone of the stage.

- **Started** counts the views in which the effect got a canvas and drew more than a flat fill, with no fallback notice and no console error.
- **Animates** means two captures a second apart differ by more than dither in at least one view.
- **HUD** is what the performance HUD showed on a 1920 × 1080 canvas: frames per second, and the GPU time of one frame as the browser reports it (first pass start to last pass end), as the median of several page loads with the range beside it. The range is wide for the lightest effects: when there is little to draw the GPU idles, and the same page reads either near the timing floor or about twice that from one load to the next.

The HUD time is not the number the cost studies report. It is one frame measured alone, through Chrome's coarse timestamps, on a GPU that idles between frames, so it carries a floor and reads higher than the per-frame cost in `docs/studies/epic-*.md`. It is here because it is what a visitor's browser actually does. This check says nothing about how an effect looks: the screenshots do.

| Effect         | Started | Animates | HUD at 1080p                                |
| -------------- | ------: | -------- | ------------------------------------------- |
| crossette      |  8 of 8 | yes      | 60 fps, 1.24 ms (1.16 to 1.32 over 3 loads) |
| display        |  8 of 8 | yes      | 60 fps, 2.86 ms (2.58 to 2.90 over 3 loads) |
| glitter-finale |  8 of 8 | yes      | 60 fps, 0.93 ms (0.91 to 1.01 over 3 loads) |
| hello          |  8 of 8 | yes      | 60 fps, 0.80 ms (0.80 to 0.81 over 3 loads) |
| palm-and-ring  |  8 of 8 | yes      | 60 fps, 0.91 ms (0.88 to 0.97 over 3 loads) |
| peony-display  |  8 of 8 | yes      | 60 fps, 1.02 ms (0.98 to 1.05 over 3 loads) |
| shaped-shells  |  8 of 8 | yes      | 60 fps, 1.05 ms (1.03 to 1.08 over 3 loads) |
| warimono       |  8 of 8 | yes      | 60 fps, 1.04 ms (1.03 to 1.06 over 3 loads) |
| willow         |  8 of 8 | yes      | 60 fps, 0.98 ms (0.96 to 1.00 over 3 loads) |

No view logged a console error.
