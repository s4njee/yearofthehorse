## How it works

The shell renderer with two designs (`src/gpu/shells/designs.ts`):

- **Palm.** A thick rising comet (the trunk), which sheds gold sparks that hang behind it on the way up, then seven to twelve big comet stars (20 mm, `palm` kind) thrown anyhow (a scatter of half a radian about a spiral), each shedding a 1.4 s gold tail that droops: the fronds.
- **Ring.** Forty to sixty stars evenly round a circle in a plane, thrown at the same speed. The plane is whatever the shell's tilt was when it broke: its normal is uniform on the sphere, so most rings are seen as ellipses and a few edge-on as a line. A real ring shell is the same: it cannot be aimed.

`kind: mix` makes about half the shells palms.

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-3.md](../../../docs/studies/epic-3.md)): 0.83 ms per frame at 1080p, the HDR tail included (the tail alone reads 0.68 ms). In Chrome, one frame on a 1920 × 1080 canvas reads 0.91 ms (0.88 to 0.97 over 3 loads, [browser-check.md](../../../docs/studies/browser-check.md)): Tier A on this machine. 39 kB gzipped with the shared chunks.

## Pitfalls

- **Edge-on rings are lines.** One ring in five is within 37° of edge-on and reads as a bar of stars. That is the physics; a display that wants circles has to fire many, as shows do.
- **A palm's fronds are few and thick.** At a 1-pixel-wide streak, a thick comet is a brighter line, not a wider one; up close (`sky` under 250) it reads as thin.

## Safety

Flash `low` (a ring's cell, once), pattern `none`. Motion inside the caps, mostly because the analyser cannot track so few, sparse stars: palms and rings read zero (story 2.8's blind spot, [burst-safety.md](../../../docs/studies/burst-safety.md)).

## When to use it

Behind a hero for an event. Rings are the shell to choose when the page wants something geometric; palms when it wants something that rises.

## References

- Year of the Horse [plan.md](../../../plan.md), story 3.3.
- Takeo Shimizu, _Fireworks: The Art, Science and Technique_ (1981).
