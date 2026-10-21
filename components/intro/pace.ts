/**
 * Paced scrolling for the intro. The intro is scrubbed by scroll, so one hard flick (or a spun wheel) used to carry the
 * whole story off screen in a fraction of a second. Instead the intro rests on a few beats, and every gesture moves
 * at most one beat: a drag or slow wheel scrubs toward the next beat, and once it commits the page glides there at a
 * fixed pace, then holds a moment. Input during a glide or the hold is swallowed, so spamming just walks the beats.
 * Past the last beat (the hero) scrolling is the page's own again.
 */

export const BEATS = [0, 0.58, 0.8, 1];
const COMMIT = 0.14; // share of the segment a gesture must cover to move on
const SPEED = 0.42; // progress per second during a glide
const HOLD = 0.35; // seconds a beat holds before the next gesture counts

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

type Opts = {
  track: HTMLElement;
  stage: HTMLElement;
  /** writes the page's scroll position (through Lenis when it is driving the page) */
  scrollTo: (y: number) => void;
  /** smooth wheel scrolling (Lenis) coasts on after the wheel stops: catch it at the hero instead of deep in the intro */
  catchAtHero?: () => boolean;
};

export function createPacer({ track, stage, scrollTo, catchAtHero }: Opts) {
  const clock = () => performance.now() / 1000;
  const range = () => {
    const top = track.getBoundingClientRect().top + window.scrollY;
    return { top, len: Math.max(1, track.offsetHeight - window.innerHeight) };
  };
  const pNow = () => {
    const { top, len } = range();
    return (window.scrollY - top) / len;
  };
  const setP = (p: number) => {
    const { top, len } = range();
    scrollTo(top + Math.min(1, Math.max(0, p)) * len);
  };
  const nearest = (p: number) => BEATS.reduce((b, x, i) => (Math.abs(x - p) < Math.abs(BEATS[b] - p) ? i : b), 0);

  let mode: "idle" | "scrub" | "glide" = "idle";
  let anchor = 0; // beat index the current gesture starts from
  let pos = 0, scrubTo = 0;
  let from = 0, to = 0, t0 = 0, dur = 0; // glide
  let holdUntil = 0, stale = false, raf = 0, alive = true;

  const loop = () => {
    raf = 0;
    if (!alive) return;
    if (mode === "glide") {
      const k = Math.min(1, (clock() - t0) / dur);
      pos = from + (to - from) * easeInOut(k);
      setP(pos);
      if (k >= 1) {
        mode = "idle";
        anchor = nearest(to);
        holdUntil = clock() + HOLD;
        stale = true; // a trackpad's inertia tail is still arriving: it must not count as the next gesture
        return;
      }
    } else if (mode === "scrub") {
      pos += (scrubTo - pos) * 0.22;
      setP(pos);
    } else return;
    raf = requestAnimationFrame(loop);
  };
  const run = () => {
    if (!raf) raf = requestAnimationFrame(loop);
  };

  const glide = (i: number) => {
    const target = BEATS[Math.max(0, Math.min(BEATS.length - 1, i))];
    from = mode === "idle" ? pNow() : pos;
    to = target;
    dur = Math.min(1.4, Math.max(0.5, Math.abs(to - from) / SPEED));
    t0 = clock();
    mode = "glide";
    run();
  };
  const busy = () => mode === "glide" || clock() < holdUntil;
  /** seg: the span between the anchor beat and its neighbour in direction d */
  const seg = (d: number) => Math.abs((BEATS[anchor + d] ?? BEATS[anchor]) - BEATS[anchor]) || 1;
  const begin = () => {
    if (mode !== "idle") return;
    pos = pNow();
    anchor = nearest(pos);
    setP(pos); // freezes any smooth scroll still in flight
  };

  /** Should this input belong to the intro? Down: anywhere before the hero. Up: only from the hero's very top. */
  const owns = (dy: number) => {
    if (mode !== "idle") return true;
    const p = pNow();
    return dy > 0 ? p < 0.999 : p <= 1.002 && p > 0.0005;
  };

  // ---- wheel (mouse, trackpad) ----
  let acc = 0, lastWheel = 0, lastMag = 0, idleT = 0;
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return; // pinch-zoom, sideways
    const dy = e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? window.innerHeight : 1);
    if (!dy || !owns(dy)) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // Lenis must not scroll this one
    const now = clock(), gap = now - lastWheel, mag = Math.abs(dy);
    lastWheel = now;
    if (stale && (gap > 0.12 || mag > lastMag * 1.4 || now > holdUntil + 0.9)) stale = false;
    lastMag = mag;
    if (busy() || stale) return;
    begin();
    const d = Math.sign(dy);
    if (BEATS[anchor + d] === undefined) return;
    if (mode === "idle" || Math.sign(acc) !== d) acc = 0;
    acc += dy;
    const { len } = range();
    const share = Math.abs(acc) / len / seg(d);
    if (share >= COMMIT) {
      acc = 0;
      glide(anchor + d);
      return;
    }
    // below the commit point the wheel previews the next beat; let go and it eases back
    mode = "scrub";
    scrubTo = Math.min(1, Math.max(0, BEATS[anchor] + (acc / len) * 1.6));
    run();
    clearTimeout(idleT);
    idleT = window.setTimeout(() => {
      if (mode === "scrub") {
        acc = 0;
        glide(anchor);
      }
    }, 180);
  };

  // ---- touch: the stage follows the finger, a flick or a long enough drag moves on ----
  let touchY = -1, touchP = 0, samples: { y: number; t: number }[] = [];
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchY = -1;
    if (busy()) return;
    begin();
    touchY = e.touches[0].clientY;
    touchP = pNow();
    samples = [{ y: touchY, t: clock() }];
  };
  const onTouchMove = (e: TouchEvent) => {
    if (e.cancelable) e.preventDefault(); // the intro moves only through the pacer
    if (touchY < 0 || e.touches.length !== 1) return;
    const y = e.touches[0].clientY, { len } = range();
    samples.push({ y, t: clock() });
    if (samples.length > 6) samples.shift();
    const lo = BEATS[Math.max(0, anchor - 1)], hi = BEATS[Math.min(BEATS.length - 1, anchor + 1)];
    pos = Math.min(hi, Math.max(lo, touchP + (touchY - y) / len));
    mode = "scrub";
    scrubTo = pos;
    setP(pos);
  };
  const onTouchEnd = () => {
    if (touchY < 0) return;
    touchY = -1;
    if (mode !== "scrub") return;
    const a = samples[0], b = samples[samples.length - 1];
    const v = a && b && b.t > a.t ? (a.y - b.y) / (b.t - a.t) : 0; // px per second, + is down the page
    const disp = pos - BEATS[anchor], d = Math.sign(disp) || Math.sign(v);
    const go = d !== 0 && BEATS[anchor + d] !== undefined && (Math.abs(disp) / seg(d) > COMMIT || v * d > 350);
    glide(go ? anchor + d : anchor);
  };

  // ---- keys ----
  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest("input, textarea, select, button, [contenteditable]")) return;
    const d = ["ArrowDown", "PageDown"].includes(e.key) || (e.key === " " && !e.shiftKey) ? 1 : ["ArrowUp", "PageUp"].includes(e.key) || (e.key === " " && e.shiftKey) ? -1 : 0;
    if (!d || !owns(d)) return;
    e.preventDefault();
    if (busy()) return;
    begin();
    if (BEATS[anchor + d] !== undefined) glide(anchor + d);
  };

  // ---- a scroll that came to rest between beats (scrolling up from the page, a restored position) settles ----
  let fingers = 0, settleT = 0, lastP = pNow();
  const onFinger = (e: TouchEvent) => void (fingers = e.touches.length);
  const onScroll = () => {
    const p = pNow(), was = lastP;
    lastP = p;
    if (mode === "idle" && was >= 1 && p < 1 && catchAtHero?.()) {
      setP(1);
      lastP = 1;
      anchor = BEATS.length - 1;
      holdUntil = clock() + HOLD;
      stale = true;
      return;
    }
    clearTimeout(settleT);
    settleT = window.setTimeout(() => {
      if (mode !== "idle" || fingers) return;
      const p = pNow();
      if (p <= 0 || p >= 1) return;
      const i = nearest(p);
      if (Math.abs(BEATS[i] - p) > 0.003) glide(i);
    }, 200);
  };

  const prevTouchAction = stage.style.touchAction;
  stage.style.touchAction = "none";
  const wopt = { passive: false, capture: true } as const;
  window.addEventListener("wheel", onWheel, wopt);
  window.addEventListener("keydown", onKey);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("touchstart", onFinger, { passive: true });
  window.addEventListener("touchend", onFinger, { passive: true });
  window.addEventListener("touchcancel", onFinger, { passive: true });
  stage.addEventListener("touchstart", onTouchStart, { passive: true });
  stage.addEventListener("touchmove", onTouchMove, { passive: false });
  stage.addEventListener("touchend", onTouchEnd);
  stage.addEventListener("touchcancel", onTouchEnd);

  return {
    /** stop gliding (the skip button jumps straight to the hero) */
    halt() {
      mode = "idle";
      holdUntil = 0;
      stale = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    dispose() {
      alive = false;
      this.halt();
      clearTimeout(idleT);
      clearTimeout(settleT);
      stage.style.touchAction = prevTouchAction;
      window.removeEventListener("wheel", onWheel, wopt);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchstart", onFinger);
      window.removeEventListener("touchend", onFinger);
      window.removeEventListener("touchcancel", onFinger);
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove);
      stage.removeEventListener("touchend", onTouchEnd);
      stage.removeEventListener("touchcancel", onTouchEnd);
    },
  };
}
