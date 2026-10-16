"use client";

import { useEffect, useRef, type RefObject } from "react";
import { displayName } from "@/lib/card";
import { pullShares, type Folded } from "./traceModel";

/**
 * The sky behind the reading: a slow starfield plus one constellation per love, drawn from that seed's own id
 * (so your sky is yours and stable across replays). The constellations follow the reading: they draw in as a love
 * resolves, dim while it's pulled out for its leave-one-out call, and the strongest lights up at the critique.
 */

const TAU = Math.PI * 2;

/** Small deterministic PRNG (mulberry32) seeded from a string. */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = (h << 13) | (h >>> 19);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Figure {
  id: string;
  name: string;
  /** Star offsets in px around the figure's anchor, and the path through them. */
  stars: { x: number; y: number; m: number }[];
  edges: [number, number][];
  born: number;
  a: number;
}

/** 5–7 stars in a loose cluster, joined nearest-neighbour style, with one branch: reads as a constellation, not a polygon. */
function figureFor(id: string, size: number): Pick<Figure, "stars" | "edges"> {
  const r = rng(id);
  const k = 5 + Math.floor(r() * 3);
  const stars = Array.from({ length: k }, () => ({ x: (r() - 0.5) * size * 2, y: (r() - 0.5) * size * 1.4, m: 0.6 + r() * 0.9 }));
  const edges: [number, number][] = [];
  const used = new Set([0]);
  let cur = 0;
  while (used.size < k) {
    let best = -1;
    let bd = Infinity;
    for (let j = 0; j < k; j++) {
      if (used.has(j)) continue;
      const d = Math.hypot(stars[j].x - stars[cur].x, stars[j].y - stars[cur].y);
      if (d < bd) [best, bd] = [j, d];
    }
    // Branch once from an earlier star, so it isn't one long line.
    const from = used.size === Math.ceil(k / 2) ? Math.floor(r() * cur) : cur;
    edges.push([from, best]);
    used.add(best);
    cur = best;
  }
  return { stars, edges };
}

/**
 * `dim` scales the whole sky (the pack and story sit it further back). `drawn` skips the draw-in, for screens that
 * arrive with the reading already done. Figures are keyed on the love's display name, so the same love draws the
 * same constellation on every screen (reading, story, pack, /c, /vs).
 */
export function Sky({
  f,
  anchor,
  reduce,
  dim = 1,
  drawn = false,
  fixed = false,
}: {
  f: Folded;
  anchor?: RefObject<HTMLElement | null>;
  reduce: boolean;
  dim?: number;
  drawn?: boolean;
  /** Pin to the viewport (pages that scroll) instead of filling the parent. */
  fixed?: boolean;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const fRef = useRef(f);
  fRef.current = f;
  const dimRef = useRef(dim);
  dimRef.current = dim;
  const dimNow = useRef(dim);

  useEffect(() => {
    const canvas = cv.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const css = getComputedStyle(canvas);
    const col = (v: string, fb: string) => css.getPropertyValue(v).trim() || fb;
    const C = { ink: col("--ink", "#f3f1ec"), accent: col("--accent", "#c6ff3d"), m: col("--m", "#f472b6") };
    const serif = col("--font-serif", "Georgia, serif");

    let W = 0;
    let H = 0;
    let dpr = 1;
    let field: { x: number; y: number; s: number; p: number; v: number }[] = [];
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      // Density by area, capped: ~1 star per 4500px².
      const r = rng("tastrology-sky");
      field = Array.from({ length: Math.min(420, Math.round((W * H) / 4500)) }, () => ({
        x: r() * W,
        y: r() * H,
        s: r() < 0.9 ? 0.5 + r() * 0.8 : 1.3 + r() * 0.9,
        p: r() * TAU,
        v: 0.4 + r() * 1.4,
      }));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const figures = new Map<string, Figure>();
    const halo = document.createElement("canvas");
    halo.width = halo.height = 32;
    {
      const x = halo.getContext("2d")!;
      const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, "rgba(255,255,255,.9)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, 32, 32);
    }

    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t = (now - t0) / 1000;
      const st = fRef.current;
      dimNow.current += (dimRef.current - dimNow.current) * (reduce ? 1 : 0.05);
      const D = dimNow.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Starfield: slow drift and twinkle (frozen for reduced motion).
      const drift = reduce ? 0 : t * 4;
      ctx.fillStyle = C.ink;
      for (const s of field) {
        const tw = reduce ? 0.6 : 0.35 + 0.35 * Math.sin(t * s.v + s.p);
        ctx.globalAlpha = tw * (s.s > 1.2 ? 0.9 : 0.55) * Math.min(1, 0.4 + D * 0.6);
        const x = (s.x + drift * (s.s / 2)) % W;
        ctx.fillRect(x, s.y, s.s, s.s);
      }

      // Constellations: one per resolved love, parked around the well in its seed's direction.
      const box = anchor?.current?.getBoundingClientRect();
      const host = canvas.getBoundingClientRect();
      const cx = box ? box.left - host.left + box.width / 2 : W / 2;
      const cy = box ? box.top - host.top + box.height / 2 : H / 2;
      const wellR = box ? box.width / 2 : Math.min(W, H) / 3;
      const n = st.seeds.length;
      const real = st.seeds.filter((x) => !x.id.startsWith("pending-"));
      const current = st.last === "ablation" ? st.ablated[st.ablated.length - 1] : undefined;
      const sideB = new Set(st.sides[1] ?? []);
      const inert = new Set(st.critique?.inert ?? []);
      const strongest = st.critique ? pullShares(st).top : undefined;
      const size = Math.max(46, Math.min(110, Math.min(W, H) * 0.09));

      const keyOf = (name: string) => displayName(name).toLowerCase();
      for (const s of real) {
        const k = keyOf(s.name);
        if (!figures.has(k)) figures.set(k, { id: k, name: displayName(s.name), ...figureFor(k, size), born: drawn ? now - 5000 : now, a: 0 });
      }
      real.forEach((s) => {
        const fig = figures.get(keyOf(s.name))!;
        const i = st.seeds.indexOf(s);
        const ang = -Math.PI / 2 + (TAU * i) / Math.max(1, n);
        // Out past the well, kept on screen.
        const d = wellR + size * 1.9;
        // Stay in the well's own column (on desktop the trace panel owns the right side).
        const maxX = Math.min(W, 2 * cx) - size * 1.2;
        const ax = Math.min(maxX, Math.max(size * 1.2, cx + Math.cos(ang) * d * 1.25));
        const ay = Math.min(H - size, Math.max(size, cy + Math.sin(ang) * d));
        const tone = st.critique && s.id === strongest ? C.accent : sideB.has(s.id) ? C.m : C.ink;
        const target = s.id === current ? 0.25 : inert.has(s.id) ? 0.35 : st.critique && s.id === strongest ? 1 : 0.7;
        // Phones: the well fills the width, so the sky stays texture (softer, no names) instead of competing with it.
        const narrow = W < 640;
        fig.a += ((narrow ? target * 0.5 : target) * D - fig.a) * (reduce ? 1 : 0.06);
        // Lines draw in over ~1.6s after the love resolves.
        const grow = reduce ? 1 : Math.min(1, (now - fig.born) / 1600);
        const sway = reduce ? 0 : Math.sin(t * 0.3 + i) * 3;

        ctx.strokeStyle = tone;
        ctx.lineWidth = tone === C.ink ? 0.8 : 1.2;
        fig.edges.forEach(([a, b], e) => {
          const seg = Math.max(0, Math.min(1, grow * fig.edges.length - e));
          if (seg <= 0) return;
          const p = fig.stars[a];
          const q = fig.stars[b];
          ctx.globalAlpha = fig.a * 0.45;
          ctx.beginPath();
          ctx.moveTo(ax + p.x, ay + p.y + sway);
          ctx.lineTo(ax + p.x + (q.x - p.x) * seg, ay + p.y + sway + (q.y - p.y) * seg);
          ctx.stroke();
        });
        fig.stars.forEach((p, k) => {
          const on = Math.min(1, grow * fig.stars.length - k + 1);
          if (on <= 0) return;
          const tw = reduce ? 1 : 0.75 + 0.25 * Math.sin(t * 1.7 + k * 1.3 + i);
          const r = (1.2 + p.m * 1.4) * (tone === C.accent ? 1.25 : 1);
          ctx.globalAlpha = fig.a * on * tw * 0.5;
          ctx.drawImage(halo, ax + p.x - r * 4, ay + p.y + sway - r * 4, r * 8, r * 8);
          ctx.globalAlpha = fig.a * on * tw;
          ctx.fillStyle = tone;
          ctx.beginPath();
          ctx.arc(ax + p.x, ay + p.y + sway, r, 0, TAU);
          ctx.fill();
        });
        // Name, like a star chart.
        if (narrow) return;
        ctx.globalAlpha = fig.a * grow * 0.55;
        ctx.fillStyle = tone;
        ctx.font = `italic ${Math.round(Math.max(13, size * 0.2))}px ${serif}`;
        ctx.textAlign = "center";
        const low = fig.stars.reduce((m, p) => Math.max(m, p.y), 0);
        ctx.fillText(fig.name.length > 26 ? `${fig.name.slice(0, 25)}…` : fig.name, ax, ay + low + sway + 22);
      });
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [anchor, reduce, drawn]);

  return <canvas ref={cv} className={`pointer-events-none ${fixed ? "fixed" : "absolute"} inset-0 h-full w-full`} aria-hidden />;
}
