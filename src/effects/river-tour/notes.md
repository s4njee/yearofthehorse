## How it works

The display over the river (`display`, story 3.8) as a guided show: the same river, smoke and far bank (`src/gpu/river/river.ts`), with a programme written act by act instead of mixed by the seed. Each act is seven seconds of one kind of shell, from the designs every other effect uses (`src/gpu/shells/designs.ts`):

1. peony (with a pistil), chrysanthemum, warimono (henka), yae-shin;
2. ring, palm, willow, kamuro (at four fifths of the rate: their stars hang for seconds);
3. crossette, glitter, crackle, strobe;
4. shaped shells, one of each shape in turn (heart, star, smile, the horse);
5. fourteen seconds of all of them together, as `display` mixes them, at 1.3 times the rate;
6. `display`'s finale: thirty breaks 0.4 s apart over the last twelve seconds.

Two minutes, then it repeats, with two and a half seconds of quiet sky first so the finale clears. Inside each act the breaks are placed by the same programme as every show (`programme` in `shell.ts`), at least 1.1 s apart, so the dose still sets how many shells there are: about two an act when held, four at the default, six at 0.7.

**Captions.** Each act's name is written over the sky as it starts, faded in over 0.6 s and out after 4.5 s. The text is Temple of Time's signed-distance text field (`src/gpu/text/text-field.ts`) with the Anton outlines, drawn into an `r16float` target only when the name or the view's size changes, then laid over the scene in one fullscreen pass (`caption.wgsl`) with a soft shadow so it holds over a bright burst. `captions: false` leaves them out.

**Following the show from a page.** The act in the air is one of the effect's live numbers (`stats().act`), so a page can follow the programme: [hanabi.html](../../../hanabi.html) marks the act in its own programme list.

**The held frame** (reduced motion, the poster) is chosen from the first act, and play starts there, so the tour opens on its peonies, not wherever in two minutes the calmest moment happened to fall.

## Cost

On an Apple M1 Max on Dawn ([docs/studies/selected.md](../../../docs/studies/selected.md)): 1.22 ms per frame at 1080p at its defaults (0.76 to 1.70 over the run), the HDR tail included. The caption pass costs little: `plain` (no captions) reads 1.18 ms. 68.5 kB gzipped with the shared chunks, 20 kB more than `display`: most of it is the caption font's outlines (18 kB in the effect's own chunk).

## Pitfalls

- **Shaped shells face the viewer more than real ones can.** `facing` is 0.6 by default so the tour shows its shapes; `shaped-shells` defaults to 0, a shell broken at whatever angle it tumbled to. Set it to 0 for an honest sky.
- **An act is seven seconds whatever the dose.** Held, an act has one or two shells, and a willow act can look empty while its stars are still rising.
- **The captions are in Latin capitals only.** The family's Japanese font (story 1.9) is not downloaded yet, so `kamuro` and `yae-shin` are romanised.

## Safety

The whole 120-second loop through the flash and motion checks ([tour-safety.json](../../../docs/studies/tour-safety.json), `experiments/tour-safety.test.ts`), at the default dose and at 0.7: flash `low` (one cell flash a second at most, the strobe act and the finale included), pattern `none`, motion inside the caps as a median. Nine readings in 120 at the default (six at 0.7) see a burst grow faster than the zoom cap, each from under a fifth of the view: the local looming of story 2.8 ([burst-safety.md](../../../docs/studies/burst-safety.md)), as in `display`.

## When to use it

A demo of what the family draws, or a festival page that explains its fireworks as they fly. As a plain hero, `display` is cheaper and lighter to download.

## References

- Year of the Horse [plan.md](../../../plan.md), stories 3.1 to 3.8.
- The Sumida River Fireworks Festival (隅田川花火大会), Tokyo.
