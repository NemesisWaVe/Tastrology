"use client";

import { useLenis } from "lenis/react";
import { useReducedMotion, useScroll } from "motion/react";
import { useCallback, useEffect, useRef } from "react";
import { PERSONAS } from "@/lib/personas";
import { sfx } from "@/lib/sound";
import { birthRect, buildScene, buildTargets, draw, ringState, sstep, type Rect, type Scene } from "./scene";
import { CARD_AR, serifFamily } from "./starText";
import { createWater, type Water } from "./water";
import s from "./intro.module.css";

const KEY = "tastrology:intro";
const CAPTIONS = ["everything you love leaves a ripple", "…and the sky keeps track.", "…and it writes you a sign."];
const POSTER_P = 0.83; // reduced motion: the formed card over the sky

/** Real persona loves, interleaved across personas so neighbouring rings differ. */
const NAMES = (() => {
  const out: string[] = [];
  for (let j = 0; j < 5; j++) for (const p of PERSONAS) if (p.seeds[j]) out.push(p.seeds[j].name);
  return out;
})();

const store = {
  get: () => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  },
  set: () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private mode */
    }
  },
};

/** The hero card's rect, in stage coordinates at the moment the intro ends (p = 1). */
function dockRect(stageH: number): Rect | null {
  const host = document.getElementById("hero-card");
  const sec = host?.closest("section");
  if (!host || !sec) return null;
  // Specimen = [status line, card, …]; fall back to the whole column if that ever changes
  const el = host.querySelector<HTMLElement>("[data-dock] > * > :nth-child(2)") ?? host;
  const r = el.getBoundingClientRect(), sr = sec.getBoundingClientRect();
  if (!r.width) return null;
  const h = Math.abs(r.width / r.height - CARD_AR) > 0.08 ? r.width / CARD_AR : r.height;
  return { x: r.left, y: r.top - sr.top + (window.innerHeight - stageH), w: r.width, h };
}

const lerpRect = (a: Rect, b: Rect, k: number): Rect => ({
  x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k,
});

/**
 * "The Mirror": a drop hits a dark pond, loves ride the ripples, the reflection resolves into
 * constellations, the camera looks up, and the stars write the card that docks into the Hero.
 */
export function Intro({ onActive }: { onActive?: (active: boolean) => void }) {
  const track = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const capRef = useRef<(HTMLSpanElement | null)[]>([]);
  const cueRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const reduce = Boolean(useReducedMotion());
  const lenis = useLenis();
  const lenisRef = useRef(lenis);
  const activeRef = useRef(onActive);
  useEffect(() => {
    lenisRef.current = lenis;
    activeRef.current = onActive;
  });
  const { scrollYProgress } = useScroll({ target: track, offset: ["start start", "end end"] });

  const skip = useCallback(() => {
    store.set();
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const y = r.top + window.scrollY + r.height - window.innerHeight;
    const l = lenisRef.current;
    if (l) l.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
  }, []);

  useEffect(() => {
    const st = stage.current, fx = fxRef.current, glc = glRef.current;
    const ctx = fx?.getContext("2d");
    if (!st || !fx || !glc || !ctx) return;
    const root = document.documentElement;
    const water: Water | null = createWater(glc);
    if (!water) glc.style.display = "none";
    const mono = getComputedStyle(document.body).getPropertyValue("--nf-mono").trim() || "ui-monospace, monospace";
    const serif = serifFamily();
    let scene: Scene | null = null;
    let fontsOk = false;
    let alive = true;

    const resize = () => {
      const w = st.clientWidth, h = st.clientHeight;
      if (!w || !h) return;
      const phone = w < 768;
      const cap = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2);
      // a DPR change (window moved to another monitor) needs new buffers even at the same CSS size
      if (scene && scene.w === w && Math.abs(scene.h - h) < 2 && fx.width === Math.round(w * cap)) return;
      fx.width = Math.round(w * cap);
      fx.height = Math.round(h * cap);
      ctx.setTransform(cap, 0, 0, cap, 0, 0);
      // the shader is per-pixel: also keep its pixel count sane on big screens
      const gcap = Math.min(cap, Math.sqrt(2.6e6 / (w * h)));
      water?.resize(Math.round(w * gcap), Math.round(h * gcap));
      scene = buildScene(w, h, NAMES, mono);
      if (fontsOk) buildTargets(scene, serif);
      // resizing a canvas clears it: repaint now, rAF may be throttled (hidden pane, emulation switch)
      if (reduce) paint(POSTER_P, 3, 6);
      else if (frame.t > 0) paint(frame.p, frame.t, frame.cold);
    };

    const frame = { p: 0, t: 0, cold: 0, pitch: 0, calm: 0, card: { x: 0, y: 0, w: 0, h: 0 }, gl: !!water, bg: 1, fade: 1 };
    let lastDock = "";
    const paint = (p: number, t: number, cold: number) => {
      const sc = scene;
      if (!sc) return;
      const calm = sstep(0.3, 0.45, p);
      const pitch = sc.p0 + (sc.p1 - sc.p0) * sstep(0.52, 0.72, p);
      const bg = reduce ? 1 : 1 - sstep(0.91, 0.99, p);
      const fade = reduce ? 1 : sstep(0, 0.8, cold);
      const birth = birthRect(sc);
      // beat 4 holds the centred card from ~0.81 to 0.90, then docks, finishing exactly at the track end
      const k = sstep(0.9, 1, p);
      const dock = k > 0 ? dockRect(sc.h) : null;
      ringState(sc, p, cold, calm);
      Object.assign(frame, { p, t, cold, pitch, calm, bg, fade, card: dock ? lerpRect(birth, dock, k) : birth });
      water?.draw({
        t, pitch, tanH: sc.tanH, fade, calm, gal: sstep(0.3, 0.5, p), look: sstep(0.52, 0.72, p),
        rings: sc.ringBuf, g1: sc.g1, g2: sc.g2,
      });
      draw(ctx, sc, frame);
      const o = String(bg);
      glc.style.opacity = o;
      if (bgRef.current) bgRef.current.style.opacity = o;
      const d = reduce ? "1" : sstep(0.97, 1, p).toFixed(3);
      if (d !== lastDock) root.style.setProperty("--intro-dock", (lastDock = d));
    };

    const setUi = (p: number, t: number, auto: boolean) => {
      const c = reduce
        ? [0, 0, 1 - sstep(0.1, 0.4, p)]
        : [
            sstep(1, 1.5, t) * (1 - sstep(0.24, 0.3, p)),
            sstep(0.32, 0.38, p) * (1 - sstep(0.66, 0.72, p)),
            sstep(0.77, 0.81, p) * (1 - sstep(0.88, 0.91, p)),
          ];
      capRef.current.forEach((el, i) => {
        if (!el) return;
        el.style.opacity = c[i].toFixed(3);
        el.style.transform = `translateY(${((1 - c[i]) * 6).toFixed(2)}px)`;
      });
      if (cueRef.current) cueRef.current.style.opacity = auto || reduce ? "0" : String(sstep(1.4, 1.9, t) * (1 - sstep(0.01, 0.04, p)));
      const end = reduce ? 0.6 : 0.94;
      if (skipRef.current) {
        skipRef.current.style.opacity = String(1 - sstep(end - 0.05, end, p));
        skipRef.current.style.pointerEvents = p < end ? "auto" : "none";
      }
      st.style.pointerEvents = p < end ? "auto" : "none";
      if (reduce) st.style.opacity = String(1 - sstep(0.35, 0.95, p));
      const on = p < end;
      if (on !== activeOn) activeRef.current?.((activeOn = on));
      if (p > 0.95) store.set();
    };
    let activeOn: boolean | null = null;

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(st);
    window.addEventListener("resize", resize);
    root.style.setProperty("--intro-dock", reduce ? "1" : "0");

    document.fonts?.ready
      .then(() => document.fonts.load(`italic 190px ${serif}`))
      .catch(() => null)
      .then(() => {
        if (!alive) return;
        fontsOk = true;
        if (scene) buildTargets(scene, serif);
        if (reduce) paint(POSTER_P, 3, 6);
      });

    // Reduced motion: one still frame; scroll only crossfades it away.
    if (reduce) {
      paint(POSTER_P, 3, 6);
      setUi(scrollYProgress.get(), 3, false);
      const off = scrollYProgress.on("change", (p) => setUi(p, 3, false));
      return () => {
        alive = false;
        off();
        ro.disconnect();
      window.removeEventListener("resize", resize);
        water?.dispose();
        root.style.removeProperty("--intro-dock");
      };
    }

    // Returning visitors: the cold open plays, then the beats auto-advance (~2.5s) and we land on the hero.
    let auto = store.get() && window.scrollY < 10;
    const stopAuto = () => {
      if (!auto) return;
      auto = false;
      skip();
    };
    const inputs = ["wheel", "touchstart", "keydown"] as const;
    inputs.forEach((e) => window.addEventListener(e, stopAuto, { passive: true }));

    const start = performance.now();
    let raf = 0, prevP = -1, prevT = 0, visible = true, idle = false;
    const tick = (now: number) => {
      raf = 0;
      const t = (now - start) / 1000;
      let p = scrollYProgress.get();
      if (auto) {
        const v = sstep(0, 1, (t - 0.9) / 2.6);
        p = Math.max(p, v);
        if (v >= 1) {
          auto = false;
          skip();
        }
      }
      const sc = scene;
      // sound: forward crossings only, and not when skipping across many beats at once
      if (sc && prevP >= 0 && p > prevP && p - prevP < 0.08) {
        sc.rings.forEach((g, k) => {
          if (k === 0) return;
          if (prevP < g.p && p >= g.p) sfx("drop");
          if (prevP < g.p + 0.05 && p >= g.p + 0.05) sfx("ripple", { i: k - 1 });
        });
        if (prevP < 0.56 && p >= 0.56) sfx("shimmer");
        if (prevP < 0.8 && p >= 0.8) sfx("form");
      }
      if (prevT < 0.95 && t >= 0.95 && p < 0.1) sfx("drop");
      // once fully docked, nothing moves: stop painting until the visitor scrolls back
      const settled = p >= 0.999 && prevP >= 0.999;
      try {
        if (!settled || !idle) paint(p, t, t);
      } catch {
        /* one bad frame must never stop the loop */
      }
      idle = settled;
      setUi(p, t, auto);
      prevP = p;
      prevT = t;
      if (visible && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const run = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      run();
    });
    if (track.current) io.observe(track.current);
    document.addEventListener("visibilitychange", run);
    run();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", run);
      inputs.forEach((e) => window.removeEventListener(e, stopAuto));
      water?.dispose();
      root.style.removeProperty("--intro-dock");
    };
  }, [reduce, scrollYProgress, skip]);

  return (
    <section ref={track} className={`${s.track} ${reduce ? s.still : ""}`} aria-label="Intro">
      <div ref={stage} className={s.stage}>
        <div ref={bgRef} className={s.bg} aria-hidden />
        <canvas ref={glRef} className={s.gl} aria-hidden />
        <canvas ref={fxRef} className={s.fx} aria-hidden />
        <p className={s.caps}>
          {CAPTIONS.map((c, i) => (
            <span key={c} ref={(el) => void (capRef.current[i] = el)} className={s.cap}>
              {c}
            </span>
          ))}
        </p>
        <div ref={cueRef} className={s.cue} aria-hidden>
          scroll
          <i />
        </div>
        <button ref={skipRef} type="button" onClick={skip} className={s.skip}>
          skip intro
        </button>
      </div>
    </section>
  );
}
