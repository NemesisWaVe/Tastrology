"use client";

import { useLenis } from "lenis/react";
import { useReducedMotion, useScroll } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/sound";
import { enableSound, soundOn } from "@/lib/soundEngine";
import { createMirror, SKY_AR, type Mirror, type SkyView, type Touch } from "./mirror";
import { PERSONAS } from "@/lib/personas";
import { buildWord, CARD_AR, drawDrops, drawStars, type Rect, type Word } from "./stars";
import s from "./intro.module.css";

const KEY = "tastrology:intro";
const CAPTIONS = ["everything you love leaves a ripple", "the sky has been keeping track", "…and it writes you a sign"];
const POSTER_P = 0.86; // reduced motion: the written card over the sky
const IMPACT = 0.95; // seconds into the drop clip when it hits

const sst = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Real persona loves, interleaved so neighbouring drops differ. */
const LOVES = (() => {
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

function serifFamily(): string {
  try {
    return getComputedStyle(document.body).getPropertyValue("--nf-serif").trim() || "Georgia, serif";
  } catch {
    return "Georgia, serif";
  }
}

/** Where the camera looks for scroll progress p. Water first, then the horizon slides off and Scorpius fills the frame. */
function viewAt(p: number, w: number, h: number, par = { x: 0, y: 0 }): SkyView {
  const phone = w < 768;
  const look = sst(0.1, 0.5, p);
  const ww = phone ? 0.27 : Math.min(0.82, 0.62 / ((h / w) * SKY_AR));
  const wh = ww * (h / w) * SKY_AR;
  const hz0 = phone ? 0.5 : 0.47;
  const hz = lerp(hz0, 1.3, look);
  const vA = 0.6 - hz0 * wh; // the Milky Way's core sits just above the waterline
  const vB = 0.36 - 0.5 * wh; // Scorpius centred
  const vTop = Math.min(1 - wh, Math.max(0, lerp(vA, vB, look)));
  const cx = lerp(0.5, phone ? 0.61 : 0.56, look);
  const pcx = cx + par.x * ww * 0.03, pv = Math.min(1 - wh, Math.max(0, vTop + par.y * wh * 0.025));
  return { cx: Math.min(1 - ww / 2, Math.max(ww / 2, pcx)), vTop: pv, ww, wh, hz };
}

function birthRect(w: number, h: number): Rect {
  const phone = w < 768;
  let cw = phone ? w * 0.74 : h * 0.62 * CARD_AR;
  let ch = cw / CARD_AR;
  if (ch > h * 0.7) {
    ch = h * 0.7;
    cw = ch * CARD_AR;
  }
  return { x: (w - cw) / 2, y: h * 0.46 - ch / 2, w: cw, h: ch };
}

/** The hero card's rect, in stage coordinates at the moment the intro ends (p = 1). */
function dockRect(stageH: number): Rect | null {
  const host = document.getElementById("hero-card");
  const sec = host?.closest("section");
  if (!host || !sec) return null;
  const el = host.querySelector<HTMLElement>("[data-dock] > * > :nth-child(2)") ?? host;
  const r = el.getBoundingClientRect(), sr = sec.getBoundingClientRect();
  if (!r.width) return null;
  const h = Math.abs(r.width / r.height - CARD_AR) > 0.08 ? r.width / CARD_AR : r.height;
  return { x: r.left, y: r.top - sr.top + (window.innerHeight - stageH), w: r.width, h };
}
const lerpRect = (a: Rect, b: Rect, k: number): Rect => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) });

/**
 * "The Mirror": a real drop lands in a night lake whose water is the real Milky Way, mirrored;
 * the camera looks up, the real constellations draw themselves, and the stars write the card that docks into the Hero.
 */
export function Intro({ onActive }: { onActive?: (active: boolean) => void }) {
  const track = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const vidRef = useRef<HTMLVideoElement>(null);
  const capRef = useRef<(HTMLSpanElement | null)[]>([]);
  const cueRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<((withSound: boolean) => void) | null>(null);
  const reduce = Boolean(useReducedMotion());
  const [gate, setGate] = useState<"hidden" | "open" | "closing">("hidden");
  const gateOpen = useRef(false);
  useEffect(() => {
    gateOpen.current = gate === "open";
    document.documentElement.toggleAttribute("data-gate", gate === "open"); // the sound orb steps aside while the gate asks
  }, [gate]);
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
    setGate("hidden"); // never leave the gate over the hero
    startRef.current?.(false);
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const y = r.top + window.scrollY + r.height - window.innerHeight;
    const l = lenisRef.current;
    if (l) l.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
  }, []);

  const closeGate = useCallback(() => {
    setGate((g) => (g === "open" ? "closing" : g));
    setTimeout(() => setGate("hidden"), 700);
  }, []);
  const choose = useCallback(
    (withSound: boolean) => {
      closeGate();
      if (withSound) {
        enableSound(true);
        setTimeout(() => sfx("drop"), 60); // the scene is already playing: answer the click with a drop
      }
      startRef.current?.(withSound);
    },
    [closeGate],
  );

  useEffect(() => {
    const st = stage.current, fx = fxRef.current, glc = glRef.current, vid = vidRef.current;
    const ctx = fx?.getContext("2d");
    if (!st || !fx || !glc || !ctx || !vid) return;
    const root = document.documentElement;
    const mono = getComputedStyle(document.body).getPropertyValue("--nf-mono").trim() || "ui-monospace, monospace";
    const serif = serifFamily();
    let w = 0, h = 0, phone = false, alive = true;
    let word: Word | null = null;
    vid.src = window.innerWidth < 768 ? "/intro/drop-480.mp4" : "/intro/drop-720.mp4";
    const mirror: Mirror | null = createMirror(glc, "/intro/sky.webp", vid);
    if (!mirror) {
      // no WebGL: the still sky photo stands in for the lake
      glc.style.display = "none";
      const bg = st.firstElementChild as HTMLElement | null;
      if (bg) bg.style.background = "#020204 url(/intro/sky.webp) center 30% / cover no-repeat";
    }

    // ---- visitor ripples on the water ----
    const touches: Touch[] = [];
    const parT = { x: 0, y: 0 }, par = { x: 0, y: 0 };
    const taps: { x: number; y: number; t: number }[] = []; // the visitor's own constellations
    let loveI = 0, autoDrops = 0, userDropped = false;
    // six shader slots: cursor ripples give way before named drops
    const trim = () => {
      while (touches.length > 6) {
        let i = touches.length - 1;
        while (i >= 0 && touches[i].name) i--;
        touches.splice(i >= 0 ? i : touches.length - 1, 1);
      }
    };
    let lastT = { x: -999, y: -999, t: 0 };
    const clock = () => performance.now() / 1000;
    let lastTap = -1;
    const onPointer = (e: PointerEvent | MouseEvent) => {
      if (!w) return;
      const r = st.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      parT.x = (x / w - 0.5) * 2;
      parT.y = (y / h - 0.5) * 2;
      if (y < viewAt(scrollYProgress.get(), w, h).hz * h + 6) return;
      const now = clock(), down = e.type === "pointerdown" || e.type === "click";
      if (!down && (Math.hypot(x - lastT.x, y - lastT.y) < 70 || now - lastT.t < 0.22)) return;
      lastT = { x, y, t: now };
      if (down) {
        if (now - lastTap < 0.3) return; // pointerdown and click are the same tap
        lastTap = now;
        userDropped = true;
        taps.push({ x, y, t: now });
        if (taps.length > 6) taps.shift();
      }
      touches.unshift(down ? { x, y, t: now, amp: 1.5, name: LOVES[loveI++ % LOVES.length], user: true } : { x, y, t: now, amp: 0.6 });
      trim();
      if (down) sfx("ripple", { i: (touches.length * 2) % 7, gain: 0.6 });
    };
    st.addEventListener("pointermove", onPointer, { passive: true });
    st.addEventListener("pointerdown", onPointer, { passive: true });
    st.addEventListener("click", onPointer, { passive: true });

    // ---- timeline ----
    let started = -1; // clock() when the drop started
    const t0 = clock();
    const start = (withSound: boolean) => {
      if (started > 0) return;
      if (withSound) enableSound(true);
      started = clock();
      try {
        vid.currentTime = 0;
      } catch {
        /* not loaded yet */
      }
      void vid.play().catch(() => {});
    };
    startRef.current = start;

    const frame = (p: number) => {
      const now = clock(), t = now - t0, since = started > 0 ? now - started : -1;
      par.x += (parT.x - par.x) * 0.04;
      par.y += (parT.y - par.y) * 0.04;
      const view = viewAt(p, w, h, par);
      // after the first drop, more fall, each one a real love; they stop once we look up
      const due = [IMPACT + 1.8, IMPACT + 2.7, IMPACT + 3.6, IMPACT + 4.7, IMPACT + 5.9];
      if (since > 0 && autoDrops < due.length && since >= due[autoDrops] && p < 0.2) {
        const H = view.hz * h, side = autoDrops % 2 ? 1 : -1;
        const x = w * (0.5 + side * (0.12 + 0.18 * ((autoDrops * 0.37) % 1))), y = H + (h - H) * (0.25 + 0.4 * ((autoDrops * 0.61) % 1));
        touches.unshift({ x, y, t: now, amp: 1.5, name: LOVES[loveI++ % LOVES.length] });
        taps.push({ x, y, t: now }); // the demo drops show what a tap does
        if (taps.length > 6) taps.shift();
        trim();
        autoDrops++;
        sfx("ripple", { i: autoDrops % 7, gain: 0.5 });
      }
      const fade = started > 0 ? sst(0, 0.9, since + 0.3) : 0.35 * sst(0, 1.5, t);
      mirror?.draw({ view, t, fade, dropAmt: 1 - sst(0.05, 0.35, p) * 0.6, touches, now, impact: since >= IMPACT ? since - IMPACT : -1 });
      const bgO = String(reduce ? 1 : 1 - sst(0.9, 0.985, p));
      glc.style.opacity = bgO;
      (st.firstElementChild as HTMLElement | null)?.style.setProperty("opacity", bgO); // the backdrop must clear for the hero
      st.querySelector<HTMLElement>(`.${s.credit}`)?.style.setProperty("opacity", bgO);
      const birth = birthRect(w, h);
      const k = sst(0.9, 1, p);
      const dock = k > 0 ? dockRect(h) : null;
      drawStars(ctx, word, {
        w, h, t, view, mono, phone,
        twinkle: sst(0, 1, since + 0.5),
        cons: sst(0.36, 0.66, p),
        consDim: sst(0.62, 0.76, p),
        frame: sst(0.6, 0.8, p),
        word: sst(0.66, 0.88, p),
        fade: 1 - sst(0.95, 1, p),
        card: dock ? lerpRect(birth, dock, k) : birth,
      });
      while (taps.length && now - taps[0].t > 5.2) taps.shift();
      drawDrops(ctx, touches, now, view.hz * h, mono, phone, 1 - sst(0.15, 0.3, p), taps);
      root.style.setProperty("--intro-dock", reduce ? "1" : sst(0.95, 1, p).toFixed(3));
    };
    const paintNow = () => {
      if (w) frame(reduce ? POSTER_P : scrollYProgress.get());
    };

    const resize = () => {
      const cw = st.clientWidth, ch = st.clientHeight;
      if (!cw || !ch) return;
      phone = cw < 768;
      const cap = Math.min(window.devicePixelRatio || 1, phone ? 2 : 1.75);
      if (cw === w && Math.abs(ch - h) < 2 && fx.width === Math.round(cw * cap)) return;
      w = cw;
      h = ch;
      fx.width = Math.round(w * cap);
      fx.height = Math.round(h * cap);
      ctx.setTransform(cap, 0, 0, cap, 0, 0);
      mirror?.resize(w, h, Math.min(cap, Math.sqrt(3.2e6 / (w * h))));
      paintNow();
    };

    let activeOn: boolean | null = null;
    const setUi = (p: number, since: number, auto: boolean) => {
      const c = reduce
        ? [0, 0, 1 - sst(0.1, 0.4, p)]
        : [sst(IMPACT + 0.6, IMPACT + 1.3, since) * (1 - sst(0.12, 0.2, p)), sst(0.44, 0.5, p) * (1 - sst(0.6, 0.66, p)), sst(0.78, 0.82, p) * (1 - sst(0.88, 0.91, p))];
      capRef.current.forEach((el, i) => {
        if (!el) return;
        el.style.opacity = c[i].toFixed(3);
        el.style.transform = `translateY(${((1 - c[i]) * 6).toFixed(2)}px)`;
      });
      if (hintRef.current) hintRef.current.style.opacity = userDropped || reduce || since < 0 || gateOpen.current ? "0" : String(sst(IMPACT + 0.2, IMPACT + 0.8, since) * (1 - sst(0.06, 0.12, p)));
      if (cueRef.current) cueRef.current.style.opacity = auto || reduce || since < 0 ? "0" : String(sst(2.4, 3, since) * (1 - sst(0.01, 0.04, p)));
      const end = reduce ? 0.6 : 0.94;
      if (skipRef.current) {
        skipRef.current.style.opacity = String(1 - sst(end - 0.05, end, p));
        skipRef.current.style.pointerEvents = p < end ? "auto" : "none";
      }
      st.style.pointerEvents = p < end ? "auto" : "none";
      if (reduce) st.style.opacity = String(1 - sst(0.35, 0.95, p));
      const on = p < end;
      if (on !== activeOn) activeRef.current?.((activeOn = on));
      if (p > 0.95) store.set();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(st);
    window.addEventListener("resize", resize);
    root.style.setProperty("--intro-dock", reduce ? "1" : "0");

    document.fonts?.ready
      .then(() => document.fonts.load(`italic 200px ${serif}`))
      .catch(() => null)
      .then(() => {
        if (!alive) return;
        word = buildWord(serif, window.innerWidth < 768 ? 90 : 130);
        paintNow();
      });

    const cleanup = () => {
      alive = false;
      ro.disconnect();
      window.removeEventListener("resize", resize);
      st.removeEventListener("pointermove", onPointer);
      st.removeEventListener("pointerdown", onPointer);
      st.removeEventListener("click", onPointer);
      mirror?.dispose();
      vid.pause();
      root.style.removeProperty("--intro-dock");
    };

    // Reduced motion: one still frame; scroll only crossfades it away.
    if (reduce) {
      started = clock() - 10;
      setUi(scrollYProgress.get(), 10, false);
      const off = scrollYProgress.on("change", (p) => setUi(p, 10, false));
      const iv = setInterval(paintNow, 400); // repaint while the sky texture and font arrive
      const stop = setTimeout(() => clearInterval(iv), 5000);
      return () => {
        off();
        clearInterval(iv);
        clearTimeout(stop);
        cleanup();
      };
    }

    // First visit: the gate (sound or quiet). Returning visitors: no gate, the beats auto-advance to the hero.
    let auto = false; // never scroll on the visitor's behalf
    const returning = store.get() && window.scrollY < 10;
    // a reload leaves audio locked until a click/tap/key (a wheel scroll doesn't count), so anyone who wants sound
    // gets the gate again: one click enters and unlocks. Quiet returners skip it.
    if (returning) start(soundOn());
    else if (window.scrollY < 10) start(soundOn()); // no gate: the corner sound orb invites sound without interrupting
    else start(false);
    const stopAuto = () => {
      if (!auto) return;
      auto = false;
      skip();
    };
    // scroll sounds only after the visitor actually scrolls (a restored scroll position on reload is not a gesture)
    let moved = false;
    const onInput = () => {
      moved = true;
      stopAuto();
    };
    const inputs = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    inputs.forEach((e) => window.addEventListener(e, onInput, { passive: true }));

    let raf = 0, visible = true, idle = false, playedImpact = false, prevP = -1;
    const tick = () => {
      raf = 0;
      let p = scrollYProgress.get();
      // scrolling past the gate counts as "quietly"
      if (p > 0.01 && started < 0) {
        closeGate();
        start(false);
      }
      const since = started > 0 ? clock() - started : -1;
      if (auto && since >= 0) {
        const v = sst(0, 1, (since - 2.4) / 2.8);
        p = Math.max(p, v);
        if (v >= 1) {
          auto = false;
          skip();
        }
      }
      if (!playedImpact && since >= IMPACT) {
        playedImpact = true;
        sfx("drop");
      }
      if (moved && prevP >= 0 && p > prevP && p - prevP < 0.08) {
        const cross = (x: number) => prevP < x && p >= x;
        if (cross(0.3)) sfx("shimmer");
        if (cross(0.45)) sfx("ripple", { i: 0 });
        if (cross(0.55)) sfx("ripple", { i: 2 });
        [0.7, 0.74, 0.78, 0.82].forEach((x, i) => cross(x) && sfx("ripple", { i: 3 + i }));
        if (cross(0.86)) sfx("form");
      }
      const now = clock();
      while (touches.length && now - touches[touches.length - 1].t > (touches[touches.length - 1].user ? 5.2 : 4)) touches.pop();
      const settled = p >= 0.999 && prevP >= 0.999 && touches.length === 0;
      try {
        if (!settled || !idle) frame(p);
      } catch {
        /* one bad frame must never stop the loop */
      }
      idle = settled;
      setUi(p, since, auto);
      prevP = p;
      if (visible && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const run = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (!visible) vid.pause();
      run();
    });
    if (track.current) io.observe(track.current);
    document.addEventListener("visibilitychange", run);
    run();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", run);
      inputs.forEach((e) => window.removeEventListener(e, onInput));
      cleanup();
    };
  }, [reduce, scrollYProgress, skip, closeGate]);

  return (
    <section ref={track} className={`${s.track} ${reduce ? s.still : ""}`} aria-label="Intro">
      <div ref={stage} className={s.stage}>
        <div className={s.bg} aria-hidden />
        <canvas ref={glRef} className={s.gl} aria-hidden />
        <canvas ref={fxRef} className={s.fx} aria-hidden />
        <video ref={vidRef} className={s.vid} muted playsInline preload="auto" aria-hidden />
        <p className={s.caps}>
          {CAPTIONS.map((c, i) => (
            <span key={c} ref={(el) => void (capRef.current[i] = el)} className={s.cap}>
              {c}
            </span>
          ))}
        </p>
        <div ref={hintRef} className={s.hint} aria-hidden>
          <svg viewBox="0 0 40 40" width="34" height="34">
            <path d="M8 6 C 14 18, 22 24, 32 30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 4" />
            <path d="M24 31 L32 30 L30 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>tap the water · make your own constellation</span>
        </div>
        <div ref={cueRef} className={s.cue} aria-hidden>
          scroll
          <i />
        </div>
        <button ref={skipRef} type="button" onClick={skip} className={s.skip}>
          skip intro
        </button>
        <p className={s.credit}>sky: ESO/S. Brunier</p>
        {gate !== "hidden" && (
          <div className={`${s.gate} ${gate === "closing" ? s.gateOut : ""}`}>
            <p className={s.gateKicker}>best with sound</p>
            <div className={s.gateRow}>
              <button type="button" className={s.gateMain} onClick={() => choose(true)}>
                Enter with sound
              </button>
              <button type="button" className={s.gateAlt} onClick={() => choose(false)}>
                Enter quietly
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
