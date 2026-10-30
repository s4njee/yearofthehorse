## How it works

A looping programme of shells (`src/gpu/shells/shell.ts`, story 2.3): when each is launched and breaks, where, which class of star it carries and how many, what its stars are made of, whether it has a pistil, and how its stars were packed. Each frame the CPU picks the few shells in the air (at most eight) and writes their records to a uniform buffer. One instanced draw (`display.wgsl`) then places every star of every shell, adds it into the HDR scene as a short streak, and the shared tail blooms and tonemaps it. Nothing is stored per star, so the display can be paused, resized, held and scrubbed.

- **Flight** (story 2.1). A star is a sphere of composition burning from the outside in, slowed by quadratic air drag and pulled down by gravity. Its mass falls faster than its cross-section, so the air slows it harder as it burns. Each class's flight is integrated once on the CPU, by launch angle (9 elevations) and time (48 samples). The shader places any star from four table reads, in the star's own frame, within 0.44% of the burst's radius of the integrated path (`tests/star.test.ts`). The classes stand for 3-, 6- and 10-inch shells: bursts of about 45, 68 and 99 m, breaking at about 110, 190 and 280 m. They are rough starting points until reference video is measured (story 1.8).
- **Colour** (story 2.2). Each star's colour is its composition's emission spectrum (the metal's bands plus a blackbody continuum) integrated against the CIE 1931 observer, and mapped into sRGB, or into Display P3 on a confirmed P3 canvas, as a light: to the most saturated colour of its hue the gamut holds ([docs/studies/emission-colour.md](../../../docs/studies/emission-colour.md)). Brightness differs by composition: copper blue is the weakest.
- **Shells.** Peonies in strontium red, barium green, copper blue, calcium orange, violet and magnesium white. One in three is a gold chrysanthemum whose stars shed sparks that trail for about half a second. One peony in four has a pistil: a third of its stars, thrown at under half the speed, in another colour. Half the shells are round warimono, half rougher canister shells, whose stars leave less evenly.
- **Pistil stars and speed.** A star thrown slower is placed at the time a full-speed star would have gone as far. That is exact for pure quadratic drag, where the distance depends only on speed times time, and close for a burning star.
- **Programme.** Breaks are placed first, at least 0.9 s apart, then launches are worked back from them. The programme repeats every 60 s.
- **View.** The scene is in metres, seen from the side from a little above the ground (the bottom of the view is a fifth of the way up the sky). `sky` sets how much sky the view takes in; streak widths follow the scene's scale.

`dose` ("intensity") sets shells a minute (6, 24 at the default, 40 at full) and brightness. `seed` picks another programme. The held frame is a moment with no shell near its break and as many shells open as the programme usually has, and playing starts from that moment, so the page opens with fireworks already in the sky.

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-3.md](../../../docs/studies/epic-3.md)): 0.39 ms per frame at 1080p, the HDR tail included (the tail alone read 0.68 ms in the same run: differences under half a millisecond are noise). In Chrome, one frame on a 1920 × 1080 canvas reads 0.80 ms (0.77 to 0.80 over 3 loads, [browser-check.md](../../../docs/studies/browser-check.md)): Tier A on this machine. 32.5 kB gzipped with the shared chunks. The stars themselves cost little: 10,000 cost 0.07 ms in story 2.4's study, and a display has a few hundred at a time.

## Pitfalls

- **The motion check cannot see most of it.** The estimator needs at least 20 trackable blocks in a frame, and a display of sparse stars on a dark sky usually has fewer, so most readings are zero, not small. When a burst is large enough to be tracked, its expansion reads 0.36 to 0.56 zoom doublings a second, four to five times the cap. Real stars keep spreading until they burn out, so this is the real look, not a tuning mistake. `close` (270 m of sky) goes over and is declared, and starts behind the gate. Whether a burst in part of the view is whole-field motion at all is story 2.8.
- **The held frame must be one that plays.** Holding the moment with the most open shells was brighter than the display ever was in its first seconds, which the held-frame audit refuses. The display now holds a typical moment and starts playing from it.
- **It sits low in a tall hero.** Shells break at heights set by their size, and the view is framed by its height, so on a tall section the small shells' bursts land in the lower third, behind a hero's text. Framing the sky higher, or with more large shells, made bursts big enough in the view that the default went over the zoom cap, and the distant preset held an empty sky. Placing bursts around the page's text is story 11.4.
- **sRGB is duller than the sky.** Barium green and copper blue are outside sRGB and P3, and are shown as the most saturated colours of their hues. The P3 canvas helps the red and the gold.
- **No smoke, no trails as a camera sees them.** Smoke (2.6) and camera trails (2.5) are still to come, so a long display stays as clean as its first shell.

## Safety

Flash `low` declared (red and bright bursts can flash a cell, far under three times a second); pattern `none`. Motion inside the caps up to the strong dose by the analyser's readings, with the blind spot above. `close` is declared over the motion caps.

## When to use it

As a calm fireworks backdrop behind a dark hero for a celebration, an event or a New Year page. For a click or a success state, Fire Temple's `celebration` or this family's `success-burst` (11.1, not yet built). Over a light page it turns to pale ink; give it a dark band.

## References

- Year of the Horse [plan.md](../../../plan.md), stories 2.1–2.4 and 3.1.
- Takeo Shimizu, _Fireworks: The Art, Science and Technique_ (1981), on stars, shells and their colours.
- Chris Wyman, Peter-Pike Sloan and Peter Shirley, "Simple Analytic Approximations to the CIE XYZ Color Matching Functions", _Journal of Computer Graphics Techniques_ (2013).
