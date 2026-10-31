## How it works

A shaped shell's stars are pasted on a disc in a shape (a heart, a smile) inside the shell, so they leave the break in that plane, each at a speed in proportion to its distance from the centre. Here the shape is an SVG path's outline (`src/gpu/shells/shapes.ts`): flattened, sampled at 96 evenly spaced points, centred and scaled so the farthest is 1. Each point is a star thrown in its direction in the shell's plane at that share of the kind's speed, from the speed tables.

Shapes: `heart`, `star`, `smile` and `horse` (a horse's head and neck, for the Year of the Horse), or `path` for the page's own SVG path data. `facing` pulls the plane's normal towards the viewer; at 0, the default, the normal is uniform on the sphere, as a tumbling shell's is.

## The honest result

Most break skewed. With a random normal, a shape faces the viewer within 30° (foreshortened by less than 13%) one time in 7.5 (1 − cos 30° = 0.134), and within 60° half the time. Shows fire shaped shells in volleys of several at once so that one reads. `staged` (facing 0.85) shows what a page would want and no shell can do.

The shape also does not stay the shape. Under quadratic drag a star thrown at half the speed does not go half as far: it loses less to the air, so it covers more than half the distance. The inner points run ahead of where a scaled copy of the outline would put them, and the shape grows puffy as it spreads. A heart is a heart for its first second and a blob by its last.

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-3.md](../../../docs/studies/epic-3.md)): 0.92 ms per frame at 1080p, the HDR tail included (the tail alone reads 0.68 ms). In Chrome, one frame on a 1920 × 1080 canvas reads 1.05 ms (1.03 to 1.08 over 3 loads, [browser-check.md](../../../docs/studies/browser-check.md)): Tier A on this machine. 40 kB gzipped with the shared chunks.

## Pitfalls

- **A path is read once.** Changing `path` needs the effect remounted (the shapes are a texture made at the start).
- **An outline needs enough stars.** 96 points carry a heart or a star; a word does not. Lettering by shells is a drone show's job (6.3).

## Safety

Flash `low`, pattern `none` (an outline of 96 stars is not a grating). Motion inside the caps; `staged`, whose shapes face the viewer, reads a drift of up to 0.09 widths a second at its peak, inside as a median.

## When to use it

A playful hero for a celebration, a Valentine's or a New Year page, a brand's mark in the sky, honestly skewed. For a shape that must be read, use `staged`, and say on the page that it is staged.

## References

- Year of the Horse [plan.md](../../../plan.md), story 3.6.
