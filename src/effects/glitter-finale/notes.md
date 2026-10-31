## How it works

The stars that are not steady (story 2.7), all drawn by the shell renderer as pure functions of the time:

- **Glitter.** A charcoal-gold star that glows dimly and sheds a spark every eighth of its burn. Each spark hangs and falls slowly, glows faintly, and after a delay of 0.18 to 0.45 s flashes once (a Gaussian of 22 ms) and is gone: the delayed sparkle of a real glitter star, whose dross droplets react late.
- **Crackle.** A star that bursts, part way through its burn, into six microstars (`micro` kind, 2 mm) that fly a metre or two in a tenth of a second, very bright: the "dragon eggs" popping.
- **Strobe.** A white star that blinks: on for a quarter of each cycle, at its own phase, at `strobe` blinks a second (4 by default, 12 in `full-strobe`). Its streak through the eye's persistence is a dashed line, as a real strobe's is.

Each star's light is gathered along its ribbon from every sample within reach, so a spark that does not move still shows its whole flash (an earlier version kept only one sample's worth of it and lost the glitter).

The plan put glitter and crackle on stateful emitters. They did not need them: every spark's shedding time and every pop's moment is a hash of the star and the piece.

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-3.md](../../../docs/studies/epic-3.md)): 0.66 ms per frame at 1080p, the HDR tail included (the tail alone reads 0.68 ms). In Chrome, one frame on a 1920 × 1080 canvas reads 0.93 ms (0.91 to 1.01 over 3 loads, [browser-check.md](../../../docs/studies/browser-check.md)): Tier A on this machine. 39.1 kB gzipped with the shared chunks.

## Safety

Every preset measures flash `none` or `low`, the 12 Hz strobe at the strong dose included, pattern `none`, motion zero. `full-strobe` is declared a flash preset anyway, because the analyser cannot see what it would need to: it starts behind the gate.

## Pitfalls

- **The flash analyser cannot see sparkle.** Each glitter flash and crackle pop is a pixel or two, far under the analyser's cells (80 CSS px across), so they barely change a cell's mean. The shimmer test the plan asks for (Earth Temple's 5 × 5 px regions) is not in this family's checks yet; until it is, the sparkle's safety rests on its sparseness.
- **A strobe shell is not a flash, until it is.** Each star blinks at its own phase, so a cell's mean is steady. A strobe whose stars are in phase (a "strobe pot" in a finale) would flash the whole burst at its rate; that is not built, and should be gated if it is.

## When to use it

The end of a show, a New Year countdown, a success screen that earned it. Use sparingly: it is the busiest shell here.

## References

- Year of the Horse [plan.md](../../../plan.md), stories 2.7 and 3.7.
- Takeo Shimizu, _Fireworks: The Art, Science and Technique_ (1981), and his papers on glitter.
