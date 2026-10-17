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
  | "whoosh"; // panel / sheet open

export type SfxOpts = { i?: number; gain?: number };

type Engine = { play: (name: Sfx, o?: SfxOpts) => void };

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
