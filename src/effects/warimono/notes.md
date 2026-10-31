## How it works

The Japanese round shell (割物, warimono), whose stars are packed by hand in two paper hemispheres around a burst charge, so it breaks as a near-perfect sphere. 180 stars a shell, on the renderer's sphere pattern (a Fibonacci spiral, scattered by 0.04 radian only), in layers from the core out, each its own spiral over the sphere:

- **Yae-shin** (八重芯, double core): an outer petal, a second petal inside it (35% of the stars at 0.68 of the speed) and a pistil (15% at 0.38), each a different colour. Half of them also change colour once on the way out.
- **Henka** (変化, change): every star changes colour as it burns, as its layers of composition burn through, at 45% of its burn; with a pistil of another colour.

Each layer flies at its own speed from the speed tables (story 2.1), so an inner petal is the right size at every moment: placing it as a fast star seen earlier made it too round and too high (M0's shortcut, now gone).

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-3.md](../../../docs/studies/epic-3.md)): 0.92 ms per frame at 1080p, the HDR tail included (the tail alone reads 0.68 ms). In Chrome, one frame on a 1920 × 1080 canvas reads 1.04 ms (1.03 to 1.06 over 3 loads, [browser-check.md](../../../docs/studies/browser-check.md)): Tier A on this machine. 39 kB gzipped with the shared chunks.

## Pitfalls

- **Layers chosen by star index came out as caps.** The spiral runs pole to pole by index, so the first stars (the pistil) were all at the top. Each layer is now its own spiral. `peony-display`'s pistils had the same fault from M0.
- **Real colour changes are sharper than they look here.** A change is blended over 0.12 s; a henka star changes in a few hundredths of a second, which at 60 fps is a step. The blend keeps a change from reading as a flash across a dense shell.
- **Dense spheres are trackable.** 180 stars make a burst the motion estimator can follow, and its first second reads as a zoom of 0.5 doublings a second, as `peony-display`'s bigger bursts do (story 2.8).

## Safety

Flash `low`, pattern `none`. Motion inside the caps as medians; single readings reach 0.5 zoom doublings a second when a dense sphere is tracked in its first second (story 2.8).

## When to use it

A hanabi taikai page, a Japanese summer festival, or any hero that wants the most finished-looking shell. These traditions are Japanese; credit them as such.

## References

- Year of the Horse [plan.md](../../../plan.md), story 3.5.
- Takeo Shimizu, _Fireworks: The Art, Science and Technique_ (1981): Shimizu was a Japanese pyrotechnist, and the book covers the warimono and its stars in detail.
