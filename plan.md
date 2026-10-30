# Year of the Horse — WebGPU fireworks, festival light and neon research site

A research site that implements, measures and documents the light people make to celebrate, and the light of cities at night:

- fireworks (aerial shells, their stars and their smoke, a display over water);
- fireworks held in the hand or set on the ground (sparklers, the Japanese senko hanabi, fountains, firecracker strings);
- lanterns (paper lanterns lit from inside, lantern rows, sky lanterns, floating lanterns, diyas);
- festival and stage light (festoon bulbs, chasing marquees, drone shows, beams through haze, glow sticks, LED wristbands);
- neon (glass tubes of a gas, a sign over a heading, a wall of signs);
- screens and signs (LED panels, giant screens, lightboxes);
- the neon street after rain (wet asphalt reflections, rain lit by the signs, haze, traffic trails, film halation).

It asks one question of each: **would you actually ship this on a website?** Every effect gets a live demo, readable source, a write-up and a practicality scorecard.

It is named for the Year of the Horse (2026, the Fire Horse of the sixty-year cycle), and has two themes: **the festival** (Lunar New Year, a Japanese summer hanabi taikai, Diwali, Yi Peng, New Year's Eve) and **the neon city** (Tokyo at night, as cyberpunk imagines it: Kabukicho's vertical signs, Shibuya's screens, rain on the street).

It is a sibling of [Fire Temple](../firetemple/plan.md), [Moon Temple](../moontemple/plan.md), [Temple of Time](../templeoftime/plan.md) and [Wind Temple](../windtemple/plan.md), on the same page structure and the shared temple core. It is §4.9 (Fireworks, festival light and neon) of the holofx [research list](../research.md). Fire Temple built fireworks as one effect of its particle epic (7.5); this family makes them a subject.

The rule is the other temples': start from the mechanism, and the look follows.

- **A firework's colour is a spectrum.** Each star is a composition of a fuel, an oxidiser and a metal salt, and the colour is the light the hot metal compounds emit: strontium's red, barium's green, copper's blue, sodium's yellow, and the white of burning magnesium, aluminium and titanium. Gold is not a line at all: it is charcoal and iron sparks glowing as a blackbody. Several of these are outside sRGB.
- **A star flies as a small heavy ball in air.** It leaves the break at the shell's speed, the air slows it in a second or two, and then it falls at the speed where drag holds its weight. With drag proportional to speed, the path has a closed form.
- **A burst's shape is how its stars were packed.** A Japanese warimono shell packs stars in a sphere and breaks into a near-perfect globe; a Western canister shell is less round. Stars packed as a ring break into a ring, and a shaped shell (a heart, a face) is a flat pattern seen from some angle, so most viewers see it skewed.
- **A trail is light remembered.** A peony's stars leave no trail. A chrysanthemum's shed burning sparks that live a fraction of a second. The long arcs in photographs are a camera's exposure; the eye keeps about a tenth of a second.
- **A sparkler's sparks branch.** A droplet of molten metal thrown from the burning tip bursts as its gases escape, and its pieces burst again. The senko hanabi's slow ball of dross goes through four named stages (peony, pine needles, willow, falling chrysanthemum) as it cools.
- **A lantern is light through paper.** A candle or a bulb inside a translucent shell, which scatters and tints it; the ribs and the seams show as shadow.
- **A neon tube is a glowing gas.** Neon's own glow is red-orange; every other colour is argon and mercury lighting a phosphor coating, or coloured glass. The tube glows evenly along its length, dark at the electrodes, and casts a glow on the wall behind it.
- **An LED sign is a grid of points.** It has a pixel pitch, a scan rate and brightness by pulse width. It looks like a screen far away and like dots close up, and a camera sees its scan as bands.
- **A wet street makes vertical streaks of every light.** A rough wet surface seen at a grazing angle stretches each reflection along the line of sight, so every sign is doubled as a long streak down the road.

Fireworks come first and get the most care: the shell, its stars and their colour are the engine behind the rest of the festival half.

## Goals

- **Make fireworks that look like fireworks,** judged against reference video: star speeds, burst radius and droop, burn times, how trails fade, and colour, measured from clips and matched.
- **Cover the main kinds of festival and night-city light, each from its mechanism:**
  - **fireworks:** peony, chrysanthemum, dahlia, willow and kamuro, palm, ring and shaped shells, crossette, glitter, crackle, strobe, pistils and the Japanese double-petalled shell, multi-break shells, salutes, and a whole display with its smoke over water;
  - **in the hand and on the ground:** sparkler, senko hanabi, fountain, Catherine wheel, Roman candle, firecracker strings;
  - **lanterns:** paper lanterns, rows of them swaying, sky lanterns, floating lanterns, diyas;
  - **festival light:** festoon bulbs, chasing marquee bulbs, a drone show, beams and gobos through haze, glow sticks, a crowd of LED wristbands, light painting;
  - **neon:** a sign over a heading, a wall of signs, a failing tube;
  - **screens and signs:** an LED marquee, a giant crossing screen, lightboxes and vending machines;
  - **the wet neon street:** stretched reflections, puddles, rain lit by the signs, haze, traffic trails, film halation.
- **Ship effects shaped like website parts:**
  - a celebration burst for a success state, a countdown with a finale, and a New Year hero;
  - a sparkler cursor and a sparkler that writes a word, and a sparkler loader;
  - a lantern header for Lunar New Year or a summer festival, and a sky-lantern scroll;
  - a drone show that draws the page's logo;
  - a neon sign over a heading, a neon 404 page, and a neon loader that strikes;
  - an LED marquee for a notice, and a rain-wet neon street hero.
- **Say plainly when CSS does the job.** CSS `text-shadow` neon is the baseline for a neon heading (7.9). So is canvas confetti for a celebration, and Fire Temple's `celebration` (9.13) for a click burst.
- **Keep it safe.** This is the most flash-prone family so far. Every effect runs through The Hero's Journey's flash, red-flash, pattern and motion checks. The hazards:
  - a burst is a flash, and a salute (the white bang) is a large one;
  - strobe stars blink at several hertz, glitter twinkles, and firecracker strings flash many times a second;
  - Lunar New Year's red is the saturated red the red-flash rule singles out;
  - chasing marquee bulbs and scrolling LED text are moving patterns, and an LED panel up close is a dot grid;
  - neon flickers as it strikes and as it fails;
  - a burst expanding reads as a zoom, and a display that fills the sky is whole-field motion.
- **Build the reusable parts once,** shaped to move into `@mk7s/hologpu-temple-core`:
  - the emission colour pipeline (spectra to wide-gamut colour);
  - the shell and star model;
  - the branching spark;
  - light through paper;
  - the neon tube;
  - the LED panel;
  - the wet-surface reflection.

## Non-goals

- **Sound.** No bangs, crackle or whistles. A salute is drawn, never heard, and nothing plays audio.
- **Real brands and real signs.** No real shop names, logos, products or adverts on the signs. A sign carries the page's own text, made-up names, or a pattern made here.
- **Recreations of films, games or anime.** The neon city is Tokyo at night as photographs show it, and cyberpunk as a mood, not a copy of any film's or game's scenes, characters, vehicles or logos.
- **Gambling.** Pachinko parlours are part of the look of a Tokyo street, but no effect imitates a gambling machine or its lights.
- **Sacred text and real religious symbols.** Lanterns, diyas and floating lanterns belong to living traditions (Diwali, Obon, Loi Krathong and Yi Peng). They are drawn plainly, credited in the notes, and carry no religious text.
- **Pyrotechnic instructions.** The notes explain why a star burns red, never how to make one. No formulas with quantities.
- **Effects over live page pixels.** A canvas cannot read the page (Fire Temple's [backdrop strategy](../firetemple/docs/backdrop-strategy.md)). A neon heading draws the page's text from the text field, not its pixels.
- **Fire's flames and embers, and rain on glass.** These are Fire Temple's and Water Temple's. A candle in a lantern reuses Fire Temple's flame, and rain on a window is Water Temple's `rain-glass`.
- **Bokeh.** Out-of-focus city lights are Moon Temple's (`night-street`, `fairy-lights`). This family draws its lights in focus and hands defocus to Moon Temple's lens.

## Decisions

These are defaults chosen so work can start. Each is cheap to revisit before Epic 1 is finished.

| Decision         | Default                                                                                                                                                                                                                                                                                                          | Why                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation       | Wind Temple's shell (from Earth Temple, Snow Temple, The Hero's Journey, Moon Temple, Storm Temple, The Bazaar and Fire Temple) on `@mk7s/hologpu-temple-core`, copied from its commit f9cdb4b                                                                                                                   | It is the newest copy. It has the flash, pattern and motion checks, the start gate, OKLab colour, the study harness and the browser check. It also has Moon Temple's points and glare, the stroke renderer, the text field, Fire Temple's fluids and volume kernel, and the 3D wind that smoke and lanterns drift in. |
| Build tooling    | Vite + TypeScript (strict), with WGSL `#include` resolved per effect at build time                                                                                                                                                                                                                               | Same as every temple, so shader text never reaches the first load.                                                                                                                                                                                                                                                    |
| Rendering API    | Raw WebGPU + WGSL, thin helpers                                                                                                                                                                                                                                                                                  | The research subject is WebGPU itself.                                                                                                                                                                                                                                                                                |
| Colour pipeline  | Linear HDR `rgba16float` scene → bloom → tonemap → output, with an HDR and a Display P3 canvas where offered. Star and gas colours come from emission spectra integrated against the CIE observer (2.2)                                                                                                          | A burst and a neon tube are far brighter than paper white. Barium green, strontium red and copper blue are outside sRGB, so the wide-gamut canvas is part of the subject, not an extra.                                                                                                                               |
| Stars            | Closed-form ballistic stars where a shell's stars only fly and burn: a pure function of the shell, the star's index and the time, drawn in one instanced pass with no state. GPU emitters with state (Fire Temple's framework) only where stars split, spawn or sputter: crossettes, crackle, glitter, sparklers | A stateless star costs no memory or update, survives a pause, a resize and a held frame, and can be scrubbed by scroll. 2.4 measures where stateful emitters start to pay.                                                                                                                                            |
| Trails           | Two models, chosen per effect: the eye (a short streak a star leaves in about a tenth of a second) and the camera (an exposure whose trails last as long as the shutter is open), both computed from the star's past path, not accumulated                                                                       | Photographs and eyes disagree, and a page may want either. Recomputing the path is exact under resize and pause, which an accumulation buffer is not (Fire Temple 7.7).                                                                                                                                               |
| Smoke            | Fire Temple's 2D fluids at low resolution, fed by each break, drifting in the 3D wind, lit from inside by later breaks                                                                                                                                                                                           | The smoke a display leaves is half its look on a still night, and the reason a finale goes milky.                                                                                                                                                                                                                     |
| Neon             | Tubes as distance-field strokes along the text field's centre lines and along hand-made paths, with the gas or phosphor choosing the spectrum. Shared with Temple of Time 6.4: whoever builds it first puts it in the core                                                                                       | Two neon signs exist (Light Temple's, and Temple of Time's unbuilt one). One tube model serves the 1980s sign and the Tokyo street.                                                                                                                                                                                   |
| Japanese text    | Latin first. Kanji and kana on signs need a CJK font under the SIL OFL (Noto Sans JP or a similar one), subset to the characters used, after the user approves the download (1.9)                                                                                                                                | A CJK font is several megabytes. Subsetting keeps a sign's text to tens of kilobytes. Nothing is downloaded without asking.                                                                                                                                                                                           |
| Intensity        | Hero's Journey's shared `dose` control, labelled "intensity": shells a minute, burst size, sparks, flicker, rain and sign density, together. Default 0.35                                                                                                                                                        | One control a page can turn down, and the analysers' contract already holds up to its strong end. The key stays `dose` so the contract matches across families.                                                                                                                                                       |
| Safety checks    | Flash, red-flash, pattern and motion checks over every effect and preset, at the default and at the strong dose, in `npm test`, plus Earth Temple's shimmer test (flash over 5 × 5 px regions) for sparks, glitter and LED dots                                                                                  | Bursts are flashes, strobes and firecrackers flash many times a second, red is the festival's colour, and sparks shimmer below the flash analyser's cells.                                                                                                                                                            |
| Realism check    | Reference video licensed CC0 or CC BY (Wikimedia Commons), credited in `docs/realism/`, or the user's own. Star speed, burst radius, droop, burn time and colour are measured from it as well as judged by eye                                                                                                   | Fireworks have numbers that can be measured from video: a burst's radius over time, its fall, and how long stars burn.                                                                                                                                                                                                |
| Accent           | Gold (`#ffc94d` dark, `#8a6100` light): a willow's charcoal sparks, and the gold of Lunar New Year. Tier C moves from amber to rose, which sat beside the gold; Tier B is teal, as in Moon Temple                                                                                                                | No colour was named. Red is close to Star Temple's and Fire Temple's, and neon pink and cyan are close to The Hero's Journey's magenta and Storm Temple's cyan. Gold was free. Revisit if the user names one.                                                                                                         |
| Neutrals         | A little indigo, like a city sky at night, light and dark equally                                                                                                                                                                                                                                                | Fireworks and neon are night natives; lanterns and festival lights are tested over a light page as well.                                                                                                                                                                                                              |
| CSS prefix, port | `yh-`, dev port 5520, launch config `yearofthehorse`                                                                                                                                                                                                                                                             | Unused by the other families. 5373, 5390, 5410 to 5510, 5441 and 5471 are taken by the other holofx projects.                                                                                                                                                                                                         |
| Hosting          | Cloudflare Pages (classic) project `yearofthehorse`, direct upload                                                                                                                                                                                                                                               | No server needed. Create the project with `wrangler pages project create --force`, or wrangler converts the repo to Workers.                                                                                                                                                                                          |
| No-WebGPU        | A poster per effect, a CSS version where one is honest (12.4), and a 10-bit AV1 loop for backdrops that answer nothing (Moon Temple 8.3)                                                                                                                                                                         | CSS neon is a real fallback for a heading. A video loop is a fair one for a fireworks backdrop, which answers nothing; it is not one for a sparkler cursor.                                                                                                                                                           |

## Carried over from the other temples

These findings shape this plan, so they need not be rediscovered.

- **Fire Temple's fireworks** (7.5). Shells die at their apogee and spawn their stars on the GPU: peony, chrysanthemum, willow, ring, palm, crossette, crackle and glitter, with star colours from the salts' emission bands. Every preset reads `low` on the flash analyser, held there mainly by spacing between breaks. The analyser averages over cells about 80 px across, so sparse points barely register, and a large white break flash must be measured again. This family starts from that effect's findings and goes further: real spectra, the trail models, smoke, shaped and Japanese shells, and the display as a whole.
- **Fire Temple's sparkler** (7.6). Sparks from a swept tip that leaves no gaps, which fork mid-flight into two or three children by GPU spawning. The senko hanabi (4.2) is a slower, stranger relative.
- **Fire Temple's celebration bursts** (9.13). Click and success bursts from the element that earned them. The success burst here (11.1) must beat it, or point to it.
- **Fire Temple's particle framework** (Epic 7). Emitters with lifetimes and a free list, indirect draws, sorting only where smoke needs it, additive light without. Its trails study (7.7): ribbons are sharp and belong to their particle but cost vertices; an accumulation buffer is cheap but smears under camera motion and is cleared on resize.
- **Blackbody colour** (the core's `blackbody.wgsl`, with Fire Temple's TypeScript twin). Gold sparks, charcoal and a candle's flame.
- **Glitter is flicker** (Fire Temple `flicker.wgsl`, Snow Temple 6.4). Glitter stars, twinkling and failing neon are built from band-limited signals with a capped rate.
- **Point-source rendering and glare** (Moon Temple Epic 2, ported in Star Temple 1.7). Energy-conserving spots that do not shimmer as they move, and diffraction glare: distant stars of a shell, drone lights, festoon bulbs far away.
- **Night streets and fairy lights** (Moon Temple 4.2, 4.3). City lights and bulbs out of focus are Moon Temple's. The wet street here (Epic 9) can hand its lights to that lens.
- **Halation** (Moon Temple `halation-text`). The red halo of film without its anti-halation layer, which is the colour of many photographs of Tokyo at night (9.7).
- **The stroke renderer** (Storm Temple). Thick, joined HDR lines: neon tubes, light painting, traffic trails, laser lines.
- **The font distance field** (Temple of Time 1.6, in Earth Temple and Wind Temple). Neon along a heading, a sparkler that writes, a drone show forming a word, LED text.
- **Lettering is a grating** (Wind Temple). Condensed capitals at 42% of a banner's depth read pattern `high`; at 30% they read `none`. Every sign starts from that size.
- **Evenly spaced bright things are a grating** (Earth Temple 1.2; Wind Temple's streamers; Temple of Time's lattices). A row of lanterns, a line of festoon bulbs and an LED panel are rows of bright things. Spacing is jittered, depth is added, and the analyser checks it.
- **Halftone and Ben-Day screens are lattices** (Temple of Time). An LED panel's pixel grid is one, and the `lattice` reading checks it.
- **Envelopes that dip are extra flashes** (Storm Temple). A neon strike and a failing tube are tested at many frame phases.
- **A held frame is the frame** (Storm Temple 6.2). The held frame of a display shows bursts open at their own ages, never at a break; a sign held lit, never mid-flicker.
- **The 3D wind** (Wind Temple 2.1). Smoke, sky lanterns and swaying lantern rows drift in it.
- **Fluids and the volume kernel** (Fire Temple Epic 6, 3.12). Firework smoke and stage haze.
- **Parallax breaks up whole-field motion** (Snow Temple 2.1). Lanterns rising at one depth move together and read as drift; at many depths they do not.
- **Optical flow cannot see sparse, faint particles** (Snow Temple 2.4). Sparks and distant stars are also checked against the motion caps from their own transforms.
- **A loop is cheap to play but dear to download** (Moon Temple 8.3). A ten-second 1080p loop in 10-bit AV1 was about 290 kB against 27 kB of shader code, and played at the empty page's cost. 8-bit encodes band dark gradients.
- **Multisampled thin geometry needs centroid interpolation** (Earth Temple). Thin streaks and wires drawn with MSAA.
- **Reset per-frame counters in the command buffer, not by a buffer write** (Earth Temple). Emitters that append stars.
- **Half-float writes truncate on Apple GPUs** (Fire Temple 5.6), and half-float blending drops small light (Moon Temple 1.6). Anything that accumulates over frames is stored in `f32`.
- **CI's software Vulkan crashes on a texture read after a workgroup barrier** (Snow Temple, Mesa 25.2's lavapipe). Compute shaders read textures before their first barrier.
- **Scratch work needs a home.** Long sweeps and probes go in `experiments/`, outside test, typecheck and lint.

## Findings so far

- **A burst's expansion reads as a zoom.** The motion check fits one rigid move to everything it can track, and on a dark sky the only things it can track are the stars. With stars that slowed gently (drag 1.5 a second), a burst kept expanding for most of its life, and the median zoom read over the cap. Real stars of a few grams stop within about a second. With drag at 3 to 3.6 a second, three shells in the air at the default pass. The strong dose is held to four. This is a question for the safety rules as much as for the effect (2.8): is one burst in a corner of the view whole-field motion?
- **Falling stars read as drift.** Stars falling at a third to half of the burst's radius a second read 0.06 to 0.1 screen widths a second of drift, over the cap of 0.05. Real stars fall at a tenth to a fifth of the radius a second, and at that speed the bursts pass.
- **A burst of thick streaks is a grating.** Drawn 1.6 pixels wide whatever the canvas size, 120 streaks in a 480 × 270 test frame (taken as a 1920-pixel view) read pattern `high`. Drawn at a width in proportion to the burst, a pixel wide with their light kept where they would be thinner, they read `none`.
- **A red peony is a red flash.** One cell flashed red once in four seconds, as a strontium-red burst lit and burnt out in it: flash `low`, far under three a second. The fireworks are declared `low`, as Fire Temple's were.

## Overlaps and who owns what

| Nearby work                                                | Where                                              | Year of the Horse's part                                                                                                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fireworks`, `sparkler`, `celebration`, particle framework | Fire Temple                                        | Built on and gone beyond: spectra, trail models, smoke, shaped and Japanese shells, displays. Fire Temple's effects stay where they are; the decision guide (13.4) says which to use. |
| `emitters` (fireworks and sparks)                          | hologpu                                            | The shell and star model (2.3, 2.4) is shaped for the core, where hologpu can take it.                                                                                                |
| `night-street`, `fairy-lights`, bokeh                      | Moon Temple                                        | Lights in focus here; out of focus there. The wet street's lights can be handed to its lens.                                                                                          |
| `neon-sign`                                                | Light Temple (built), Temple of Time 6.4 (unbuilt) | One tube model (7.1), built by whichever family gets there first and moved to the core. The 1980s sign stays Temple of Time's; the Tokyo street is here.                              |
| Laser backdrops, disco spots                               | Temple of Time                                     | Its 1980s laser and disco looks stay there. Stage beams through haze (6.5) are here, on the volume kernel.                                                                            |
| `rain-glass`, rain, puddles                                | Water Temple, Storm Temple                         | Rain on glass and storms stay there. Rain lit by signs, and wet asphalt's reflections (9.1, 9.3), are here.                                                                           |
| `bunting` (unbuilt 4.7)                                    | Wind Temple                                        | Bunting is cloth, and stays there. Lantern rows (5.3) use the same wind and the same catenary.                                                                                        |
| `fireflies` and paper lanterns                             | The Eightfold Path                                 | Its pixel-art lanterns stay there. The lantern here (5.1) is light through paper, and could replace its sprite.                                                                       |
| CRT, LED wall (§4.1)                                       | The Bazaar                                         | The Bazaar's retro displays are signal looks. The LED panel here (8.1) is the physical sign: pitch, scan, brightness. Shared if both need it.                                         |
| `halation-text`                                            | Moon Temple                                        | Reused for the film look (9.7).                                                                                                                                                       |
| Fire, embers, candle flames                                | Fire Temple                                        | A lantern's candle (5.1) reuses its flame.                                                                                                                                            |

## Practicality tiers

Every effect is tagged with a tier. Budgets are starting targets, to be validated in Epic 13.

| Tier            | Meaning                                             | Shape                                                                                                        | GPU budget @1080p                   |
| --------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **A** Drop-in   | Safe as ambient decoration, including mobile        | One or two passes, stateless stars or sparks: a few shells, a sparkler, a lantern row, a neon heading        | ≤ 2 ms on integrated GPU            |
| **B** Feature   | Hero sections and interactive set pieces            | Stateful emitters with splitting stars, a smoke grid, a wall of signs, a drone show of a few thousand lights | ≤ 6 ms on integrated GPU            |
| **C** Showpiece | Dedicated page or landing experience, desktop-first | A whole display over water with smoke and reflections, the rain-wet street, beams through volumetric haze    | ≤ 12 ms on discrete / Apple Silicon |

Budgets include the HDR tail. Firework studies report shells, stars and sparks beside milliseconds. Effects that keep state report its memory.

## Architecture sketch

```
yearofthehorse/
  index.html
  vite.config.ts
  src/
    main.ts            bootstrap: one shared GPU session, mounts an effect
    gpu/               device, canvas, frame loop, shaders, uniforms, targets, passes, post/
                       (bloom, tonemap, colour stage, night vision), dom-rects, pointer, scroll,
                       safety/ (dose, pattern, motion, colour caps, gate), text/ and strokes/,
                       points/ and glare/ (from Moon Temple), sim/ and volume/ (from Fire Temple),
                       wind/ (from Wind Temple), plus
                       emission/ (spectra of star compositions and gases, to wide-gamut colour),
                       shells/ (shells, stars and their closed-form flight, trails, the break),
                       sparks/ (branching sparks, sparklers, the senko hanabi),
                       smoke/ (smoke fed by breaks and lit by them),
                       lantern/ (light through paper),
                       neon/ (tubes, gases, phosphors, the strike),
                       led/ (panels: pitch, scan, pulse width) and
                       wet/ (rough wet reflections, puddles)
    wgsl/              shared chunks: hash, noise, sdf, oklab, plus emission, ballistic, spark
                       and wet reflection
    effects/<id>/      meta.ts (eager), index.ts + *.wgsl (lazy chunk), notes.md, poster.webp
    shell/             app frame, gallery, effect page, contexts, controls, notes, scorecard, HUD
    lib/               the library entry: mount an effect on a caller's canvas
  tests/               vitest on Dawn's Node bindings: real WebGPU, no browser
                       (flash.ts, pattern.ts and motion.ts run over every effect and preset)
  experiments/         scratch sweeps and probes; not part of the test run
  docs/                research output: support matrix delta, cost studies, realism/ (reference
                       clips, credits, measurements and side-by-sides), findings
```

The effect contract is Wind Temple's, unchanged, `dose` included, so effects and shell code move between the families. A burst that starts from a button and a neon tube that follows a heading read their rectangles through the context.

## Definition of done (per effect story)

1. **Budget.** It runs inside its tier budget on the reference devices, with the numbers recorded. Until the device matrix exists (13.2), the only reference device is the development machine, an M1 Max. It is measured per frame on Dawn and as one frame in Chrome, and gets the lowest tier whose budget neither number exceeds. An A or B label is provisional until 13.2, and the scorecard says so.
2. **Parameters.** They are exposed through the schema with `dose` honoured, and there are at least two presets.
3. **Lifecycle.** It handles resize, DPR changes, device loss, offscreen pause and `prefers-reduced-motion`. The held frame shows a calm moment: bursts open at their own ages and never at a break, a sparkler mid-burn, a sign lit and steady.
4. **Flash, red flash, pattern and motion.** It stays under all four at its defaults and at the strong dose. Every preset that goes over is declared and starts behind the gate. Sparks, glitter and LED dots also pass the shimmer test at many frame phases.
5. **State.** Where it keeps state (emitters, smoke), it is stable at any frame rate down to 15 fps, and is reset or resumed cleanly after a resize, a pause or a parameter change. Nothing piles up after a tab has been hidden for minutes.
6. **Realism.** Fireworks and sparks are compared with reference video in `docs/realism/`, by measured radius, droop, burn time and colour where they can be measured, and the notes say what still gives them away.
7. **Contexts.** It is shown in at least one realistic web context, over a dark and a light page and at phone size, and its screenshots have been looked at.
8. **Notes.** `notes.md` is written: how it works and what the mechanism is, cost, pitfalls, safety, when to use it, and references. Where a CSS version exists, the notes say how close it gets. Where it draws on a festival's tradition, the notes say whose it is.
9. **Release.** The scorecard is filled in and the fallback poster captured.

## Milestones

| Milestone                | Scope                                    | Proves                                                                                                    |
| ------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **M0** Vertical slice    | Epic 1, stories 2.1–2.4, 3.1             | Tooling → spectra to colour → stateless shells whose bursts are measured, not painted → a drop-in display |
| **M1** Shells            | Rest of Epics 2 and 3                    | Trails, smoke, splitting stars, the Japanese shell and a whole display, against video                     |
| **M2** In the hand       | Epic 4                                   | Branching sparks: sparkler, senko hanabi, fountains, firecrackers as page parts                           |
| **M3** Lanterns          | Epic 5                                   | Light through paper, rows in the wind, sky and floating lanterns                                          |
| **M4** Festival light    | Epic 6                                   | Bulbs, chasers, drones, beams through haze                                                                |
| **M5** Neon              | Epic 7                                   | The tube from a gas, on a heading and on a wall of signs                                                  |
| **M6** Signs and screens | Epic 8                                   | LED panels, giant screens, lightboxes                                                                     |
| **M7** The wet street    | Epic 9                                   | Reflections, rain, haze and trails: the neon city                                                         |
| **M8** On the page       | Epics 10 and 11, stories 12.1–12.5, 13.2 | The themes as page kits, web-native usefulness, on more than one device                                   |
| **M9** Release           | Rest of Epics 12 and 13                  | Published findings, shared pieces moved into the core                                                     |

Fireworks come first and must not be rushed. M5 to M7 (the neon city) depend only on Epic 1, so they can run alongside M1 to M4. M2 needs the emission pipeline (2.2) and Fire Temple's emitters. M7 needs neon (7.1) and the LED panel (8.1) for something to reflect.

Story format: `ID Title [tier] (size)`. Sizes: S ≈ a day or less, M ≈ a few days, L ≈ a week or more.

---

## Epic 1 — Foundation and tooling

- [x] **1.1 Scaffold** (S) — Wind Temple's committed tree copied (`git archive`). Its effects and its wind-only code are removed: the cloth solver, the banner and the streamers. The 3D wind, the fluids, the volume kernel, the points and glare, the text field, the stroke renderer, the fold library, night vision, the palettes and the safety checks stay. The `wd-` prefix is renamed `yh-`; watch template literals such as `` `--wd-${string}` ``. Gold accent and indigo neutrals, with the tier colours checked against it. Dev port 5520, launch config `yearofthehorse`. `dose` is labelled "intensity".

  _Done from Wind Temple's commit f9cdb4b. Removed: `banner`, `hello`, `src/gpu/cloth/`, the cloth and flutter tests, the banner pattern experiment, its studies and its support probe. `wd-` is now `yh-`, port 5520, launch config `yearofthehorse`. Gold accent on a little-indigo neutrals in both themes. Tier B teal, Tier C moved from amber to rose, clear of the gold. The favicon is a gold burst. `node_modules` was cloned from Wind Temple's (identical dependencies), so nothing was downloaded._

- [x] **1.2 `hello`** [A] (S) — the smallest effect: shells rising and breaking into stars, in one instanced pass with no compute and no state, with `dose` wired from the start.

  _`hello`: up to four shells in the air, each a rising comet and 120 stars, every star a pure function of its shell, its index and the time, in one instanced draw of short streaks added into the HDR scene. Stars fly on the closed-form path of a ball with drag proportional to speed under gravity, leaving the break in directions spread over a sphere (a Fibonacci spiral), so a burst is a filled globe brightest at its rim. Peonies in strontium red, barium green, copper blue, sodium yellow and violet; one shell in three a gold chrysanthemum with long tails. Stars light over a quarter second and burn out each in its own time. The held frame shows each shell open at its own age. 0.55 ms on Dawn at 1080p and 0.71 ms in Chrome (0.70 to 0.73 over 3 loads), 28 kB gzipped: Tier A. It started in all eight browser-check views with no console errors. Flash `low` (one red cell, once in four seconds), pattern `none`, and motion inside the caps up to the strong dose. See Findings so far._

- [ ] **1.3 Repository and CI** (S) — its own git repository (`s4njee/yearofthehorse`). The other families' repositories were created private and made public on the user's word, since private repositories cannot run Actions on this account. The CI workflow runs on software Vulkan (lint, format, typecheck, tests, build) and is green once.
- [ ] **1.4 Deploy** (S) — Cloudflare Pages project `yearofthehorse` (classic, created with `--force`), and `npm run deploy`.
- [ ] **1.5 Posters, catalogue and the holofx site** (S) — posters from held frames, `catalogue.json`, and Year of the Horse in the holofx site's dropdown, lab and effect pages.

  _Poster for `hello` and `catalogue.json` done. Still to do: the holofx site._

- [ ] **1.6 Support matrix delta** (S) — what this family leans on beyond Fire Temple's [support matrix](../firetemple/docs/support-matrix.md) and Wind Temple's [delta](../windtemple/docs/support-matrix.md):
  - the `display-p3` canvas colour space, and `toneMapping: 'extended'` on an `rgba16float` canvas, for colours outside sRGB and lights past white;
  - instanced draws of tens of thousands of streaks, and the cost of a vertex-heavy pass against a compute splat (Star Temple's splat-cost study);
  - `dispatchWorkgroupsIndirect` and indirect draws for emitters whose counts change;
  - additive blending into `rgba16float` and what half-float drops (Moon Temple 1.6);
  - `float32-filterable`, for smoke velocity textures.
- [x] **1.7 Points and glare** (S) — Moon Temple's energy-conserving points and glare, already in the copied tree from Star Temple's port. Tested as there.

  _Came with the scaffold (`src/gpu/points/`, `src/gpu/glare/`, `tests/points.test.ts`, `tests/glare.test.ts`), passing._

- [ ] **1.8 Reference clips** (S) — `docs/realism/`: CC0 or CC BY clips of aerial shells (peony, chrysanthemum, willow, a Japanese warimono), a sparkler, a senko hanabi, neon signs and a wet street at night, credited, with frame rate and what can be measured from each. Downloads need the user's approval, file by file.
- [ ] **1.9 Japanese text** (S) — a CJK font under the SIL OFL, subset to the kana and kanji the signs use, in the text field, after the user approves the download. Measured: atlas size and build time for a sign's worth of characters, and the font's download before and after subsetting.

## Epic 2 — The fireworks engine

- [ ] **2.1 The star model** [—] (M) — a star as a small sphere of composition burning from the outside in: its mass, its drag, its burn rate, and its light while it burns. Measured against 1.8's clips: how fast a 3-inch and a 6-inch shell's stars leave the break, how soon they stop, how far they fall, how long they burn. Tested: the closed-form path matches a small-step integration; the drag constant reproduces a clip's radius over time within 10%.
- [ ] **2.2 Emission colour** [—] (M) — the visible spectra of the colour-giving species (SrCl and SrOH red, BaCl green, CuCl blue, the sodium D lines, CaCl and CaOH orange) and of incandescent metals and charcoal, integrated against the CIE 1931 observer to XYZ, then to linear Display P3 and sRGB, with what is outside sRGB mapped in OKLab (`gamut.wgsl`). Tested: sodium lands at 589 nm's chromaticity; every colour is inside P3; the sRGB mapping keeps hue within a few degrees. A table in the notes of each composition's colour in both spaces.
- [ ] **2.3 Shells** [—] (M) — a shell as a burst charge and a pattern of stars: a sphere (warimono), a canister (less round, with a spread), a ring, a flat shape seen from an angle, and layers (a pistil inside a petal, the double-petalled yae-shin). Its break height, its timing fuse and its burst speed. A shell is a small record a page or a script can make, so a display is a list of shells (3.8).
- [ ] **2.4 Stateless and stateful stars** [—] (M) — the closed-form stars of `hello`, generalised, against Fire Temple's GPU emitters, measured on the same shells: cost by star count, memory, what each can do (splitting and spawning need state), and what each does under pause, resize and scroll scrubbing. Decides which shells are stateless.
- [ ] **2.5 Trails** [—] (M) — the eye and the camera (Decisions): a star's past path recomputed and drawn as a streak whose light fades with the persistence of vision, or as an exposure whose length is the shutter's. Tested: a streak's light is the same at 30 and 120 fps; a camera trail's length is the shutter's within a frame.
- [ ] **2.6 Smoke** [—] (M) — each break leaves a puff in a low-resolution 2D fluid, which drifts in the 3D wind and thins; later breaks light it from inside, and it hides the stars behind it. Measured: how much a finale's smoke dims later bursts, and its cost at three grid sizes.
- [ ] **2.7 Glitter, crackle and strobe** [—] (M) — the stars that are not steady: glitter (sparks that flash after a delay), crackle (microstars that burst), strobe (stars that blink at several hertz). Built on the band-limited flicker signal. Measured: the rates at which each trips the flash rule over a full-width display.
- [ ] **2.8 Burst safety** [—] (S) — a break is a flash and an expanding burst reads as a zoom (Findings so far). Measured: break brightness, burst size and shell rate against the flash, red-flash and motion checks, and whether a burst in a corner of the view is whole-field motion at all. Proposes, for the shared safety rules, a reading for local looming that is not whole-field motion, or confirms the caps as they are. A salute (a white break with no stars) gets its own limit. Wind Temple met the same question with a lone flag over a flat page (its 2.7): the answer should serve both.

## Epic 3 — Shells and displays

- [ ] **3.1 `peony-display`** [A] (S) — the drop-in display: a few peonies and chrysanthemums at a time behind a hero, with the star model and colour of 2.1 and 2.2.
- [ ] **3.2 `willow`** [A] (S) — gold willow and kamuro: heavy charcoal stars that burn long, droop and hang like a weeping willow, the slowest and calmest shell.
- [ ] **3.3 `palm-and-ring`** [A] (S) — a palm's few thick comets with a rising tail, and rings at random tilts, as ellipses.
- [ ] **3.4 `crossette`** [B] (S) — stars that split in four, each split a cross, on the stateful emitters.
- [ ] **3.5 `warimono`** [B] (M) — the Japanese round shell: a near-perfect sphere, the double-petalled yae-shin with a pistil of another colour, stars that change colour as they burn.
- [ ] **3.6 `shaped-shells`** [A] (S) — hearts, smiles, stars and a horse's head as flat patterns of stars, seen at the angle the shell happens to break at. A page's shape (an SVG path or the text field) as a shell, with the honest result: most break skewed, and the notes say why.
- [ ] **3.7 `glitter-finale`** [B] (S) — glitter, crackle and strobe stars (2.7), held under the flash rule, with the full-rate strobe as a gated preset.
- [ ] **3.8 `display`** [C] (L) — a whole show from a list of shells: a programme, a finale, smoke building up (2.6), the bursts reflected in a river below (9.1's reflections, or a cheaper flipped copy), the hanabi taikai over the Sumida as its reference.
- [ ] **3.9 Realism study** (M) — side-by-sides with 1.8's clips: radius over time, droop, burn time, colour, trail. What gives each effect away.
- [ ] **3.10 Against Fire Temple's `fireworks` and a video loop** (S) — the same programme in Fire Temple's effect, here, and as a 10-bit AV1 loop: cost, download and what each loses.

## Epic 4 — In the hand and on the ground

- [ ] **4.1 Branching sparks** [—] (M) — a molten droplet thrown from a burning tip, bursting as its gas escapes, its pieces bursting again (Fire Temple 7.6's forking, with a measured branching ratio and generation count). Shared by the sparkler, the senko hanabi and the fountain.
- [ ] **4.2 `senko-hanabi`** [A] (M) — the Japanese incense sparkler held from the top: the glowing dross ball that grows and trembles, then the four stages (botan, matsuba, yanagi, chirigiku) as it cools, sparks branching finer and fewer each stage, and the ball's fall. A quiet, minute-long effect for a summer page or a loader.
- [ ] **4.3 `sparkler-cursor`** [A] (S) — a sparkler that follows the pointer, with the branching sparks; beside Fire Temple's `sparkler`, which it must beat or defer to.
- [ ] **4.4 `sparkler-writing`** [B] (M) — a sparkler that writes a word, the camera's exposure leaving the word as a trail (2.5's camera), from the text field's strokes.
- [ ] **4.5 `fountain`** [A] (S) — a ground fountain (gerb): a cone of sparks rising and falling, gold or silver, as a footer or a loader.
- [ ] **4.6 `firecrackers`** [B] (M) — a string of red firecrackers going off: paper, flashes and smoke. The hardest safety case in the family: dozens of flashes a second. Measured: the slowest, dimmest version that still reads as firecrackers, and the full version only behind the gate.
- [ ] **4.7 `catherine-wheel`** [A] (S) — a spinning wheel of jets on a pin, held under the rotation cap.

## Epic 5 — Lanterns

- [ ] **5.1 Light through paper** [—] (M) — a lantern as a thin translucent shell lit from inside: diffuse transmission through the paper, its tint, the ribs and seams as shadows, the flame or bulb seen through it as a brighter patch, and the glow it throws around it. Fire Temple's flame for a candle. Tested: energy is kept; a thinner paper transmits more.
- [ ] **5.2 `red-lantern`** [A] (S) — one Lunar New Year lantern (a red, round lantern with gold tassels), swaying, as a corner ornament.
- [ ] **5.3 `lantern-row`** [A] (M) — a row of lanterns on a sagging line across a header, swaying in the 3D wind, with depth and spacing jittered so it is not a grating. Chinese red lanterns and Japanese chōchin as presets.
- [ ] **5.4 `sky-lanterns`** [B] (M) — paper lanterns rising on hot air (buoyancy against drag, drifting in the wind), dimming as they climb, after Yi Peng and Pingxi. The notes say that sky lanterns are banned in many places for fire and livestock risk; this is light on a screen.
- [ ] **5.5 `floating-lanterns`** [B] (M) — lanterns floating down a river at dusk, reflected and bobbing, after tōrō nagashi and Loi Krathong. Both are remembrances (tōrō nagashi is for the dead); the notes say so, and the effect is offered for pages that understand it.
- [ ] **5.6 `diyas`** [A] (S) — rows of small oil lamps for Diwali, each flame its own flicker under the cap.

## Epic 6 — Festival light

- [ ] **6.1 `festoon`** [A] (S) — festoon bulbs on a catenary in focus: a filament or an LED in each bulb, glare, and the sag swaying, for a header or a footer.
- [ ] **6.2 `marquee-bulbs`** [A] (M) — bulbs around a sign chasing each other, as theatre marquees do. A chase is a moving pattern: measured against the pattern and flash rules for chase speed and bulb spacing.
- [ ] **6.3 `drone-show`** [B] (M) — a few hundred to a few thousand lights flying from a grid into a shape and on to the next: the shapes from the text field or an SVG, the assignment of drones to points (a matching that keeps paths from crossing), and the flight limited by speed and spacing as real shows are. The modern stand-in for fireworks.
- [ ] **6.4 `glowsticks`** [A] (S) — a crowd of glow sticks and LED wristbands swaying to a beat, in colour waves across the crowd. Waves are whole-field motion: held under the caps.
- [ ] **6.5 `stage-beams`** [C] (M) — moving-head beams and gobo patterns through haze, on the volume kernel, sweeping. Beams sweeping the whole view are motion and flash: measured.
- [ ] **6.6 `light-painting`** [A] (S) — the pointer as a light in a long exposure, its trail kept as a stroke and fading, in a choice of light sources (a torch, a sparkler, a strip of LEDs).

## Epic 7 — Neon

- [ ] **7.1 The neon tube** [—] (M) — a tube as a distance-field stroke with its glass, its glowing gas column, its dark electrode ends and the back-plate glow. The colour from the gas (neon's red-orange lines, argon and mercury's blue) or from a phosphor on the glass, through 2.2's pipeline. Shared with Temple of Time 6.4.
- [ ] **7.2 Strike and failure** [—] (S) — a tube striking (the flicker as the gas ionises, once), a failing tube (a band-limited flicker and a dark section), and a buzzing transformer's steady faint flicker, each under the flash rule at many frame phases.
- [ ] **7.3 `neon-heading`** [A] (S) — the page's heading in neon tubes, from the text field's centre lines, with the strike on load.
- [ ] **7.4 `neon-404`** [A] (S) — a 404 page sign with one letter failing.
- [ ] **7.5 `neon-loader`** [A] (S) — a loader that is a tube lighting along its length.
- [ ] **7.6 `sign-wall`** [B] (M) — a wall of signs, Kabukicho style: vertical signs of different widths and heights, Latin or (after 1.9) kana and kanji, each its own colour and flicker, with depth so the wall is not a grating. Made-up names only.
- [ ] **7.7 `neon-art`** [A] (S) — a neon drawing from an SVG path: a horse for the Year of the Horse, a logo the page gives.
- [ ] **7.8 Neon on a light page** (S) — a lit tube in daylight: the glass and the colour of the unlit or dim tube, against the page.
- [ ] **7.9 Against CSS neon** (S) — the CSS `text-shadow` neon heading beside 7.3: cost, and what it cannot do (the tube, the electrodes, the strike, the wall glow).

## Epic 8 — Signs and screens

- [ ] **8.1 The LED panel** [—] (M) — a panel as a grid of emitters with a pixel pitch, each a small lens of light, the scan that lights its rows in turn, and brightness by pulse width. Seen far away it is a screen; close up, dots; through a camera, banded. A lattice: held under the pattern rule by distance, blur and contrast.
- [ ] **8.2 `led-marquee`** [A] (S) — a scrolling LED sign for a notice: the page's text in dots. Scrolling text is a moving pattern: measured for speed and pitch.
- [ ] **8.3 `crossing-screen`** [B] (M) — a giant screen on a building at a crossing, playing what the page gives (an image, a canvas, a video), with its pitch, its brightness at night, and its light spilling on the street.
- [ ] **8.4 `lightboxes`** [A] (S) — backlit plastic signs, a vending machine's glow and a konbini's white light: the street's steady lights beside the neon.
- [ ] **8.5 `hologram-ad`** [B] (S) — a projection in the air: additive, with scan lines and a faint dropout, the cyberpunk staple, kept honest as a projection on haze.

## Epic 9 — The wet neon street

- [ ] **9.1 Wet reflections** [—] (M) — a rough wet surface: a thin water film over asphalt, sharp reflections in puddles and long streaks where it is rough, the streaks lengthening as the view grazes. Tested against the measured stretch of a microfacet lobe at grazing angles.
- [ ] **9.2 `wet-street`** [C] (L) — the neon city after rain: a street of signs (7.6, 8.4), the wet road reflecting them (9.1), haze around every light, and people's umbrellas as silhouettes. The family's showpiece.
- [ ] **9.3 `neon-rain`** [B] (M) — rain falling through the signs' light: each drop a short streak lit by whatever is behind and near it, the drops near a sign coloured by it. Water Temple's rain, lit by the street.
- [ ] **9.4 `light-trails`** [B] (M) — traffic in a long exposure: head and tail lights as trails (2.5's camera), a bus's lit windows, a train crossing a bridge.
- [ ] **9.5 `steam-vents`** [B] (S) — steam from vents and food stalls, lit by the signs, on the volume kernel.
- [ ] **9.6 `alley`** [B] (M) — a narrow Tokyo side street (yokochō): lanterns and lightboxes, a few signs, a wet path, close and quiet. Where the two themes meet.
- [ ] **9.7 Film looks** [—] (S) — the colours of night film photographs: halation (Moon Temple's), the tungsten-balanced film's cyan cast, grain. As a post pass any effect here can take.

## Epic 10 — The Year of the Horse

The themes as a set: page kits for each festival, sharing effects.

- [ ] **10.1 `fire-horse`** [B] (M) — the year's emblem: a horse galloping in light, drawn as a firework (3.6), as neon (7.7) or as a lantern (5.1), from one SVG path.
- [ ] **10.2 Lunar New Year kit** (M) — a lantern row header, a fire-horse hero, red-and-gold success bursts, and a countdown to midnight with a finale. Red is held under the red-flash rule throughout.
- [ ] **10.3 Summer festival kit** (M) — chōchin rows, a hanabi display, the senko hanabi as a loader, floating lanterns at the foot of the page.
- [ ] **10.4 New Year's Eve kit** (S) — a countdown, a finale and a celebration, for any culture's new year.
- [ ] **10.5 Diwali kit** (S) — diyas, fountains and sparklers, with the notes' care for the festival.
- [ ] **10.6 Neon city kit** (M) — a neon heading, a sign wall header, an LED notice, a wet-street hero and a neon 404.

## Epic 11 — On the page

- [ ] **11.1 `success-burst`** [A] (S) — a burst from a button that earned it, as a success state: one small shell, never a flash. Against Fire Temple's `celebration`.
- [ ] **11.2 `countdown`** [B] (M) — a countdown to a date, with a finale at zero, and the finale's safety (a page left open at midnight is a gate case).
- [ ] **11.3 Scroll-driven display** [B] (S) — a display scrubbed by scroll: stateless shells (2.4) make it exact in both directions.
- [ ] **11.4 Fireworks behind text** [A] (S) — bursts kept away from the text's rectangles, so the page can be read through the show.
- [ ] **11.5 Lights on page elements** (S) — festoons hung from a card's top edge, neon around a button, an LED badge.

## Epic 12 — Production readiness

- [ ] **12.1 Library entry** (S) — mount any effect on a caller's canvas, with element tracking, as the other families do.
- [ ] **12.2 Low-end devices** (M) — shells, stars, sparks, smoke grids and sign counts by device, and what each looks like on a phone at DPR 3.
- [ ] **12.3 Accessibility** (M) — `docs/accessibility.md`:
  - flash, red flash, pattern and motion over every preset;
  - the burst, strobe, firecracker, chase and scroll limits from 2.7, 2.8, 4.6, 6.2 and 8.2;
  - held frames and the start gate;
  - a finale that a page left open does not set off unannounced.
- [ ] **12.4 CSS fallbacks** (S) — for each Tier A effect, the best CSS or SVG version beside it, with its cost and what it cannot do.
- [ ] **12.5 Adaptive quality** (S) — shells, stars, sparks, smoke resolution and sign counts scale with the measured frame time, from the shared rungs.
- [ ] **12.6 Into the temple core** (M) — move the following into `@mk7s/hologpu-temple-core`:
  - the emission pipeline (2.2);
  - shells, stars and trails (2.3–2.5);
  - branching sparks (4.1);
  - light through paper (5.1);
  - the neon tube (7.1, 7.2);
  - the LED panel (8.1);
  - wet reflections (9.1).

## Epic 13 — Measurement and findings

- [ ] **13.1 Cost studies** (S) — every epic's effects on Dawn and in Chrome, with shells, stars and sparks beside milliseconds, and memory, filed in `docs/studies/`.
- [ ] **13.2 Device matrix** (M) — an integrated GPU, a phone, and Safari and Firefox, to settle the provisional tiers.
- [ ] **13.3 Live, baked and CSS** (S) — Moon Temple's 8.3 and 8.4 for this family: fireworks as a loop, neon as CSS, and where each is the right choice.
- [ ] **13.4 Decision guide** (S) — which effect for which job and which festival, beside Fire Temple's fireworks, Moon Temple's lights and Temple of Time's neon, and the cases where the answer is "don't".

## Risks and open questions

- **Flash.** Fireworks, strobes, firecrackers, chasing bulbs and failing neon are all flash risks, and this family has more of them than any other. Some looks (a full-rate strobe finale, a string of firecrackers) may only ever be gated presets.
- **Red.** The red-flash rule is stricter than the general one, and red is Lunar New Year's colour. A red display may have to be slower or dimmer than the real thing.
- **Looming.** The motion caps were written for whole-field motion (tunnels, spirals). A burst expanding in part of the view is not that, but the analyser reads it as a zoom. 2.8 must settle whether the caps hold as they are or need a reading for local motion, and the change, if any, belongs to all the families.
- **Gamut.** Real firework colours are outside sRGB. On an sRGB canvas, a green burst will always look duller than the real one; the wide-gamut canvas is the honest fix, and not every display has it.
- **Cultural care.** Lanterns, diyas and floating lanterns belong to living festivals, and tōrō nagashi is a remembrance of the dead. Every such effect credits its tradition in the notes, carries no religious text, and the kits (Epic 10) do not mix festivals.
- **The cyberpunk cliché.** Neon pink and cyan, rain and holograms are a well-worn look. The value here is in the mechanisms (gas spectra, LED physics, wet reflections), and the notes should be candid when an effect is mostly mood.
- **Japanese text.** Kanji signs need a CJK font. Until 1.9, signs are Latin or made of shapes. Subsetting depends on knowing the characters ahead of time; a sign the page writes needs the characters it uses.
- **Reference licences.** Fireworks video is plentiful, but clips must allow showing on a public site, with credit. The user's own video would avoid the question.
- **Overlap with Fire Temple.** Fire Temple's `fireworks` already exists and works. This family's must be better in ways that can be measured (colour, realism, display), or the decision guide says to use Fire Temple's.
- **Accent.** Gold is a proposal; check it in the holofx site's dropdown beside the other families.
- **Scope.** Two themes and nine effect epics is a lot. Fireworks come first. The neon city (Epics 7 to 9) could become its own family if this one runs long.

## Starting references

From memory, as the other families' plans began; each is to be confirmed against the source when its story is built.

- Takeo Shimizu, _Fireworks: The Art, Science and Technique_ (1981; Pyrotechnica Publications).
- John A. Conkling and Christopher J. Mocella, _Chemistry of Pyrotechnics: Basic Principles and Theory_ (CRC Press, 3rd ed. 2019).
- Michael S. Russell, _The Chemistry of Fireworks_ (Royal Society of Chemistry, 2nd ed. 2009).
- Ronald Lancaster, _Fireworks: Principles and Practice_ (Chemical Publishing, 4th ed. 2006).
- Ernst-Christian Koch's papers on coloured flames in _Propellants, Explosives, Pyrotechnics_.
- CIE 1931 2° standard observer, colour matching functions (CIE 015:2018).
- Torahiko Terada's essay on the senko hanabi (1927), and the later physics of its branching sparks (to be found).
- Álvaro González, "Measurement of Areas on a Sphere Using Fibonacci and Latitude–Longitude Lattices", _Mathematical Geosciences_ (2010).
- William Reeves, "Particle Systems — A Technique for Modeling a Class of Fuzzy Objects", SIGGRAPH 1983.
- Pat Hanrahan and Wolfgang Krueger, "Reflection from Layered Surfaces due to Subsurface Scattering", SIGGRAPH 1993 (paper and thin translucent layers).
- Rudi Stern, _Let There Be Neon_ (1979), on tubes and gases.
- NIST Atomic Spectra Database, for the neon, argon, mercury and sodium lines.
- Bruce Walter, Stephen Marschner, Hongsong Li and Kenneth Torrance, "Microfacet Models for Refraction through Rough Surfaces", EGSR 2007 (the stretched reflections of a wet road).
- Sébastien Lagarde, "Water drop 2b – Dynamic rain and its effects" (2013), for wet surfaces and puddles in real time.
- Kodak and CineStill technical data for tungsten-balanced 800 ISO film without its remjet layer (halation).
- Moon Temple's [decision guide](../moontemple/docs/decision-guide.md) and Fire Temple's [notes on fireworks](../firetemple/src/effects/fireworks/notes.md).
