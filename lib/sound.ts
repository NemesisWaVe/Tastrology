"use client";

/**
 * One sound bus for the whole site. Every sound is synthesized with WebAudio (no files), and
 * nothing plays until the visitor turns sound on. Contract shared by the intro and the UI:
 * call sfx(name) anywhere; it's a no-op when muted, on the server, or before the engine loads.
 */
export type Sfx =
  | "drop" // water drop hits the pond
  | "ripple" // soft glass ting as rings meet (pass {i} for pitch step)
  | "shimmer" // sky swell when the camera looks up
  | "form" // stars settle into the card + wordmark
  | "tap" // primary button press
  | "tick" // hover / small selection
  | "flip" // card flip
  | "reveal" // rarity reveal
  | "burn" // burn crackle
  | "collide" // VS galaxies collide
  | "whoosh" // panel / sheet open
  | "pop" // any button or link
  | "print" // receipt print head chatter
  | "beep" // checkout scan
  | "stamp" // rubber stamp thunk
  | "tear" // paper tearing off
  | "ding" // microwave-style bell: the card is done
  | "rustle" // card turning in the hand: soft low air
  | "flake" // a fleck of foil coming off
  | "warp" // lightspeed jump between stars
  | "recede" // the camera pulls back out to the whole sky
  | "scratchDone"; // foil cleared: a whoosh, a thock and a chord ({i} walks it up the scale)

/** The foil a scrub is on: sets the colour of its sound. */
export type ScrubMaterial = "silver" | "gold" | "carbon" | "holo";

export type SfxOpts = { i?: number; gain?: number };

type Scrub = { start: (m: ScrubMaterial) => void; move: (speed: number, x: number, cover: number) => void; end: () => void };
type Engine = { play: (name: Sfx, o?: SfxOpts) => void; scrub?: Scrub };

let engine: Engine | null = null;

/** Set by the sound engine once it loads. */
export function setEngine(e: Engine | null) {
  engine = e;
}

export function sfx(name: Sfx, o?: SfxOpts) {
  if (typeof window === "undefined") return;
  try {
    engine?.play(name, o);
  } catch {
    /* sound must never break the page */
  }
}

/**
 * A held scratching sound: start when a finger or cursor goes down on foil, move as it travels (speed 0..1, x 0..1
 * across the foil, cover 0..1 how much is gone), end when it lifts. No-op when muted.
 */
export const scrub: Scrub = {
  start: (m) => {
    try {
      engine?.scrub?.start(m);
    } catch {}
  },
  move: (s, x, c) => {
    try {
      engine?.scrub?.move(s, x, c);
    } catch {}
  },
  end: () => {
    try {
      engine?.scrub?.end();
    } catch {}
  },
};
