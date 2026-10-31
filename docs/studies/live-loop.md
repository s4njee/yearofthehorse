# Live, Fire Temple's, or a loop

Story 3.10. A fireworks backdrop three ways: this family's displays, Fire Temple's `fireworks` (its story 7.5), and a 10-bit AV1 video loop of `display`. On this Mac (Apple M1 Max).

|                              | This family (`peony-display`, `display`)                               | Fire Temple's `fireworks`       | AV1 loop of `display`                                         |
| ---------------------------- | ---------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------- |
| GPU per frame at 1080p, Dawn | 0.92 ms (`peony-display`), 1.49 ms (`display`), the HDR tail included  | 0.31 ms (its own study)         | a video decode: no effect cost                                |
| One frame in Chrome          | 1.02 ms (`peony-display`), 2.86 ms (`display`)                         | 2.93 ms (its own browser check) | —                                                             |
| Download, gzipped            | 38.3 kB (`peony-display`), 48.4 kB (`display`), shared chunks included | 93.8 kB                         | 110 kB for 10 s at CRF 38; 218 kB at CRF 28; 353 kB at CRF 20 |
| Needs                        | WebGPU, no compute                                                     | WebGPU compute                  | an AV1 decoder                                                |
| Length                       | a 60 or 90 s programme, then it repeats                                | endless, random                 | 10 s here, then it repeats                                    |

Fire Temple's numbers are its own recorded measurements (`firetemple/src/effects/measured.json`), not a run of the same programme: running its effect from here would have written into its working tree, which has uncommitted work. Its programme is random shells, not this family's list.

## The loop

300 frames of `display` at 1920 × 1080 and 30 fps, rendered headlessly, encoded with SVT-AV1 (preset 6, one keyframe). Mean PSNR at CRF 38 is 25.5 dB against the frames, which says little for a mostly black picture; looking says more:

- **At CRF 38 (110 kB) the fresh burst is gone.** A burst a few tenths of a second old, its stars a few pixels apart inside its own bright smoke, comes out as a smooth glow. Older stars against dark sky survive; the smoke's gradients do too, in 10-bit.
- **At CRF 28 (218 kB) it is soft**, and at CRF 20 (353 kB) the stars are back. A faithful loop is about 35 kB a second, so a 90-second programme without repeats is about 3 MB, against 48 kB of code.
- **8-bit is no smaller.** At CRF 38 it is 112 kB, and Moon Temple found 8-bit bands dark gradients; the smoke is all dark gradients.

## What each loses

- **The loop** loses the stars at their break unless it is large, repeats (ten seconds of fireworks repeating is noticeable; a programme long enough not to is megabytes), is one size and one aspect, is sRGB unless encoded otherwise, and cannot answer a click. It costs nothing to draw and plays where WebGPU does not. It is the right fallback for a backdrop where WebGPU is missing, at CRF 20 to 28.
- **Fire Temple's `fireworks`** keeps state on the GPU: it cannot be held at a chosen moment, scrubbed, or resized without restarting its particles, and it needs compute, so it has no compatibility-mode path. It is interactive (a click sends a shell to the pointer) and endless. Its colours are emission bands mapped to sRGB, its trails are its particles' own, and it has no smoke. Cheaper on the GPU in its own study, dearer in Chrome and in download.
- **This family's** costs GPU time every frame and needs WebGPU, and its programme repeats. It gains a held frame that is a real moment, exact scrubbing (story 11.3), colour from spectra in P3 where the screen has it, the eye's or a camera's trails, smoke, and a river.

The decision guide (13.4) should say: for a backdrop, this family's display, with the AV1 loop at CRF 20 to 28 as its fallback; for a click that answers with a shell, Fire Temple's `celebration` or this family's `success-burst` (11.1, not yet built).
