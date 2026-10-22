"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ScratchReveal } from "@/components/deck/ScratchReveal";
import { displayName, proxied } from "@/lib/card";
import type { Snap, SnapBrand } from "@/lib/receipt";
import { sfx } from "@/lib/sound";

const img = (u?: string) => (u ? (u.startsWith("/") ? u : proxied(u)) : undefined);

type Love = Snap["loves"][number];
type Cam = { x: number; y: number; k: number };
type Anim = { kind: "in" | "out" | "warp"; t0: number; dur: number; from: Cam; to: Cam; star: number };
type Streak = { a: number; z: number; r: number };

/** Where the focused star sits on screen, as a share of the stage height. */
const CY = 0.44;
/** Orbits: radii as shares of the stage width, tilts in degrees, and how flat the ellipses are. */
const ORBIT = { r: [0.22, 0.29, 0.36, 0.43], tilt: [-14, -9, -12, -7], squash: 0.32 };
const ZOOM_IN = 720;
const ZOOM_OUT = 620;
const WARP = 340;
const OVERVIEW: Cam = { x: 50, y: 45, k: 1 };

const rnd = (i: number, n: number) => (((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3.4);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/** One burning star: white core, a cool corona with a breath of lime, four soft diffraction spikes. */
function starSprite(i: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const cor = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  cor.addColorStop(0, "rgb(255 255 255 / 1)");
  cor.addColorStop(0.07, "rgb(255 255 255 / .95)");
  cor.addColorStop(0.18, "rgb(233 240 255 / .38)");
  cor.addColorStop(0.45, "rgb(198 255 61 / .07)");
  cor.addColorStop(1, "rgb(0 0 0 / 0)");
  g.fillStyle = cor;
  g.fillRect(0, 0, 128, 128);
  g.translate(64, 64);
  g.rotate((i * 12 * Math.PI) / 180);
  for (let k = 0; k < 4; k++) {
    g.rotate(Math.PI / 2);
    const sp = g.createLinearGradient(0, 0, 60, 0);
    sp.addColorStop(0, "rgb(255 255 255 / .3)");
    sp.addColorStop(1, "rgb(255 255 255 / 0)");
    g.fillStyle = sp;
    g.beginPath();
    g.moveTo(0, -1.2);
    g.lineTo(60, 0);
    g.lineTo(0, 1.2);
    g.fill();
  }
  return c;
}

/**
 * The brands as a sky (docs/design/brand-return-ui.md). It opens on the whole constellation: your loves as white
 * stars, burning. Touch one and the camera dives in; the brands it pulled come out as planets on tilted orbits,
 * passing in front of the star and behind it, sealed in foil until you scratch them. From there a link either side
 * jumps to the next star at lightspeed, or "All stars" pulls back out. One canvas draws the sky; stars and planets are
 * real buttons laid over it, moved each frame without React.
 */
export function PulledSky({
  header,
  loves,
  onSel,
  brandsOf,
  decoded,
  onDecode,
  onScratched,
}: {
  header: ReactNode;
  loves: Love[];
  onSel: (id: string) => void;
  brandsOf: Record<string, SnapBrand[]>;
  decoded: Set<string>;
  onDecode: (b: SnapBrand) => void;
  onScratched: (b: SnapBrand) => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const n = loves.length;
  const wrap = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const starEls = useRef<(HTMLButtonElement | null)[]>([]);
  const planetEls = useRef<(HTMLDivElement | null)[]>([]);
  const halo = useRef<HTMLImageElement>(null);

  const [focus, setFocus] = useState<number | null>(null);
  const [phase, setPhase] = useState<"overview" | "moving" | "zoomed">("overview");
  const [stage, setStage] = useState<SnapBrand | null>(null);
  const [auto, setAuto] = useState(0);
  const [live, setLive] = useState("");

  // World: x 14..86 with a gentle zigzag in y. The dive goes deep enough that the neighbours drop off screen.
  const world = loves.map((l, i) => ({ x: n === 1 ? 50 : 14 + (72 * i) / (n - 1), y: 50 + Math.sin(i * 2.1 + 0.7) * 18 }));
  const kz = n > 1 ? clamp(110 / (72 / (n - 1)), 3, 8) : 3;
  const camAt = (i: number): Cam => ({ x: world[i].x, y: world[i].y, k: kz });

  const at = focus != null ? loves[focus] : null;
  const brands = at ? (brandsOf[at.id] ?? []) : [];

  // Everything the frame loop reads lives in one ref.
  const S = useRef({
    W: 0,
    H: 0,
    dpr: 1,
    cam: { ...OVERVIEW },
    anim: null as Anim | null,
    focus: null as number | null,
    sprites: [] as HTMLCanvasElement[],
    haloSrc: [] as string[],
    haloFor: -1,
    dust: null as HTMLCanvasElement | null,
    streaks: [] as Streak[],
    warpDir: 1,
    clock: 0,
    orbitT: 0,
    orbitV: 1,
    hover: false,
    planetsAt: -1e9,
    planetsOut: false,
    count: 0,
    done: [] as boolean[],
    staged: null as string | null,
    visible: true,
    raf: 0,
    last: 0,
    reduce: false,
  });
  useEffect(() => {
    const s = S.current;
    s.reduce = reduce;
    s.count = brands.length;
    s.staged = stage?.id ?? null;
    s.done = loves.map((l) => {
      const bs = brandsOf[l.id] ?? [];
      return bs.length > 0 && bs.every((b) => decoded.has(b.id));
    });
  });

  const toScreen = (wx: number, wy: number, cam: Cam) => {
    const s = S.current;
    return { x: (wx - cam.x) * cam.k * (s.W / 100) + s.W / 2, y: (wy - cam.y) * cam.k * (s.H / 100) + s.H * CY };
  };

  /** Paint one frame. */
  const draw = (now: number) => {
    const s = S.current;
    const c = cvs.current;
    const g = c?.getContext("2d");
    if (!c || !g || !s.W) return;
    const dt = Math.min(100, s.last ? now - s.last : 16);
    s.last = now;
    s.clock += dt / 1000;
    const W = s.W;
    const H = s.H;

    // camera
    const a = s.anim;
    let warpE = -1;
    if (a) {
      const e = clamp((now - a.t0) / a.dur);
      if (a.kind === "warp") {
        warpE = e;
        const pre = e < 0.5;
        const base = pre ? a.from : a.to;
        const k = pre ? kz * (1 + 0.1 * easeInOut(e / 0.5)) : kz * (1.06 - 0.06 * easeOut((e - 0.5) / 0.5));
        s.cam = { x: base.x, y: base.y, k };
      } else {
        // the star travels a straight line on screen while zoom moves in log space: no swinging arc
        const ee = a.kind === "in" ? easeOut(e) : easeInOut(e);
        const st = world[a.star];
        const p0 = toScreen(st.x, st.y, a.from);
        const p1 = toScreen(st.x, st.y, a.to);
        const k = a.from.k * Math.pow(a.to.k / a.from.k, ee);
        const px = p0.x + (p1.x - p0.x) * ee;
        const py = p0.y + (p1.y - p0.y) * ee;
        s.cam = { x: st.x - (px - W / 2) / (k * (W / 100)), y: st.y - (py - H * CY) / (k * (H / 100)), k };
      }
      if (e >= 1) {
        s.anim = null;
        if (a.kind === "out") {
          s.focus = null;
          s.cam = { ...OVERVIEW };
          setPhase("overview");
        } else setPhase("zoomed");
      }
    }
    const cam = s.cam;
    g.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    // dust: one baked layer drawn twice at different parallax
    if (s.dust) {
      const ox = -(cam.x - 50) * (W / 100);
      const oy = -(cam.y - 50) * (H / 100);
      g.drawImage(s.dust, ox * 0.15 - W * 0.2, oy * 0.15 - H * 0.2, W * 1.4, H * 1.4);
      g.globalAlpha = 0.55;
      g.drawImage(s.dust, ox * 0.35 - W * 0.07, oy * 0.35 - H * 0.33, W * 1.4, H * 1.4);
      g.globalAlpha = 1;
    }

    // 0 in the overview, 1 at a star
    const depth = clamp(Math.log(cam.k) / Math.log(kz) || 0);
    const pts = world.map((w) => toScreen(w.x, w.y, cam));
    g.strokeStyle = `rgb(233 240 255 / ${0.18 * (1 - depth) + 0.04})`;
    g.lineWidth = 1;
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.stroke();

    // stars, burning (additive, so overlapping coronas bloom)
    const intoStar = a?.kind === "in" ? (now - a.t0) / a.dur > 0.6 : !a;
    const haloOn = s.focus != null && a?.kind !== "warp" && a?.kind !== "out" && intoStar;
    g.globalCompositeOperation = "lighter";
    pts.forEach((p, i) => {
      const f = s.reduce ? 1 : 1 + 0.06 * Math.sin(s.clock * 2.3 + i) + 0.04 * Math.sin(s.clock * 5.1 + 2 * i) + 0.03 * rnd(i, Math.floor(s.clock * 12));
      const size = 38 * Math.pow(cam.k, 0.62) * f;
      const el = starEls.current[i];
      if (el) el.style.transform = `translate3d(${p.x - 22}px, ${p.y - 22}px, 0)`;
      if (haloOn && i === s.focus) {
        const h = halo.current;
        if (h) {
          if (s.haloFor !== i && s.haloSrc[i]) {
            h.src = s.haloSrc[i];
            s.haloFor = i;
          }
          h.style.width = h.style.height = `${size}px`;
          h.style.transform = `translate3d(${p.x - size / 2}px, ${p.y - size / 2}px, 0)`;
        }
        return;
      }
      if (p.x < -size || p.x > W + size || p.y < -size || p.y > H + size) return;
      if (s.sprites[i]) g.drawImage(s.sprites[i], p.x - size / 2, p.y - size / 2, size, size);
    });
    if (halo.current) halo.current.style.opacity = haloOn ? "1" : "0";
    g.globalCompositeOperation = "source-over";

    // the invite: one star at a time breathes a ring, in the overview
    if (depth < 0.05 && !a && n) {
      const inv = Math.floor(s.clock / 1.6) % n;
      const ph = (s.clock % 1.6) / 1.6;
      g.strokeStyle = `rgb(233 240 255 / ${s.reduce ? 0.3 : 0.5 * (1 - ph)})`;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(pts[inv].x, pts[inv].y, s.reduce ? 16 : 6 + 22 * ph, 0, Math.PI * 2);
      g.stroke();
    }
    // a star whose planets are all decoded wears a thin lime ring
    pts.forEach((p, i) => {
      if (!s.done[i]) return;
      g.strokeStyle = "rgb(198 255 61 / .55)";
      g.lineWidth = 1;
      g.beginPath();
      g.arc(p.x, p.y, 13 * Math.pow(cam.k, 0.5), 0, Math.PI * 2);
      g.stroke();
    });

    // lightspeed: streaks from a vanishing point a little toward where you're going, three trailing segments each
    if (warpE >= 0 && !s.reduce) {
      const ms = warpE * WARP;
      const len = ms < 110 ? 90 * Math.pow(ms / 110, 2) : ms < 230 ? 90 : 90 * (1 - (ms - 230) / 110);
      const vx = W / 2 + s.warpDir * W * 0.16;
      const vy = H * CY;
      g.globalCompositeOperation = "lighter";
      const far = Math.max(W, H) * 0.75;
      for (const st of s.streaks) {
        const r0 = (st.r + ms * 0.9 * st.z) % far;
        const cx = Math.cos(st.a);
        const cy = Math.sin(st.a);
        g.lineWidth = 0.6 + 1.6 * st.z;
        for (let k = 0; k < 3; k++) {
          g.strokeStyle = `rgb(233 240 255 / ${(0.55 - k * 0.17) * st.z})`;
          const a0 = r0 + (len * st.z * k) / 3;
          const a1 = r0 + (len * st.z * (k + 1)) / 3;
          g.beginPath();
          g.moveTo(vx + cx * a0, vy + cy * a0);
          g.lineTo(vx + cx * a1, vy + cy * a1);
          g.stroke();
        }
      }
      if (ms > 110 && ms < 230) {
        const v = g.createRadialGradient(W / 2, H * CY, 0, W / 2, H * CY, Math.max(W, H) * 0.7);
        v.addColorStop(0, "rgb(255 255 255 / 0.18)");
        v.addColorStop(1, "rgb(255 255 255 / 0)");
        g.fillStyle = v;
        g.fillRect(0, 0, W, H);
      }
      g.globalCompositeOperation = "source-over";
    }

    // planets: orbits ease to a stop while you hover one or scratch
    s.orbitV += ((s.hover || s.staged ? 0 : 1) - s.orbitV) * Math.min(1, dt / 200);
    if (!s.reduce) s.orbitT += (dt / 1000) * s.orbitV;
    const fp = s.focus != null ? pts[s.focus] : null;
    for (let i = 0; i < 4; i++) {
      const el = planetEls.current[i];
      if (!el) continue;
      if (!fp || !s.planetsOut || warpE >= 0 || a?.kind === "out" || i >= s.count) {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        continue;
      }
      const grow = s.reduce ? 1 : clamp((now - s.planetsAt - i * 70) / 520);
      // a little spring as they fly out to their orbit
      const sp = grow < 1 ? 1 - Math.pow(1 - grow, 3) * Math.cos(grow * 4) : 1;
      const r = ORBIT.r[i] * W * sp;
      const ry = r * ORBIT.squash;
      const tilt = (ORBIT.tilt[i] * Math.PI) / 180;
      const th = s.reduce ? 0.5 + (i * 2.2) / Math.max(1, s.count) : (i * Math.PI * 2) / s.count + (s.orbitT * Math.PI * 2) / (28 + 6 * i);
      const ex = r * Math.cos(th);
      const ey = ry * Math.sin(th);
      const x = fp.x + ex * Math.cos(tilt) - ey * Math.sin(tilt);
      const y = fp.y + ex * Math.sin(tilt) + ey * Math.cos(tilt);
      const d = Math.sin(th); // >0: the near side of the orbit
      const staged = el.dataset.id === s.staged;
      const sc = staged ? 1.25 : (0.72 + (0.28 * (d + 1)) / 2) * (0.6 + 0.4 * grow);
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${sc})`;
      el.style.opacity = String(grow * (s.staged && !staged ? 0.3 : 1));
      el.style.filter = `brightness(${staged ? 1 : 0.55 + (0.45 * (d + 1)) / 2})`;
      el.style.zIndex = d > 0 || staged ? "22" : "12";
      el.style.pointerEvents = grow > 0.5 ? "auto" : "none";
    }
  };

  // the loop: runs while the sky is on screen and the tab is visible
  const loop = (now: number) => {
    const s = S.current;
    s.raf = 0;
    if (!s.visible || document.hidden) return;
    draw(now);
    s.raf = requestAnimationFrame(loop);
  };
  const wake = () => {
    const s = S.current;
    if (!s.raf && s.visible && !document.hidden) {
      s.last = 0;
      s.raf = requestAnimationFrame(loop);
    }
  };

  // size, sprites, dust; pause off screen
  useEffect(() => {
    const el = wrap.current;
    const c = cvs.current;
    if (!el || !c) return;
    const s = S.current;
    s.sprites = loves.map((_, i) => starSprite(i));
    s.haloSrc = s.sprites.map((sp) => {
      try {
        return sp.toDataURL();
      } catch {
        return "";
      }
    });
    s.haloFor = -1;
    const fit = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (!W || !H) return;
      const cores = navigator.hardwareConcurrency || 8;
      const dpr = Math.min(cores <= 4 ? 1.5 : 1.75, window.devicePixelRatio || 1);
      s.W = W;
      s.H = H;
      s.dpr = dpr;
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      const d = document.createElement("canvas");
      d.width = Math.round(W * 1.4);
      d.height = Math.round(H * 1.4);
      const dg = d.getContext("2d")!;
      for (let i = 0; i < 140; i++) {
        dg.fillStyle = `rgb(255 255 255 / ${0.15 + rnd(i, 4) * 0.5})`;
        const z = rnd(i, 3) < 0.12 ? 1.6 : 1;
        dg.fillRect(rnd(i, 1) * d.width, rnd(i, 2) * d.height, z, z);
      }
      s.dust = d;
      draw(performance.now());
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => {
      s.visible = e.isIntersecting;
      if (s.visible) wake();
    });
    io.observe(el);
    const vis = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", vis);
    wake();
    return () => {
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
      cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps

  const announce = (i: number) => setLive(`Now at ${displayName(loves[i]?.name ?? "")}`);

  const zoomTo = (i: number) => {
    const s = S.current;
    if (s.anim || (s.focus === i && phase === "zoomed")) return;
    setStage(null);
    s.focus = i;
    setFocus(i);
    onSel(loves[i].id);
    announce(i);
    s.planetsOut = true;
    if (reduce) {
      s.cam = camAt(i);
      s.planetsAt = performance.now();
      setPhase("zoomed");
      return;
    }
    s.anim = { kind: "in", t0: performance.now(), dur: ZOOM_IN, from: { ...s.cam }, to: camAt(i), star: i };
    s.planetsAt = performance.now() + ZOOM_IN * 0.6;
    setPhase("moving");
    sfx("shimmer", { gain: 0.45 });
    (brandsOf[loves[i].id] ?? []).forEach((_, k) => setTimeout(() => sfx("ripple", { i: k + 1, gain: 0.5 }), ZOOM_IN * 0.6 + k * 70));
    wake();
  };

  const zoomOut = () => {
    const s = S.current;
    if (s.anim || s.focus == null) return;
    setStage(null);
    s.planetsOut = false;
    setLive("All stars");
    if (reduce) {
      s.cam = { ...OVERVIEW };
      s.focus = null;
      setFocus(null);
      setPhase("overview");
      return;
    }
    s.anim = { kind: "out", t0: performance.now(), dur: ZOOM_OUT, from: { ...s.cam }, to: { ...OVERVIEW }, star: s.focus };
    setPhase("moving");
    sfx("recede");
    wake();
  };

  const jump = (dir: number) => {
    const s = S.current;
    if (s.anim || s.focus == null || n < 2) return;
    setStage(null);
    const next = (s.focus + dir + n) % n;
    onSel(loves[next].id);
    announce(next);
    if (reduce) {
      s.cam = camAt(next);
      s.focus = next;
      setFocus(next);
      s.planetsAt = performance.now();
      return;
    }
    s.streaks = Array.from({ length: 160 }, (_, i) => ({ a: rnd(i, 9) * Math.PI * 2, z: 0.05 + rnd(i, 10) * 0.95, r: 20 + rnd(i, 11) * Math.max(s.W, s.H) * 0.6 }));
    s.warpDir = dir;
    s.anim = { kind: "warp", t0: performance.now(), dur: WARP, from: { ...s.cam }, to: camAt(next), star: s.focus };
    // the jump happens mid-streak, when the screen is all light
    setTimeout(() => {
      s.focus = next;
      setFocus(next);
    }, WARP / 2);
    s.planetsAt = performance.now() + WARP;
    setPhase("moving");
    sfx("warp");
    wake();
  };

  const tapPlanet = (b: SnapBrand) => {
    if (decoded.has(b.id)) return onDecode(b);
    if (stage) return;
    sfx("tick", { i: 3 });
    setStage(b);
  };

  // swipe sideways between stars on touch screens
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const left = brands.filter((b) => !decoded.has(b.id)).length;
  const prev = focus != null && n > 1 ? loves[(focus - 1 + n) % n] : null;
  const next = focus != null && n > 1 ? loves[(focus + 1) % n] : null;
  const zoomed = phase === "zoomed" && focus != null;
  const share = (b: SnapBrand) => (at ? (b.explain[at.id] ?? 0) : 0);

  return (
    <div
      ref={wrap}
      tabIndex={0}
      aria-label="Your taste as a sky. Touch a star to see what it pulled in."
      className="relative -mx-5 -mt-5 h-[clamp(460px,70svh,600px)] touch-pan-y select-none overflow-clip outline-none sm:-mx-8"
      style={{ background: "radial-gradient(90% 70% at 50% 40%, #15102a 0%, #0a0912 60%, var(--card,#0d0d12) 100%)" }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          if (stage) setStage(null);
          else zoomOut();
        } else if (e.key === "ArrowRight") jump(1);
        else if (e.key === "ArrowLeft") jump(-1);
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse") swipe.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s0 = swipe.current;
        swipe.current = null;
        if (!s0 || stage || focus == null) return;
        const dx = e.clientX - s0.x;
        if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(e.clientY - s0.y)) jump(dx < 0 ? 1 : -1);
      }}
    >
      <canvas ref={cvs} aria-hidden className="absolute inset-0 h-full w-full" />
      {/* the focused star, lifted above the planets passing behind it */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={halo} alt="" aria-hidden className="pointer-events-none absolute left-0 top-0 z-[16] max-w-none opacity-0 mix-blend-screen" />

      <div className="absolute inset-x-5 top-5 z-40 sm:inset-x-8">{header}</div>

      {/* stars: real buttons, moved by the frame loop */}
      {loves.map((l, i) => {
        const bs = brandsOf[l.id] ?? [];
        return (
          <button
            key={l.id}
            ref={(el) => {
              starEls.current[i] = el;
            }}
            type="button"
            aria-label={`${displayName(l.name)}: ${bs.length} planets, ${bs.filter((b) => !decoded.has(b.id)).length} sealed`}
            onClick={() => zoomTo(i)}
            className="absolute left-0 top-0 z-20 h-11 w-11 rounded-full"
            style={{ pointerEvents: phase === "overview" ? "auto" : "none" }}
          >
            <span
              className={`pointer-events-none absolute left-1/2 top-[calc(100%+2px)] -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2 transition-opacity duration-300 ${phase === "overview" ? "opacity-100" : "opacity-0"}`}
            >
              {displayName(l.name).slice(0, 18)}
            </span>
          </button>
        );
      })}

      {/* planets: the focused star's brands */}
      {brands.slice(0, 4).map((b, i) => {
        const open = decoded.has(b.id);
        const size = Math.round(34 + 14 * clamp(share(b) * 2));
        return (
          <div
            key={`${at?.id}-${b.id}`}
            ref={(el) => {
              planetEls.current[i] = el;
            }}
            data-id={b.id}
            className="absolute left-0 top-0 opacity-0"
            style={{ willChange: "transform, opacity" }}
          >
            <button
              type="button"
              onClick={() => tapPlanet(b)}
              onPointerEnter={() => (S.current.hover = true)}
              onPointerLeave={() => (S.current.hover = false)}
              aria-label={open ? `${b.name}, decoded` : `Sealed planet ${i + 1}: scratch it open`}
              className="grid place-items-center rounded-full transition-transform hover:scale-110"
              style={{ width: size, height: size }}
            >
              {open ? (
                b.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img(b.image)} alt="" draggable={false} className="h-full w-full rounded-full bg-white object-cover shadow-[0_0_0_1.5px_rgba(198,255,61,.8),0_0_18px_rgba(198,255,61,.35)]" />
                ) : (
                  <span className="grid h-full w-full place-items-center rounded-full bg-paper-2 font-display text-lg font-bold shadow-[0_0_0_1.5px_rgba(198,255,61,.8)]">{b.name[0]}</span>
                )
              ) : (
                <span
                  className={`block h-full w-full rounded-full ${reduce ? "" : "[animation:spin_9s_linear_infinite]"}`}
                  style={{
                    background: "conic-gradient(from 0deg, #8d9099, #e7e9ee, #9a9ea8, #f4f5f8, #7f838c, #d9dce3, #8d9099)",
                    boxShadow: "0 0 0 1px rgb(198 255 61 / .5), inset 0 -4px 8px rgb(0 0 0 / .35), 0 0 14px rgb(198 255 61 / .15)",
                  }}
                />
              )}
            </button>
          </div>
        );
      })}

      {/* the focused star's name */}
      <div
        className={`pointer-events-none absolute inset-x-0 z-30 text-center transition-opacity duration-500 ${zoomed && !stage ? "opacity-100" : "opacity-0"}`}
        style={{ top: `calc(${CY * 100}% + ${Math.round(19 * Math.pow(kz, 0.62)) + 6}px)` }}
      >
        <p className="mx-auto max-w-[80%] truncate font-serif text-[26px] italic leading-tight text-ink">{at ? displayName(at.name) : ""}</p>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3">
          {brands.length ? `${brands.length} planet${brands.length === 1 ? "" : "s"} · ${brands.length - left} decoded` : "Quiet star · nothing in orbit"}
        </p>
      </div>

      {/* the scratch plate */}
      <div className="absolute inset-x-5 bottom-[64px] z-30">
        <AnimatePresence mode="wait">
          {stage && (
            <motion.div
              key={stage.id}
              className="rounded-2xl border border-white/10 bg-black/60 px-4 py-2 backdrop-blur-md"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <ScratchReveal
                    name={stage.name}
                    image={img(stage.image)}
                    loveId={at?.id ?? ""}
                    brandId={stage.id}
                    strength={Math.min(1, share(stage) * 2)}
                    reduce={reduce}
                    autoRun={auto}
                    onDone={() => {
                      onScratched(stage);
                      setTimeout(() => setStage((s) => (s?.id === stage.id ? null : s)), 700);
                    }}
                  />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5 pt-2">
                  <button type="button" onClick={() => setAuto((k) => k + 1)} className="rounded-full border border-accent/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-accent hover:bg-accent hover:text-paper">
                    Auto
                  </button>
                  <button type="button" onClick={() => setStage(null)} className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3 hover:text-ink">
                    Later
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* bottom: the hint in the overview; at a star, the links either side and "All stars" */}
      <div className="absolute inset-x-0 bottom-0 z-30 flex h-14 items-center justify-between gap-2 px-4">
        {zoomed ? (
          <>
            <button type="button" disabled={!prev} onClick={() => jump(-1)} className="max-w-[38%] truncate rounded-full bg-black/55 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2 backdrop-blur hover:text-ink disabled:opacity-0">
              ‹ {prev ? displayName(prev.name).slice(0, 16) : ""}
            </button>
            <button type="button" onClick={zoomOut} className="shrink-0 rounded-full border border-line bg-black/55 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink backdrop-blur hover:border-accent">
              All stars
            </button>
            <button type="button" disabled={!next} onClick={() => jump(1)} className="max-w-[38%] truncate rounded-full bg-black/55 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2 backdrop-blur hover:text-ink disabled:opacity-0">
              {next ? displayName(next.name).slice(0, 16) : ""} ›
            </button>
          </>
        ) : (
          <p className={`w-full text-center font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3 transition-opacity ${phase === "overview" ? "opacity-100" : "opacity-0"}`}>Touch a star</p>
        )}
      </div>
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16" style={{ background: "linear-gradient(to bottom, transparent, var(--card,#0d0d12))" }} />
      <p aria-live="polite" className="sr-only">
        {live}
      </p>
    </div>
  );
}
