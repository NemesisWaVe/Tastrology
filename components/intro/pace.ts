/**
 * Paced scrolling for the intro. The intro is scrubbed by scroll, so one hard flick (or a spun wheel) used to carry the
 * whole story off screen in a fraction of a second. Every input still moves the scene at once (nothing is ever
 * swallowed, so it never feels frozen), but the scene follows at a capped speed, and the input can only run a short
 * way ahead of it: spamming plays the story at full pace instead of skipping it, and letting go stops it promptly.
 * Past the end (the hero) scrolling is the page's own again.
 */

export const BEATS = [0, 0.58, 0.8, 1]; // where the keys step to: water, sky, card written, hero
// progress per second, at most: slower through the story (constellations, the card being written), quicker
// over the water and the handoff. Spun flat out, the whole intro takes about 2.5s.
const vmax = (p: number) => (p > 0.3 && p < 0.9 ? 0.35 : 0.6);
const LEAD = 0.12; // how far the input may run ahead of the scene
const GAIN = 1.6; // scroll distance -> progress, relative to the track's own length

type Opts = {
  track: HTMLElement;
  stage: HTMLElement;
  /** writes the page's scroll position (through Lenis when it is driving the page) */
  scrollTo: (y: number) => void;
  /** smooth wheel scrolling (Lenis) coasts on after the wheel stops: catch it at the hero instead of deep in the intro */
  catchAtHero?: () => boolean;
};

export function createPacer({ track, stage, scrollTo, catchAtHero }: Opts) {
  const range = () => {
    const top = track.getBoundingClientRect().top + window.scrollY;
    return { top, len: Math.max(1, track.offsetHeight - window.innerHeight) };
  };
  const pNow = () => {
    const { top, len } = range();
    return (window.scrollY - top) / len;
  };
  let written = -1;
  const setP = (p: number) => {
    const { top, len } = range();
    written = Math.min(1, Math.max(0, p));
    scrollTo(top + written * len);
  };

  let moving = false, pos = 0, target = 0, last = 0, raf = 0, alive = true, free = false;
  const loop = (t: number) => {
    raf = 0;
    if (!alive || !moving) return;
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 1 / 60);
    last = t;
    const gap = target - pos;
    const v = vmax(pos) * dt;
    const step = Math.max(-v, Math.min(v, gap * (1 - Math.exp(-dt * 12))));
    pos = Math.abs(gap) < 0.0004 ? target : pos + step;
    setP(pos);
    if (pos === target) {
      moving = false;
      return;
    }
    raf = requestAnimationFrame(loop);
  };
  /** move the scene toward p; `free` lets a key step run more than LEAD ahead */
  const aim = (p: number, unbounded = false) => {
    if (!moving) {
      pos = Math.min(1, Math.max(0, pNow()));
      last = 0;
    }
    free = unbounded;
    target = Math.min(1, Math.max(0, free ? p : Math.min(pos + LEAD, Math.max(pos - LEAD, p))));
    moving = true;
    if (!raf) raf = requestAnimationFrame(loop);
  };
  const ahead = () => (moving ? target : Math.min(1, Math.max(0, pNow())));

  /** Should this input belong to the intro? Down: anywhere before the hero. Up: only from the hero's very top. */
  const owns = (dy: number) => {
    if (moving) return dy > 0 ? target < 1 || pos < 1 : true;
    const p = pNow();
    return dy > 0 ? p < 0.999 : p <= 1.002 && p > 0.0005;
  };

  // ---- wheel (mouse, trackpad) ----
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return; // pinch-zoom, sideways
    const dy = e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? window.innerHeight : 1);
    if (!dy || !owns(dy)) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // Lenis must not scroll this one
    const { len } = range();
    aim(ahead() + (dy / len) * GAIN);
  };

  // ---- touch: the scene follows the finger at the capped pace, a flick carries it a little further ----
  let touchY = -1, touchP = 0, samples: { y: number; t: number }[] = [];
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchY = e.touches[0].clientY;
    touchP = ahead();
    samples = [{ y: touchY, t: e.timeStamp }];
  };
  const onTouchMove = (e: TouchEvent) => {
    if (touchY < 0 || e.touches.length !== 1) return;
    const y = e.touches[0].clientY, { len } = range();
    const p = touchP + ((touchY - y) / len) * GAIN;
    // dragging down at the hero's top hands the gesture back to the page
    if (p >= 1 && pNow() >= 0.999 && !moving) return;
    if (e.cancelable) e.preventDefault(); // the intro moves only through the pacer
    samples.push({ y, t: e.timeStamp });
    if (samples.length > 6) samples.shift();
    aim(p);
    touchP += target - p; // the finger never banks a lead: wherever the scene is held back, the drag rebases there
  };
  const onTouchEnd = () => {
    if (touchY < 0) return;
    touchY = -1;
    const a = samples[0], b = samples[samples.length - 1];
    const v = a && b && b.t > a.t ? (a.y - b.y) / (b.t - a.t) : 0; // px per ms, + is down the page
    if (Math.abs(v) < 0.3) return;
    const { len } = range();
    aim(target + ((v * 220) / len) * GAIN); // momentum, still bounded by LEAD
  };

  // ---- keys: one beat per press ----
  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest?.("input, textarea, select, button, [contenteditable]")) return;
    const d = ["ArrowDown", "PageDown"].includes(e.key) || (e.key === " " && !e.shiftKey) ? 1 : ["ArrowUp", "PageUp"].includes(e.key) || (e.key === " " && e.shiftKey) ? -1 : 0;
    if (!d || !owns(d)) return;
    e.preventDefault();
    const p = ahead();
    const next = d > 0 ? BEATS.find((b) => b > p + 0.01) : [...BEATS].reverse().find((b) => b < p - 0.01);
    if (next !== undefined) aim(next, true);
  };

  // ---- smooth scroll coasting up from the page stops at the hero: the intro rewinds only on purpose ----
  let lastP = pNow();
  const onScroll = () => {
    const p = pNow(), was = lastP;
    lastP = p;
    if (!moving && was >= 1 && p < 1 && Math.abs(p - written) > 0.001 && catchAtHero?.()) {
      setP(1);
      lastP = 1;
    }
  };

  const prevTouchAction = stage.style.touchAction;
  stage.style.touchAction = "none";
  const wopt = { passive: false, capture: true } as const;
  window.addEventListener("wheel", onWheel, wopt);
  window.addEventListener("keydown", onKey);
  window.addEventListener("scroll", onScroll, { passive: true });
  stage.addEventListener("touchstart", onTouchStart, { passive: true });
  stage.addEventListener("touchmove", onTouchMove, { passive: false });
  stage.addEventListener("touchend", onTouchEnd);
  stage.addEventListener("touchcancel", onTouchEnd);

  return {
    /** stop moving (the skip button jumps straight to the hero) */
    halt() {
      moving = false;
      touchY = -1;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    dispose() {
      alive = false;
      this.halt();
      stage.style.touchAction = prevTouchAction;
      window.removeEventListener("wheel", onWheel, wopt);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove);
      stage.removeEventListener("touchend", onTouchEnd);
      stage.removeEventListener("touchcancel", onTouchEnd);
    },
  };
}
