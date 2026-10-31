## How it works

A whole show over a river, after the hanabi taikai on the Sumida in Tokyo. Four passes:

1. **Stars.** A 90-second programme mixing every kind of shell (peonies and chrysanthemums, willows and kamuro, palms, rings, warimono, crossettes, glitter and crackle), drawn by the shell renderer into a target of their own.
2. **Smoke** (story 2.6), at a quarter of the view's resolution. Each break leaves a puff (`src/gpu/smoke/puffs.ts`): it fills the burst as the stars spread, then drifts with the wind (`wind`, 2 m/s), rises a little, spreads, and thins over 45 s. Each puff is given texture by fractal noise in its own frame and lit by the bursts burning now: each a light at its centre, as wide as the burst is then, in its stars' colour. The pass writes the light the smoke scatters and its optical depth.
3. **Composite.** The stars seen through the smoke (half of it taken as in front), the smoke's glow, a far bank of dark buildings with a few lit windows, and the river: a mirror about the water line, rippled, stretched into streaks downwards as a rough surface at a grazing angle smears each light, and reflecting less nearer the viewer.
4. The shared HDR tail.

**Smoke without state.** The plan chose Fire Temple's 2D fluid for smoke. A fluid keeps state, so a held frame, a resize or a scrubbed display would need up to a minute of simulation to reach. On a still night a display's smoke mostly drifts, spreads and thins, which a puff does as a pure function of time, so the display is as stateless as its stars. What it loses: the curl of a plume and smoke that wraps around a burst's heat.

`finale` adds thirty shells over the last 12 s, a break every 0.4 s: as close as the flash rule allows, from story 2.8's salute measurement (three a second is the limit for any size).

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-3.md](../../../docs/studies/epic-3.md)): 1.49 ms per frame at 1080p, the HDR tail included (the tail alone reads 0.68 ms). In Chrome, one frame on a 1920 × 1080 canvas reads 2.86 ms (2.58 to 2.90 over 3 loads, [browser-check.md](../../../docs/studies/browser-check.md)): Tier B on this machine. 48.4 kB gzipped with the shared chunks. Its own passes: the stars, the smoke at a quarter of the view (about 0.4 ms in a finale) and the composite; with no smoke and no river it costs 0.57 ms. The plan put it in Tier C; measured, it is B.

## Smoke

On Dawn at 1080p, the whole display in its finale (when the smoke is thickest) costs 1.09 ms with the smoke at an eighth of the view's resolution, 1.35 ms at a quarter (the default) and 1.70 ms at a half. Upsampled bilinearly, an eighth is not blocky but softer: the puffs lose their fine texture. A half shows a little more texture than a quarter, for a third of a millisecond more.

## Pitfalls

- **Smoke hides stars and also lights itself.** After a minute the sky is milky and every burst is a coloured cloud, as on a still night. On a windy night set `smoke` lower or `wind` higher.
- **The far bank's windows are a row of bright points.** Rare and dim on purpose: lit regularly they are a lattice (Earth Temple's finding).
- **The reflection is a mirror, not a river.** No waves are modelled; the ripple is a pair of sines. Wet reflections with a microfacet stretch are story 9.1.

## Safety

Flash `low` over the whole 90-second loop, the finale included (one cell flash a second at most), at the default and the strong dose; pattern `none`. Motion inside the caps as a median; one reading in six to eight sees a burst grow faster than the zoom cap, from 12% to 55% of the view (story 2.8, [burst-safety.md](../../../docs/studies/burst-safety.md)). `photograph` reads three flashes of one cell in a second, at the limit and not over it.

## When to use it

A full-bleed hero for a festival or a summer event page, where the show is the page. Tier B: a hero, not a drop-in behind content that must stay responsive on a phone.

## References

- Year of the Horse [plan.md](../../../plan.md), stories 2.6 and 3.8.
- The Sumida River Fireworks Festival (隅田川花火大会), Tokyo, held since 1733 as the Ryōgoku kawabiraki.
