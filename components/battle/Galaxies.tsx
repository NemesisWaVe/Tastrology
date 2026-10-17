"use client";

import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { rng, TAU } from "@/components/reveal/skyFigures";
import type { Side } from "@/lib/battle";
import type { CardData } from "@/lib/card";
import { sfx } from "@/lib/sound";
import g from "./galaxy.module.css";

/**
 * Each fighter's galaxy, on one canvas. The galaxy is seeded from the card (serial, archetype), tinted with the
 * card's own type colours, wound tighter the rarer the card, and carries the card's constellation (card.stars, the
 * same figure as the art window). Galaxies ride their cards in, collide at the lens, trade star streams each round,
 * and at the end the winner pulls the loser's stars in. Reduced motion draws one composed still of the end state.
 */

export interface GalaxySide {
  card: CardData;
  side: Side;
  /** The element the galaxy sits behind (the card). */
  anchor: RefObject<HTMLElement | null>;
  /** Side colour, used for the energy streams. */
  colour: string;
}

/** What the fight is doing right now. phase: 0 intro, 1-4 rounds, 5 slam, 6 result. */
export interface Beat {
  phase: number;
  rounds: (Side | "tie")[];
  winner: Side | "tie";
}

/** When the cards meet, ms after mount. Card entry and the lens are timed to it. */
export const IMPACT_MS = 1450;
/** A round's stream leaves the winner at +250ms and lands at +1100ms, with the card shake. */
const ARC_DELAY = 250;
const ARC_FLY = 850;

type RGB = [number, number, number];
const WHITE: RGB = [255, 255, 255];
const WARM: RGB = [255, 236, 214];

let probe: CanvasRenderingContext2D | null = null;
/** Any CSS colour (hex, hsl()) to RGB, via the canvas parser. */
function rgbOf(c: string): RGB {
  probe ??= document.createElement("canvas").getContext("2d");
  if (!probe) return [198, 255, 61];
  probe.fillStyle = "#000";
  probe.fillStyle = c;
  const v = String(probe.fillStyle);
  if (v.startsWith("#")) {
    const n = parseInt(v.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = v.match(/[\d.]+/g);
  return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : [198, 255, 61];
}
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const mix = (p: RGB, q: RGB, t: number): RGB => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];

interface Gal {
  seed: string;
  arms: number;
  twist: number;
  tilt: number;
  pa: number;
  dir: number;
  bar: boolean;
  sparkle: boolean;
  tint: RGB;
  tint2: RGB;
  side: RGB;
  /** card.stars in disc units (-0.6..0.6), left to right like the art window. */
  stars: { x: number; y: number; w: number }[];
}

function galaxyOf(s: GalaxySide): Gal {
  const c = s.card;
  const seed = `${c.serial}|${c.archetype}`;
  const r = rng(`galaxy:${seed}`);
  const mirror = s.side === "a" ? 1 : -1;
  return {
    seed,
    arms: 2 + ((c.domains || 0) % 3),
    twist: 2.2 + ((c.rarityScore || 0) / 100) * 2.8,
    tilt: 0.44 + r() * 0.2,
    pa: mirror * (0.3 + r() * 0.25),
    dir: mirror,
    bar: Boolean(c.dual),
    sparkle: c.rarity === "holo" || c.rarity === "secret",
    tint: rgbOf(c.types[0]?.a ?? c.bigThree.sun.a),
    tint2: rgbOf(c.types[1]?.a ?? c.bigThree.moon.a),
    side: rgbOf(s.colour),
    stars: [...(c.stars ?? [])].sort((p, q) => p.x - q.x).map((p) => ({ x: (p.x - 0.5) * 1.2, y: (p.y - 0.5) * 1.2, w: p.weight })),
  };
}

/** Sprites are built once per galaxy and size, then only rotated and squashed per frame. */
const SPRITES = new Map<string, HTMLCanvasElement>();
const EXT = 1.25;

function sprite(gl: Gal, R: number, dpr: number): HTMLCanvasElement {
  const key = `${gl.seed}|${R}|${dpr}`;
  const hit = SPRITES.get(key);
  if (hit) return hit;
  const E = R * EXT;
  const cv = document.createElement("canvas");
  cv.width = cv.height = Math.ceil(E * 2 * dpr);
  const x = cv.getContext("2d")!;
  x.scale(dpr, dpr);
  x.translate(E, E);
  const r = rng(`sprite:${gl.seed}`);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-6, r()))) * Math.cos(TAU * r());
  const armAngle = (k: number, t: number) => (k / gl.arms) * TAU + gl.dir * gl.twist * Math.log(1 + 3 * t);
  const t0 = gl.bar ? 0.16 : 0.04;

  // diffuse disc light
  let gr = x.createRadialGradient(0, 0, 0, 0, 0, R);
  gr.addColorStop(0, rgba(mix(gl.tint, WHITE, 0.35), 0.32));
  gr.addColorStop(0.35, rgba(gl.tint, 0.12));
  gr.addColorStop(0.7, rgba(gl.tint2, 0.045));
  gr.addColorStop(1, rgba(gl.tint2, 0));
  x.fillStyle = gr;
  x.beginPath();
  x.arc(0, 0, R, 0, TAU);
  x.fill();
  x.globalCompositeOperation = "lighter";

  // arm haze: soft light along each arm
  for (let k = 0; k < gl.arms; k++)
    for (let j = 0; j < 36; j++) {
      const t = t0 + (j / 36) * (0.95 - t0);
      const th = armAngle(k, t);
      const rad = R * t;
      const br = R * (0.05 + 0.08 * t);
      const px = Math.cos(th) * rad;
      const py = Math.sin(th) * rad;
      gr = x.createRadialGradient(px, py, 0, px, py, br);
      gr.addColorStop(0, rgba(j % 3 === 0 ? gl.tint2 : gl.tint, 0.09 * (1 - t * 0.6)));
      gr.addColorStop(1, rgba(gl.tint, 0));
      x.fillStyle = gr;
      x.fillRect(px - br, py - br, br * 2, br * 2);
    }

  // arm stars: dense near the arms, scattered more toward the rim
  const N = Math.round(R * 8);
  for (let i = 0; i < N; i++) {
    const k = i % gl.arms;
    const t = t0 + Math.pow(r(), 0.8) * (1 - t0);
    const rad = R * t * 0.96 + gauss() * R * 0.025;
    const th = armAngle(k, t) + gauss() * (0.14 + 0.24 * t);
    const c = t < 0.22 ? mix(WARM, gl.tint, (t / 0.22) * 0.4) : r() < 0.22 ? gl.tint2 : r() < 0.3 ? WHITE : mix(gl.tint, WHITE, r() * 0.5);
    const s = 0.45 + Math.pow(r(), 6) * 1.7;
    x.fillStyle = rgba(c, 0.25 + r() * 0.6);
    x.fillRect(Math.cos(th) * rad - s / 2, Math.sin(th) * rad - s / 2, s, s);
  }

  // star-forming knots along the arms
  for (let i = 0; i < 22; i++) {
    const k = i % gl.arms;
    const t = 0.25 + r() * 0.65;
    const th = armAngle(k, t) + gauss() * 0.08;
    const px = Math.cos(th) * R * t;
    const py = Math.sin(th) * R * t;
    const br = 2 + r() * 5;
    gr = x.createRadialGradient(px, py, 0, px, py, br);
    gr.addColorStop(0, rgba(mix(gl.tint2, WHITE, 0.5), 0.7));
    gr.addColorStop(1, rgba(gl.tint2, 0));
    x.fillStyle = gr;
    x.fillRect(px - br, py - br, br * 2, br * 2);
  }

  // dust lanes on the inner edge of each arm
  x.globalCompositeOperation = "destination-out";
  for (let k = 0; k < gl.arms; k++)
    for (let j = 0; j < 46; j++) {
      const t = 0.14 + (j / 46) * 0.6;
      const th = armAngle(k, t) - gl.dir * 0.13;
      const br = R * (0.012 + 0.02 * t) * (0.7 + r() * 0.6);
      x.fillStyle = `rgba(0,0,0,${(0.16 + r() * 0.14).toFixed(3)})`;
      x.beginPath();
      x.arc(Math.cos(th) * R * t, Math.sin(th) * R * t, br, 0, TAU);
      x.fill();
    }
  x.globalCompositeOperation = "lighter";

  // a bar for split tastes: two halves held together
  if (gl.bar) {
    x.save();
    x.scale(1, 0.3);
    gr = x.createRadialGradient(0, 0, 0, 0, 0, R * 0.22);
    gr.addColorStop(0, rgba(WARM, 0.55));
    gr.addColorStop(1, rgba(gl.tint, 0));
    x.fillStyle = gr;
    x.fillRect(-R * 0.22, -R * 0.22, R * 0.44, R * 0.44);
    x.restore();
  }

  // the core
  gr = x.createRadialGradient(0, 0, 0, 0, 0, R * 0.3);
  gr.addColorStop(0, "rgba(255,255,255,.95)");
  gr.addColorStop(0.12, rgba(WARM, 0.6));
  gr.addColorStop(0.45, rgba(gl.tint, 0.2));
  gr.addColorStop(1, rgba(gl.tint, 0));
  x.fillStyle = gr;
  x.fillRect(-R * 0.3, -R * 0.3, R * 0.6, R * 0.6);

  // halo stars
  for (let i = 0; i < 180; i++) {
    const a = r() * TAU;
    const rad = Math.sqrt(r()) * R * 1.15;
    x.fillStyle = rgba(mix(WHITE, gl.tint, r() * 0.5), 0.12 + r() * 0.3);
    x.fillRect(Math.cos(a) * rad, Math.sin(a) * rad, 0.8, 0.8);
  }

  if (SPRITES.size > 10) SPRITES.delete(SPRITES.keys().next().value!);
  SPRITES.set(key, cv);
  return cv;
}

interface Arc {
  at: number;
  win: Side | "tie";
  up: boolean;
  landed: boolean;
  parts: { d: number; lat: number; v: number }[];
}

export function Galaxies({ sides, beat, reduce, solo = false, className = "", style }: { sides: GalaxySide[]; beat?: Beat; reduce: boolean; /** Fade every edge (a lone galaxy behind one card). */ solo?: boolean; className?: string; style?: CSSProperties }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const beatRef = useRef(beat);
  beatRef.current = beat;
  const sidesRef = useRef(sides);
  sidesRef.current = sides;
  const cardKey = sides.map((s) => `${s.side}:${s.card.serial}`).join("|");

  useEffect(() => {
    const canvas = cv.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const gals = sidesRef.current.map(galaxyOf);
    let W = 0;
    let H = 0;
    let dpr = 1;
    let R = 0;
    let sprites: HTMLCanvasElement[] = [];
    let dirty = true;

    const halo = document.createElement("canvas");
    halo.width = halo.height = 32;
    {
      const h = halo.getContext("2d")!;
      const gr = h.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, "rgba(255,255,255,.9)");
      gr.addColorStop(0.35, "rgba(255,255,255,.2)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      h.fillStyle = gr;
      h.fillRect(0, 0, 32, 32);
    }

    const build = () => {
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      if (!W || !H) return;
      dpr = Math.min(W < 640 ? 1.5 : 2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      const aw = sidesRef.current[0]?.anchor.current?.offsetWidth ?? 200;
      R = Math.round(Math.max(120, Math.min(320, aw * 1.25)) / 10) * 10;
      sprites = gals.map((gl) => sprite(gl, R, dpr));
      dirty = true;
    };
    build();
    const ro = new ResizeObserver(build);
    ro.observe(canvas);
    for (const s of sidesRef.current) if (s.anchor.current) ro.observe(s.anchor.current);

    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      dirty = true;
    });
    io.observe(canvas);

    // Per-side live state, eased toward targets every frame.
    const live = gals.map(() => ({ m: 1, alpha: reduce ? 1 : 0, push: reduce ? 1 : 0, hit: -1e9 }));
    const arcs: Arc[] = [];
    let lastPhase = -1;
    let finalAt = -1e9;
    let lastBeat = "";
    const slow = (navigator.hardwareConcurrency ?? 8) <= 4;
    let skip = false;
    let last = performance.now();
    const t0 = last;
    let lastDraw = 0;
    let boomed = false;

    const bez = (p: number[], q: number[], c: number[], u: number) => {
      const v = 1 - u;
      return [v * v * p[0] + 2 * v * u * c[0] + u * u * q[0], v * v * p[1] + 2 * v * u * c[1] + u * u * q[1]];
    };
    const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
    const flash = (x: number, y: number, rad: number, c: RGB, a: number) => {
      if (a <= 0.01 || rad <= 0) return;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, rgba(WHITE, a));
      gr.addColorStop(0.25, rgba(c, a * 0.6));
      gr.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = gr;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    };

    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const b = beatRef.current;
      const bk = b ? `${b.phase}` : "";
      if (bk !== lastBeat) {
        lastBeat = bk;
        dirty = true;
      }
      if (reduce) {
        // A still: redraw only when something changed, or now and then for late layout shifts.
        if (!dirty && now - lastDraw < 600) return;
      } else {
        const long = now - last > 24;
        if ((slow || long) && (skip = !skip)) return;
      }
      last = now;
      if (!visible || !W || !R) return;
      dirty = false;
      lastDraw = now;
      const t = (now - t0) / 1000;
      const host = canvas.getBoundingClientRect();
      const ss = sidesRef.current;
      const two = gals.length === 2;

      // beats → events
      if (b && b.phase !== lastPhase) {
        if (!reduce && b.phase >= 1 && b.phase <= 4 && b.rounds[b.phase - 1]) {
          const rr = rng(`arc:${b.phase}`);
          arcs.push({ at: now, win: b.rounds[b.phase - 1], up: b.phase % 2 === 1, landed: false, parts: Array.from({ length: W < 640 ? 46 : 72 }, () => ({ d: rr() * 240, lat: (rr() - 0.5) * 2, v: 0.85 + rr() * 0.3 })) });
        }
        if (b.phase >= 5 && lastPhase < 5) finalAt = reduce ? now - 1e5 : now;
        lastPhase = b.phase;
      }
      const final = Boolean(b && b.phase >= 5);
      const idx = (s: Side) => ss.findIndex((x) => x.side === s);

      // anchors (the cards) in canvas space
      const base = ss.map((s) => {
        const r = s.anchor.current?.getBoundingClientRect();
        return r ? [r.left - host.left + r.width / 2, r.top - host.top + r.height / 2] : null;
      });
      if (base.some((p) => !p)) return;
      const P = base as number[][];
      const mid = two ? [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2] : P[0];
      const dist = two ? Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]) : 0;
      const ux = two && dist ? (P[1][0] - P[0][0]) / dist : 1;
      const uy = two && dist ? (P[1][1] - P[0][1]) / dist : 0;
      const perp = [-uy, ux];

      // wins that have landed so far, and fresh hits
      const wins = { a: 0, b: 0 };
      for (const a of arcs) {
        const done = now >= a.at + ARC_DELAY + ARC_FLY;
        if (!done) continue;
        if (a.win !== "tie") wins[a.win]++;
        if (!a.landed) {
          a.landed = true;
          if (a.win === "tie") live.forEach((l) => (l.hit = now));
          else {
            const li = idx(a.win === "a" ? "b" : "a");
            if (li >= 0) live[li].hit = now;
          }
        }
      }

      // targets: each landed win shifts mass; the final result swells the winner and shoves the loser back
      const k = reduce ? 1 : 0.045;
      gals.forEach((gl, i) => {
        const me = ss[i].side;
        const other: Side = me === "a" ? "b" : "a";
        let m = 1 + 0.06 * (wins[me] - wins[other]);
        let push = 0;
        let alpha = reduce || now - t0 > 120 ? 1 : 0;
        if (final && b && b.winner !== "tie") {
          m = b.winner === me ? 1.2 : 0.74;
          push = b.winner === me ? 0 : 1;
          alpha = b.winner === me ? 1 : 0.62;
        } else if (final) m = 1.06;
        if (!two) m = 1;
        const l = live[i];
        l.m += (m - l.m) * k;
        l.push += (push - l.push) * k * 0.7;
        l.alpha += (alpha - l.alpha) * (reduce ? 1 : 0.03);
      });

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      const centres = gals.map((gl, i) => {
        const l = live[i];
        const away = ss[i].side === "a" ? -1 : 1;
        const recoil = reduce ? 0 : 14 * Math.exp(-(now - l.hit) / 260) * Math.sin((now - l.hit) / 40);
        const shove = two ? l.push * R * 0.28 + recoil : 0;
        return [P[i][0] + ux * away * shove, P[i][1] + uy * away * shove];
      });

      // the galaxies
      gals.forEach((gl, i) => {
        const l = live[i];
        const spin = reduce ? 0 : -gl.dir * t * 0.05 * (final && b?.winner === ss[i].side ? 1.6 : 1);
        const E = R * EXT;
        ctx.save();
        ctx.translate(centres[i][0], centres[i][1]);
        ctx.rotate(gl.pa);
        ctx.scale(l.m, l.m * gl.tilt);
        ctx.rotate(spin);
        ctx.globalAlpha = l.alpha;
        ctx.drawImage(sprites[i], -E, -E, E * 2, E * 2);
        ctx.restore();
        // a hit: the core flares
        const since = now - l.hit;
        if (!reduce && since < 700) flash(centres[i][0], centres[i][1], R * (0.25 + since / 1400), WHITE, 0.55 * (1 - since / 700));
      });

      if (two) {
        const [ca, cb] = centres;
        const tA = gals[0];
        const tB = gals[1];

        // tidal bridge: each galaxy leaks a faint stream toward the other while they fight
        if (!final && (reduce || now - t0 > IMPACT_MS)) {
          const n = W < 640 ? 26 : 44;
          for (let s = 0; s < 2; s++) {
            const from = s ? cb : ca;
            const ctl = [mid[0] + perp[0] * (s ? -1 : 1) * dist * 0.22, mid[1] + perp[1] * (s ? -1 : 1) * dist * 0.22];
            const gl = s ? tB : tA;
            for (let j = 0; j < n; j++) {
              const u = (j / n + (reduce ? 0 : t * 0.045)) % 1;
              const [x, y] = bez(from, mid, ctl, u);
              const fade = Math.sin(u * Math.PI);
              ctx.fillStyle = rgba(mix(gl.tint, WHITE, 0.3), 0.35 * fade);
              ctx.fillRect(x + Math.sin(j * 7.3) * 6, y + Math.cos(j * 3.1) * 6, 1.3, 1.3);
            }
          }
          // the lens: light pools where the two meet
          flash(mid[0], mid[1], R * 0.55, mix(tA.tint, tB.tint, 0.5), 0.16 + (reduce ? 0 : 0.03 * Math.sin(t * 2)));
        }

        // first contact: a flash and a shock ring from the impact point
        const ti = now - t0 - IMPACT_MS;
        if (!reduce && ti > 0 && !boomed) {
          boomed = true;
          sfx("collide");
        }
        if (!reduce && ti > 0 && ti < 1100) {
          const p = ti / 1100;
          flash(mid[0], mid[1], R * (0.35 + 1.3 * p), [198, 255, 61], 0.9 * (1 - p) * (1 - p));
          ctx.strokeStyle = rgba(WHITE, 0.7 * (1 - p));
          ctx.lineWidth = 2.5 * (1 - p) + 0.3;
          ctx.beginPath();
          ctx.ellipse(mid[0], mid[1], R * 1.7 * p, R * 1.7 * p * 0.55, 0, 0, TAU);
          ctx.stroke();
        }

        // rounds: the winner fires a stream of stars across the lens into the loser
        if (!final)
          for (const a of arcs) {
            const el = now - a.at - ARC_DELAY;
            if (el < 0 || el > ARC_FLY + 500) continue;
            const tie = a.win === "tie";
            for (let s = 0; s < (tie ? 2 : 1); s++) {
              const fromSide: Side = tie ? (s ? "b" : "a") : (a.win as Side);
              const fi = idx(fromSide);
              const from = centres[fi];
              const to = tie ? mid : centres[1 - fi];
              const sign = a.up ? -1 : 1;
              const col = gals[fi].side;
              for (const p of a.parts) {
                const u = Math.min(1, Math.max(0, ((el - p.d) / ARC_FLY) * p.v));
                if (u <= 0 || (u >= 1 && el - p.d > ARC_FLY + 200)) continue;
                const bend = dist * (tie ? 0.35 : 0.55) * sign + p.lat * 16;
                const ctl = [(from[0] + to[0]) / 2 + perp[0] * bend, (from[1] + to[1]) / 2 + perp[1] * bend];
                const e = ease(u);
                const [x, y] = bez(from, to, ctl, e);
                const [px, py] = bez(from, to, ctl, Math.max(0, ease(Math.max(0, u - 0.07))));
                const fade = u >= 1 ? 0 : Math.min(1, u * 6);
                ctx.strokeStyle = rgba(col, 0.75 * fade);
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(x, y);
                ctx.stroke();
                ctx.fillStyle = rgba(WHITE, 0.9 * fade);
                ctx.fillRect(x - 0.9, y - 0.9, 1.8, 1.8);
              }
            }
            if (tie && el > ARC_FLY && el < ARC_FLY + 500) flash(mid[0], mid[1], R * 0.5, WHITE, 0.6 * (1 - (el - ARC_FLY) / 500));
          }

        // the end: the winner drinks the loser's stars; a draw pours both into the middle
        if (final && b) {
          const since = now - finalAt;
          const surge = reduce ? 0 : Math.exp(-since / 900);
          const n = W < 640 ? 70 : 120;
          const flows: [number, number][] = b.winner === "tie" ? [[0, -1], [1, -1]] : [[idx(b.winner === "a" ? "b" : "a"), idx(b.winner)]];
          for (const [fi, ti2] of flows) {
            const from = centres[fi];
            const to = ti2 < 0 ? mid : centres[ti2];
            const toT = ti2 < 0 ? mix(tA.tint, tB.tint, 0.5) : gals[ti2].tint;
            const ctl = [(from[0] + to[0]) / 2 + perp[0] * dist * 0.28 * (fi ? 1 : -1), (from[1] + to[1]) / 2 + perp[1] * dist * 0.28 * (fi ? 1 : -1)];
            for (let j = 0; j < n; j++) {
              const u = (j / n + (reduce ? 0 : since / 2600)) % 1;
              const [x, y] = bez(from, to, ctl, u);
              const wob = Math.sin(j * 12.9898) * 7 * (1 - u);
              ctx.fillStyle = rgba(mix(gals[fi].tint, toT, u), (0.55 + surge * 0.4) * Math.sin(u * Math.PI));
              const s = 1 + (j % 5 === 0 ? 0.8 : 0);
              ctx.fillRect(x + perp[0] * wob - s / 2, y + perp[1] * wob - s / 2, s, s);
            }
          }
          if (b.winner === "tie") flash(mid[0], mid[1], R * 0.7, mix(tA.tint, tB.tint, 0.5), 0.3 + surge * 0.5);
          else {
            const wi = idx(b.winner);
            flash(centres[wi][0], centres[wi][1], R * (0.5 + surge * 0.6), gals[wi].side, 0.25 + surge * 0.6);
          }
        }
      }

      // each card's own constellation, riding its galaxy
      ctx.globalCompositeOperation = "source-over";
      gals.forEach((gl, i) => {
        if (gl.stars.length < 2) return;
        const l = live[i];
        const spin = reduce ? 0 : -gl.dir * t * 0.05 * (final && b?.winner === ss[i].side ? 1.6 : 1);
        const cs = Math.cos(spin);
        const sn = Math.sin(spin);
        const cp = Math.cos(gl.pa);
        const sp = Math.sin(gl.pa);
        const pts = gl.stars.map((p) => {
          const x0 = (p.x * cs - p.y * sn) * R * l.m;
          const y0 = (p.x * sn + p.y * cs) * R * l.m * gl.tilt;
          return { x: centres[i][0] + x0 * cp - y0 * sp, y: centres[i][1] + x0 * sp + y0 * cp, w: p.w };
        });
        const a = l.alpha * 0.85;
        ctx.strokeStyle = rgba(mix(gl.tint, WHITE, 0.6), 0.32 * a);
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        pts.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        let top = pts[0];
        for (const p of pts) {
          if (p.w > top.w) top = p;
          const r = 1 + p.w * 2.2;
          ctx.globalAlpha = a * 0.6;
          ctx.drawImage(halo, p.x - r * 3, p.y - r * 3, r * 6, r * 6);
          ctx.globalAlpha = a;
          ctx.fillStyle = rgba(mix(gl.tint, WHITE, 0.7), 1);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 0.6, 0, TAU);
          ctx.fill();
        }
        if (gl.sparkle) {
          const len = 9 + (reduce ? 0 : Math.sin(t * 1.7 + i) * 2);
          ctx.globalAlpha = a * 0.7;
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(top.x - len, top.y);
          ctx.lineTo(top.x + len, top.y);
          ctx.moveTo(top.x, top.y - len);
          ctx.lineTo(top.x, top.y + len);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [reduce, cardKey]);

  return <canvas ref={cv} aria-hidden className={`pointer-events-none ${solo ? g.solo : g.field} ${className}`} style={style} />;
}

/**
 * The VS mark as an event: a gravitational lens at the impact point. Dark core, a holo Einstein ring, lensed arcs,
 * and a lime flare that leans to whoever is winning (`color`). It snaps in with a shock ring at `delay` ms.
 */
export function VsLens({ size, color = "#c6ff3d", delay = 0, label = "VS", className = "", style }: { size: number; color?: string; delay?: number; label?: string; className?: string; style?: CSSProperties }) {
  return (
    <div className={`${g.lens} ${className}`} style={{ width: size, height: size, color, ["--d" as string]: `${delay}ms`, ...style }}>
      <span className={g.shock} aria-hidden />
      <span className={g.body} aria-hidden>
        <span className={g.glow} />
        <span className={g.ring} />
        <span className={g.arcs} />
        <span className={g.core} />
        <span className={g.flare} />
      </span>
      <span className={g.vs} style={{ fontSize: Math.round(size * 0.24) }}>
        {label}
      </span>
    </div>
  );
}
