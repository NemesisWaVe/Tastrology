# Landing intro: "The Mirror"

## Why the founder's draft works, and what it's missing
The draft is a drop hitting still water, the sky reflected in it, the camera tilting up, and stars forming a card with "Tastrology" written in stars.

**What works:** a reflection is literally what the product does. The product began life as *TasteMirror*. It's calm, beautiful, and very different from every other hackathon landing page.

**What's missing:**
1. **It's a pretty screensaver that never mentions taste.** Someone watching it learns nothing about what the site does.
2. **Scroll-jacked intros annoy judges.** If the first frame sits still until they scroll, half of them bounce.

## The script (about 7 seconds if you scroll steadily; every beat is scrubbable)

### 0. Cold open (autoplays, 0–1.4s, no scroll needed)
- Black, then a still, dark pond fades up, near-horizon, at a low angle. It's barely lit, and faint stars are reflected and wobbling slightly.
- A single drop falls from the top of the frame. It catches the lime accent light as it falls.
- **It hits the water** (sound: a deep, round *plink*).
- The first ring spreads. Text appears in small JetBrains Mono: *"everything you love leaves a ripple"*.
- A scroll cue fades in.

### 1. Ripples carry taste (scroll 0 → 30%)
- More drops fall. Each one is a real persona love such as *Phoebe Bridgers*, *Spirited Away* or *Aesop*. Each name is written on its ring and rides outward on it, then fades as it widens.
- Wherever rings cross, the reflected stars brighten. Where two rings meet, a faint line joins the stars (sound: soft glass *ting*, pentatonic and rising).
- **Message:** your loves spread out and connect. That's Qloo's job, shown rather than explained.

### 2. The reflection resolves (30 → 55%)
- The water calms. The reflection sharpens into constellations, and the lines from beat 1 are now proper constellation lines.
- A galaxy smear (one, two at most) blooms in the reflection, lime and violet (#c6ff3d / #d875ff), like the VS galaxies.
- The caption changes to *"…and the sky keeps track."*

### 3. Look up (55 → 75%)
- The camera tilts up. The horizon drops away and the pond slides out of the bottom of the frame. We're looking at the real sky, which is the mirror image of the reflection, and it is sharper and brighter than the reflection was.
- The constellations twinkle (sound: shimmer swell).

### 4. The card is born (75 → 100%)
- The stars break from their constellations and stream into a **card outline** with rounded corners, at the hero card's aspect ratio.
- The wordmark **Tastrology** forms inside it as a **dot-matrix of stars**. It's sampled from Instrument Serif italic so it reads as *written*, not pixelated, and the dots settle with a tiny spring.
- A final soft chord plays, and the card's foil sheens once.
- The card then shrinks and docks into the existing Hero, where it becomes the hero card. The page is the homepage from here on, with no hard cut.

### End state
- The Hero CTA, "Read my taste" / "Try a persona", is in view.
- The intro stays above the existing landing. Scrolling back up replays it in reverse.

## Rules
- **Never blocks.** "Skip intro" is always visible top right. Once a visitor has seen it, a key in localStorage (`tastrology:intro`) makes later visits start at the cold open and auto-advance in about 2.5s, or jump straight to the hero.
- **Length.**
  - Desktop: a 320vh pinned scroll track.
  - Phone: 240vh, with touch scrolling through Lenis.
- **Reduced motion:** a static still of the beat-4 card over the sky, with a crossfade into the hero.
- **Performance:** one WebGL canvas (raw WebGL with a full-screen-quad shader; no three.js) for the water, reflection, ripples and tilt. A 2D overlay canvas holds the star particles and the card and text. Pixel density is capped at 2 on desktop and 1.5 on phone.
  - Ripple count: 8 on desktop, 4 on phone.
  - Star count: about 900 on desktop, about 400 on phone.
  - Pause when the intro is off screen or the tab is hidden.
  - If WebGL isn't available, fall back to a 2D pond (a gradient with ring strokes).
  - First-load budget: under 25 KB of JS for the intro. No images or video.
- **Sound:** every sound goes through `sfx()` in lib/sound.ts and is silent until the user turns sound on. See sound.md.
- **Copy:** lowercase mono captions only, three lines in total. No marketing voice.

## Phone notes
- On a phone the frame is portrait, so the pond is seen more from above. This works better: rings read as full circles.
- The tilt is shorter, 30° rather than 60°.
- The card fills about 78% of the screen width before it docks.
