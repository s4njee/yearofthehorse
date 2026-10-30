# Year of the Horse

A research gallery of WebGPU festival and night-city light:

- fireworks, their stars and their smoke;
- sparklers, the senko hanabi, fountains and firecrackers;
- lanterns, lantern rows, sky lanterns and floating lanterns;
- festoon bulbs, chasing marquees, drone shows and beams through haze;
- neon tubes, sign walls and LED panels;
- the neon street after rain: wet reflections, lit rain, haze and traffic trails.

Each effect is built from its mechanism, and comes with a live demo, readable source, a write-up and a practicality scorecard. It is judged the way the temples judge theirs: **would you actually ship this on a website?**

It is named for the Year of the Horse (2026, the Fire Horse), and has two themes: the festival (Lunar New Year, a Japanese summer hanabi, Diwali, New Year's Eve) and the neon city (Tokyo at night, as cyberpunk imagines it). A firework's colour is the spectrum of the metal salt in its stars, and its stars fly as small heavy balls slowed by the air. A neon tube's colour is its gas. A wet street stretches every light into a streak down the road. Fireworks come first.

Safety comes from The Hero's Journey's checks, and this is the most flash-prone family so far. Every effect has an intensity control from 0 to 1, calm by default. In `npm test`, every effect and preset runs at the default and at the strong end (0.7) through:

- the WCAG 2.3.1 flash and red-flash analyser;
- a regular-pattern analyser after the broadcast guidance;
- caps on whole-field rotation, zoom and drift.

Presets past the limits start paused behind a click-to-start notice. See [docs/safety.md](docs/safety.md).

It is built on Fire Temple's page structure and the shared temple core (`@mk7s/hologpu-temple-core`), from Wind Temple's copy of the shell. The accent is gold. See [plan.md](./plan.md) for the roadmap.

## Getting started

```sh
npm install
npm run dev        # http://localhost:5520
npm test           # unit tests, plus the flash, pattern and motion checks and the held-frame audit over every effect
npm run build      # registry, typecheck, static build to dist/ and the bundle check
npm run study -- --epic 1   # cost study on Dawn: docs/studies/epic-1.md and the Scorecard numbers
npm run shot -- hello --times 2 --bg dark,light   # render an effect headlessly to PNG (output/shots)
npm run browser-check -- --report docs/studies/browser-check.md   # every effect in headless Chrome (dev server running)
npm run posters -- --force   # fallback posters from held frames, as WebP
npm run deploy     # build and upload dist/ to Cloudflare Pages (project yearofthehorse)
```

`?effect=<id>` opens an effect, `&hud=1` the performance HUD, and `&p.<param>=<value>` sets a parameter, `&p.dose=0.6` (intensity) included.

## Effects

| Id      | What                                                                                                                                                                                          | Tier |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `hello` | The smallest effect: shells rising and breaking into peonies and gold chrysanthemums, every star on a closed-form path under drag and gravity, coloured by its metal salt, one instanced draw | A    |

## Layout

```
src/gpu/wind/air.ts         Wind Temple's wind in 3D (twin of src/wgsl/air.wgsl), for smoke and lanterns
src/gpu/wind/wind.ts        Earth Temple's ground wind (twin of src/wgsl/wind.wgsl)
src/gpu/points.ts, glare/,  Moon Temple's energy-conserving points, aperture and glare (via Star Temple)
  optics/
src/gpu/sim/, volume/       Fire Temple's 2D and 3D stable fluids, obstacles and volume ray-march kernel
src/gpu/post/               the HDR tail: bloom, tonemap, colour stage, and Moon Temple's night vision
src/gpu/hash.ts             twins of the shader hashes, so CPU models make the same random choices
src/gpu/safety/             dose, the pattern analyser, motion estimate, colour caps and the start gate's rules
src/gpu/colour/             OKLab and OKLCH, palettes, Display P3
src/gpu/strokes/            the stroke renderer, for neon tubes, light painting and trails
src/gpu/symmetry/fold.ts    the 17 wallpaper groups and the rosettes as folds
src/gpu/text/               a font as a signed distance field (Temple of Time's), for neon and LED text
src/effects/<id>/           meta.ts, index.ts, shaders, notes.md, poster.webp
docs/studies/               cost studies and the browser check
```

## License

MIT. The Anton font, in `fonts/` for the text field, is under the SIL Open Font License 1.1 (`fonts/Anton-OFL.txt`).
