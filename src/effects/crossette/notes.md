## How it works

A crossette shell carries few, large stars (24 to 43), each of which splits in four part way out (`split`, 45% of its burn by default) with a small pop, so each split is a cross and the burst branches. The pieces are still a pure function of the time, drawn by the shell renderer with no state:

- each piece starts where its star was at the split, at the star's velocity then (a central difference of its path) plus a kick of 30 m/s across it, the four kicks a cross in the plane square to the star's flight;
- each then flies as a `piece` star (8 mm, 40 m/s) at its own speed from the speed tables, and burns for about 1.2 s.

The plan put crossettes on Fire Temple's stateful emitters (story 2.4's verdict). They did not need them: a split is a known moment, and the star's state then is a known function of time. Story 2.4's line moves: state is needed where something outside the shell moves the stars (wind, a pointer, collisions), not where they split.

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-3.md](../../../docs/studies/epic-3.md)): 1.07 ms per frame at 1080p, the HDR tail included (the tail alone reads 0.68 ms). In Chrome, one frame on a 1920 × 1080 canvas reads 1.24 ms (1.16 to 1.32 over 3 loads, [browser-check.md](../../../docs/studies/browser-check.md)): Tier A on this machine. 39 kB gzipped with the shared chunks.

## Pitfalls

- **The piece's start is the star's path, its flight an approximation.** A piece's velocity at the split is not along a tabulated launch, so it is placed as a fresh `piece` star thrown along its starting velocity. That is exact at the split and within 1% of the piece kind's burst radius for every speed it is thrown at (`tests/star.test.ts`).
- **Small crosses are dots.** Below about 250 m of sky in a 1080-pixel view, the crosses are a few pixels across and read as a peony of doubled stars.

## Safety

Flash `low`, pattern `none`, motion inside the caps (the analyser reads zero: few stars). The split's pop is a brightening of 1.6 times for 50 ms per piece, under a cell's notice.

## When to use it

Behind a hero for an event. It is busier than a peony for the same number of shells: use fewer.

## References

- Year of the Horse [plan.md](../../../plan.md), story 3.4.
