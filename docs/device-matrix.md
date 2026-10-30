# Device matrix (story 10.2)

Every tier in Year of the Horse so far rests on one machine, an Apple M1 Max. This page is the protocol for the other three classes the plan names, and the table they fill in. **Not measured yet**: it needs the devices.

## The devices

| Class                 | Example                                              | Why it matters                             |
| --------------------- | ---------------------------------------------------- | ------------------------------------------ |
| Integrated-GPU laptop | Intel Iris Xe or AMD Radeon 680M, Chrome on Windows  | the budget Tier A and B are written for    |
| Apple Silicon         | M1 Max (done), and a base M1 or M2 if one is to hand | the reference so far                       |
| Mid-range Android     | a Pixel 7a or Galaxy A54 class phone, Chrome         | the phone the "untested" scorecards mean   |
| iPhone                | iPhone 13 or later, Safari 26                        | WebGPU on iOS, and the only Safari reading |

## Protocol

On each device, with nothing else open and the device on mains power (a phone on charge, its screen held on):

1. **Serve the build on the network.** On the development machine, `npm run build`, then `npx vite preview --host --port 5520`, and note its address on the LAN (`http://<machine>.local:5520/`).
2. **The gallery's own reading.** Open each effect at `/?effect=<id>&hud=1` and read the HUD's GPU time and frame rate after ten seconds, at the device's native canvas size. Note whether the effect started, and anything that looks wrong.
3. **The scripted check, where Chrome can be driven.** On the laptop: `npm run browser-check -- --base http://<machine>.local:5520 --views hud-1080p --hud-runs 3 --device "<name>" --class <integrated|apple-silicon>`. Its report lists start-up, errors and the HUD's numbers per effect.
4. **Simulation budgets.** On the phones, open each fireworks, sparks and smoke effect with the HUD and note the shells, stars or sparks and the GPU time, at the default and at its lowest quality rung (story 10.2).
5. **Flash and comfort.** Look at every effect with sparks, glitter or LED dots at arm's length and close up for shimmer, and at every burst for its flash. The analyser's limits assume a desktop viewing distance (`docs/accessibility.md`).

Record each reading in `src/effects/measured.json` under the device's name and class (the Scorecard tab reads it), and in the table below.

## Results

| Effect       | Apple M1 Max (Chrome)           | Integrated laptop | Android | iPhone |
| ------------ | ------------------------------- | ----------------- | ------- | ------ |
| every effect | `docs/studies/browser-check.md` | —                 | —       | —      |

The tiers stay provisional until at least the integrated laptop and one phone are in this table.
