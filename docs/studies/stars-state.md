# Stateless and stateful stars

Story 2.4. The same stars drawn two ways, on Dawn on this machine (Apple M1 Max), 2026-10-30, by `npx vitest run --config experiments/vite.config.ts experiments/stars-state.test.ts`:

- **Stateless:** the vertex shader places each star from its class's flight table (story 2.1) at its shell's age, as `peony-display` does. Nothing is stored per star.
- **Stateful:** a compute pass steps each star's position and velocity by one frame (the same burning sphere under quadratic drag), and the vertex shader reads them.

Each star is a streak drawn additively into a 1920 × 1080 `rgba16float` target, in shells of 128. GPU time is the per-frame slope of the study harness (`tests/bench.ts`).

|   Stars | Stateless (ms) | Stateful (ms) | Stateless memory | Stateful memory |
| ------: | -------------: | ------------: | ---------------: | --------------: |
|  10,000 |           0.07 |          0.07 |                0 |          0.3 MB |
|  50,000 |           0.15 |          0.11 |                0 |          1.5 MB |
| 200,000 |           0.22 |          0.33 |                0 |          6.1 MB |

A stateful star stepped once a frame drifts from the true path as the frame rate falls. At burn-out, the worst direction is off by this share of the burst's radius:

| Frame rate        | 120 fps | 60 fps | 30 fps | 15 fps |
| ----------------- | ------: | -----: | -----: | -----: |
| Error at burn-out |    0.6% |   1.1% |   2.4% |   4.6% |

The stateless table lands within 0.44% at any frame rate (`tests/star.test.ts`).

## What the run says

- **Cost does not decide.** A page's display is a few thousand stars. At 10,000 both cost 0.07 ms, and the differences up to 200,000 are inside this harness's noise (about half a millisecond for light work).
- **What each can do decides.**
  - **Stateless:** a star is a pure function of the programme and the time. It costs no memory and is exact at any frame rate. A pause, a resize, a held frame, a tab hidden for minutes and a scroll scrubbing backwards all come free.
  - **Stateful:** a star can split, spawn, sputter, collide or be pushed by the wind field, which a table cannot know in advance. In exchange, it keeps state, depends on the frame rate unless sub-stepped, and has to be re-run or baked for a scroll to scrub it.
- **Choice:** stateless for every shell whose stars only fly and burn (peony, chrysanthemum, willow, palm, ring, pistil, shaped shells). Stateful, on Fire Temple's emitters, for crossettes, crackle, glitter, sparklers and anything the wind moves.
