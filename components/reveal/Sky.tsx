"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { displayName } from "@/lib/card";
import { figureFor, rng, TAU, type FigureShape } from "./skyFigures";
import { KIND_LABEL, pullShares, vibeAngles, type Folded } from "./traceModel";

/**
 * The sky behind the reading, story, pack, /c and /vs. A long-exposure night sky with an engraved atlas plate on top:
 *  - a plate rendered once per size: deep gradient, structured dust (noise cut by dark lanes, never a blur), a Milky
 *    Way made of thousands of band stars, and the far field;
 *  - live layers: mid and near stars with parallax, ~20 bright stars that scintillate, hairline spikes on the top 5;
 *  - one constellation per love, generated from its name (same figure on every screen), styled like a star atlas,
 *    reacting to the reading: engraves in when the love resolves, dims while pulled out, lime when it steers.
 * Every event is a trace event; nothing random fires (no shooting stars).
 */

/* ------------------------------------------------------------------ noise (value noise, fBm, ridged) */

function lattice(x: number, y: number) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + 1013904223;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = lattice(xi, yi);
  const b = lattice(xi + 1, yi);
  const c = lattice(xi, yi + 1);
  const d = lattice(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, oct = 4) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return s / (1 - Math.pow(0.5, oct));
}
function ridged(x: number, y: number, oct = 3) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(2 * vnoise(x * f + 17.3, y * f - 9.1) - 1);
    s += amp * n * n;
    f *= 2.1;
    amp *= 0.5;
  }
  return s / (1 - Math.pow(0.5, oct));
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ stars */

/** Star colour by temperature, weighted like a real sky: mostly white and warm white, few blue, few orange. */
const TEMPS: [string, number][] = [
  ["#9bb0ff", 0.08],
  ["#cad7ff", 0.15],
  ["#f8f7ff", 0.3],
  ["#fff4ea", 0.27],
  ["#ffd2a1", 0.15],
  ["#ffcc6f", 0.05],
];
function tempOf(r: number) {
  let acc = 0;
  for (const [c, w] of TEMPS) {
    acc += w;
    if (r < acc) return c;
  }
  return TEMPS[2][0];
}
/** Magnitude: counts rise steeply toward faint, so most stars are sub-pixel and only a handful are big. */
const magnitude = (r: number) => 0.45 + 1.5 * Math.pow(r, 7);

interface Dot {
  x: number;
  y: number;
  s: number;
  c: string;
  a: number;
}
interface Bright extends Dot {
  /** scintillation state: brightness random-walk */
  b: number;
  spikes: boolean;
}

/** The band: a tilted line across the sky; returns 0–1 density and a dark-lane factor at a point. */
function bandAt(x: number, y: number, w: number, h: number) {
  const diag = Math.hypot(w, h);
  const th = -0.5;
  const cx = w * 0.52;
  const cy = h * 0.46;
  const nx = -Math.sin(th);
  const ny = Math.cos(th);
  const d = (x - cx) * nx + (y - cy) * ny; // across the band
  const t = (x - cx) * Math.cos(th) + (y - cy) * Math.sin(th); // along the band
  const sigma = diag * 0.13 * (0.8 + 0.4 * fbm(t / diag * 3 + 4, 1.7, 2));
  const mask = Math.exp(-((d / sigma) ** 2)) * (0.55 + 0.45 * Math.exp(-((t / (diag * 0.45)) ** 2)));
  const s = 5.5 / diag;
  const lane = smooth(0.52, 0.86, ridged(x * s * 1.6, y * s * 1.6)) * smooth(0.1, 0.6, mask);
  return { mask, lane, across: Math.min(1, Math.abs(d) / sigma) };
}

/** Builds the static plate: gradient, dust and band, band stars, far field. Rendered once per size. */
function buildPlate(W: number, H: number, dpr: number, M: number) {
  const pw = W + M * 2;
  const ph = H + M * 2;
  const plate = document.createElement("canvas");
  plate.width = Math.round(pw * dpr);
  plate.height = Math.round(ph * dpr);
  const g = plate.getContext("2d")!;
  g.scale(dpr, dpr);

  // 0. deep gradient, a touch bluer toward the band
  const lin = g.createLinearGradient(0, 0, pw, ph);
  lin.addColorStop(0, "#07070a");
  lin.addColorStop(0.5, "#0b0d16");
  lin.addColorStop(1, "#07070a");
  g.fillStyle = lin;
  g.fillRect(0, 0, pw, ph);

  // 1. dust: structured noise inside the band mask, cut by ridged dark lanes. Quarter resolution, upscaled once.
  const q = 4;
  const qw = Math.ceil(pw / q);
  const qh = Math.ceil(ph / q);
  const small = document.createElement("canvas");
  small.width = qw;
  small.height = qh;
  const sg = small.getContext("2d")!;
  const img = sg.createImageData(qw, qh);
  const diag = Math.hypot(pw, ph);
  const warm = [70, 50, 34];
  const cool = [24, 34, 66];
  for (let j = 0; j < qh; j++) {
    for (let i = 0; i < qw; i++) {
      const x = i * q;
      const y = j * q;
      const { mask, lane, across } = bandAt(x, y, pw, ph);
      const grain = fbm((x / diag) * 9, (y / diag) * 9, 4);
      const dens = Math.max(0, mask * (0.35 + 0.85 * grain) * (1 - 0.9 * lane) - 0.04);
      const k = (j * qw + i) * 4;
      const m = across;
      img.data[k] = warm[0] + (cool[0] - warm[0]) * m;
      img.data[k + 1] = warm[1] + (cool[1] - warm[1]) * m;
      img.data[k + 2] = warm[2] + (cool[2] - warm[2]) * m;
      img.data[k + 3] = Math.min(255, dens * 255 * 0.5);
    }
  }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(small, 0, 0, pw, ph);

  // 2. band stars: the Milky Way is mostly star density, thinned by the dust lanes
  const area = (pw * ph) / (1440 * 900);
  const r = rng("tastrology-band");
  const bandTarget = Math.round(9000 * area);
  let placed = 0;
  for (let tries = 0; placed < bandTarget && tries < bandTarget * 6; tries++) {
    const x = r() * pw;
    const y = r() * ph;
    const { mask, lane } = bandAt(x, y, pw, ph);
    if (r() > mask * (1 - 0.92 * lane)) continue;
    placed++;
    const s = r() < 0.985 ? 0.5 + r() * 0.5 : 1 + r() * 0.6;
    g.globalAlpha = 0.25 + r() * 0.55;
    g.fillStyle = tempOf(r());
    g.fillRect(x, y, s, s);
  }

  // 3. far field: everywhere, faint
  const far = Math.round(2600 * area);
  for (let k = 0; k < far; k++) {
    const s = magnitude(r()) * 0.9;
    g.globalAlpha = 0.2 + r() * 0.5;
    g.fillStyle = tempOf(r());
    g.fillRect(r() * pw, r() * ph, s, s);
  }
  g.globalAlpha = 1;
  return plate;
}

/* ------------------------------------------------------------------ constellations */

interface Figure extends FigureShape {
  id: string;
  name: string;
  kind: string;
  born: number;
  a: number;
}

/** Text set along a gentle arc (centre of curvature above the text), like a caption on an engraved plate. */
function arcText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, R: number, spacing: number) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0);
  const span = total / R;
  let ang = Math.PI / 2 + span / 2;
  const cy = y - R;
  [...text].forEach((ch, i) => {
    const a = ang - widths[i] / 2 / R;
    ctx.save();
    ctx.translate(x + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.rotate(a - Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    ang -= widths[i] / R;
  });
}

/* ------------------------------------------------------------------ component */

/**
 * `dim` scales the whole sky (story and pack sit it further back). `drawn` skips the engrave-in, for screens that
 * arrive with the reading already done. `fixed` pins it to the viewport on pages that scroll.
 */
export function Sky({
  f,
  anchor,
  reduce: reduceProp,
  dim = 1,
  drawn = false,
  fixed = false,
  quiet = false,
  travel = false,
  pulse = 0,
  nameless = false,
}: {
  f: Folded;
  anchor?: RefObject<HTMLElement | null>;
  reduce: boolean;
  dim?: number;
  drawn?: boolean;
  fixed?: boolean;
  /** Background for a reading page: no captions, graticule or flares, and it sits behind the content (-z-10). */
  quiet?: boolean;
  /** Slow, deep flight through the stars, outward from the anchor (while a card is being read). */
  travel?: boolean;
  /** Bumped on every real data beat: the flight surges briefly, then settles. */
  pulse?: number;
  /** Unlabelled star patterns (no captions), e.g. behind the sealed pack so nothing is given away. */
  nameless?: boolean;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  // Phones: a full-screen page backdrop (fixed) draws still, as the landing's does. Animated, it competed with the
  // card in front of it for every frame (a Secret Rare on /c stuttered).
  const [coarse, setCoarse] = useState(false);
  useEffect(() => setCoarse(window.matchMedia("(hover: none) and (pointer: coarse)").matches), []);
  const reduce = reduceProp || (fixed && coarse);
  const travelRef = useRef(travel);
  travelRef.current = travel;
  const namelessRef = useRef(nameless);
  namelessRef.current = nameless;
  const surgeAt = useRef(-1e9);
  const lastPulse = useRef(pulse);
  if (pulse !== lastPulse.current) {
    lastPulse.current = pulse;
    surgeAt.current = typeof performance === "undefined" ? 0 : performance.now();
  }
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
    const C = { ink: col("--ink", "#f3f1ec"), dim: col("--ink-3", "#77736c"), accent: col("--accent", "#c6ff3d"), m: col("--m", "#f472b6") };
    const serif = col("--font-serif", "Georgia, serif");
    const mono = col("--font-mono", "ui-monospace, monospace");

    const M = 28; // plate margin, room for parallax
    let W = 0;
    let H = 0;
    let dpr = 1;
    let plate: HTMLCanvasElement | null = null;
    let mid: Dot[] = [];
    let near: Dot[] = [];
    let bright: Bright[] = [];
    let midByColour = new Map<string, Dot[]>();
    let nearByColour = new Map<string, Dot[]>();

    const group = (list: Dot[]) => {
      const m = new Map<string, Dot[]>();
      for (const d of list) (m.get(d.c) ?? m.set(d.c, []).get(d.c)!).push(d);
      return m;
    };
    const build = () => {
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      if (!W || !H) return;
      dpr = Math.min(W < 640 ? 1.25 : 2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      plate = buildPlate(W, H, dpr, M);
      const area = (W * H) / (1440 * 900);
      const r = rng("tastrology-field");
      const dots = (n: number, scale: number) =>
        Array.from({ length: Math.round(n * area) }, () => ({ x: r() * (W + M * 2) - M, y: r() * (H + M * 2) - M, s: magnitude(r()) * scale, c: tempOf(r()), a: 0.35 + r() * 0.5 }));
      mid = dots(1300, 1.05);
      near = dots(420, 1.25);
      midByColour = group(mid);
      nearByColour = group(near);
      bright = Array.from({ length: W < 640 ? 10 : 20 }, (_, k) => ({
        x: r() * W,
        y: r() * H,
        s: 1.3 + r() * 1.1,
        c: tempOf(r()),
        a: 1,
        b: 1,
        spikes: k < 5,
      }));
    };
    build();

    // Flight: stars in a 3D box streaming past the camera. z shrinks toward the viewer; respawn far away.
    const fr = rng("tastrology-flight");
    const warpN = () => (W < 640 ? 220 : 520);
    const warp = Array.from({ length: warpN() }, () => ({ x: (fr() - 0.5) * 2.4, y: (fr() - 0.5) * 2.4, z: 0.08 + fr() * 0.92, c: tempOf(fr()) }));
    let speed = 0;
    let travelMix = travelRef.current ? 1 : 0;

    let rebuild: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(rebuild);
      rebuild = setTimeout(build, 250);
    });
    ro.observe(canvas);

    // Parallax: pointer on desktop, tilt on phones. Springs toward the target; off for reduced motion.
    const target = { x: 0, y: 0 };
    const par = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      target.x = Math.max(-1, Math.min(1, e.gamma / 30));
      target.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    };
    if (!reduce) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("deviceorientation", onTilt, { passive: true });
    }

    const figures = new Map<string, Figure>();
    const halo = document.createElement("canvas");
    halo.width = halo.height = 32;
    {
      const x = halo.getContext("2d")!;
      const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, "rgba(255,255,255,.85)");
      gr.addColorStop(0.35, "rgba(255,255,255,.18)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = gr;
      x.fillRect(0, 0, 32, 32);
    }
    const spikes = (x: number, y: number, len: number, alpha: number, colour: string) => {
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 0.6;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        const gr = ctx.createLinearGradient(x - dx * len, y - dy * len, x + dx * len, y + dy * len);
        gr.addColorStop(0, "rgba(255,255,255,0)");
        gr.addColorStop(0.5, colour);
        gr.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = gr;
        ctx.beginPath();
        ctx.moveTo(x - dx * len, y - dy * len);
        ctx.lineTo(x + dx * len, y + dy * len);
        ctx.stroke();
      }
    };

    const slow = (navigator.hardwareConcurrency ?? 8) <= 4 || window.innerWidth < 640; // phones: 30fps leaves the GPU to the card
    let raf = 0;
    let skip = false;
    let stillAt = -1e9;
    let last = performance.now();
    const t0 = last;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // a still sky (reduced motion, or phones on the landing) only needs an occasional repaint for new figures
      if (reduce && now - stillAt < 500) return;
      stillAt = now;
      const long = now - last > 24;
      if ((slow || long) && (skip = !skip)) return; // 30fps on weak devices or after a long frame
      last = now;
      if (!plate || !W) return;
      const t = (now - t0) / 1000;
      const st = fRef.current;
      dimNow.current += (dimRef.current - dimNow.current) * (reduce ? 1 : 0.05);
      const D = dimNow.current;
      if (!reduce) {
        par.x += (target.x - par.x) * 0.04;
        par.y += (target.y - par.y) * 0.04;
      }
      // A very slow drift, as if the sky turns overhead.
      const drift = reduce ? 0 : Math.sin(t / 40) * 6;
      const off = (k: number) => ({ x: -par.x * k + drift * (k / 14), y: -par.y * k * 0.6 });

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // flight state: eases in/out with `travel`; a data beat surges it, then it settles back to a slow drift
      travelMix += ((travelRef.current && !reduce ? 1 : 0) - travelMix) * 0.03;
      const surge = Math.exp(-(now - surgeAt.current) / 900);
      speed = travelMix * (0.022 + 0.11 * surge);

      // plate (gradient, dust, band, far field); while travelling it breathes very slowly, as if the camera pushes in
      const o0 = off(2);
      const zoom = 1 + travelMix * (0.025 + 0.02 * Math.sin(t / 22));
      const pw = (W + M * 2) * zoom;
      const ph = (H + M * 2) * zoom;
      ctx.globalAlpha = Math.min(1, 0.35 + 0.65 * D);
      ctx.drawImage(plate, (W - pw) / 2 + o0.x, (H - ph) / 2 + o0.y, pw, ph);

      // the flight: stars streaming outward from the well, faint and far until they pass close
      if (travelMix > 0.01) {
        const ab = anchor?.current?.getBoundingClientRect();
        const hb = canvas.getBoundingClientRect();
        const fx = ab ? ab.left - hb.left + ab.width / 2 : W / 2;
        const fy = ab ? ab.top - hb.top + ab.height / 2 : H / 2;
        const F = Math.max(W, H) * 0.42;
        const dt = 1 / 60;
        ctx.lineCap = "round";
        for (const s of warp) {
          const pz = s.z;
          s.z -= speed * dt;
          if (s.z < 0.06) {
            s.x = (fr() - 0.5) * 2.4;
            s.y = (fr() - 0.5) * 2.4;
            s.z = 1;
            continue;
          }
          const x = fx + (s.x / s.z) * F;
          const y = fy + (s.y / s.z) * F;
          if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
          const near = 1 - s.z;
          const a = travelMix * Math.min(1, near * 1.6) * 0.85 * D;
          if (a < 0.02) continue;
          ctx.globalAlpha = a;
          ctx.strokeStyle = s.c;
          ctx.fillStyle = s.c;
          const r = 0.3 + near * near * 1.6;
          // a short trail toward where it was: only visible as it nears the camera or during a surge
          const px = fx + (s.x / pz) * F;
          const py = fy + (s.y / pz) * F;
          if (Math.hypot(x - px, y - py) > 0.8) {
            ctx.lineWidth = r * 1.2;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(x, y);
            ctx.stroke();
          } else {
            ctx.fillRect(x - r / 2, y - r / 2, r, r);
          }
        }
      }

      // mid and near field, batched by colour
      for (const [layer, k] of [
        [midByColour, 6],
        [nearByColour, 14],
      ] as const) {
        const o = off(k);
        for (const [c, list] of layer) {
          ctx.fillStyle = c;
          for (const d of list) {
            ctx.globalAlpha = d.a * Math.min(1, 0.4 + 0.6 * D);
            ctx.fillRect(d.x + o.x, d.y + o.y, d.s, d.s);
          }
        }
      }

      // bright stars: scintillation is a small random walk in brightness, not a uniform sine
      const ob = off(10);
      for (const s of bright) {
        if (!reduce) s.b = Math.max(0.65, Math.min(1.15, s.b + (Math.random() - 0.5) * 0.09));
        const x = s.x + ob.x;
        const y = s.y + ob.y;
        const r = s.s * s.b;
        ctx.globalAlpha = 0.55 * s.b * Math.min(1, 0.4 + 0.6 * D);
        ctx.drawImage(halo, x - r * 3, y - r * 3, r * 6, r * 6);
        ctx.globalAlpha = Math.min(1, s.b) * Math.min(1, 0.45 + 0.55 * D);
        ctx.fillStyle = s.c;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.55, 0, TAU);
        ctx.fill();
        if (s.spikes) spikes(x, y, r * 7, 0.5 * s.b * D, s.c);
      }

      // constellations, on the nearest layer
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
      const pulled = st.critique ? pullShares(st) : undefined;
      const strongest = pulled?.top;
      const size = Math.max(46, Math.min(110, Math.min(W, H) * 0.09));
      const narrow = W < 640;
      const oc = off(18);

      const keyOf = (name: string) => displayName(name).toLowerCase();
      // vibes get figures too, on the loves' ring in the gaps between them (vibeAngles), engraved in the rainbow
      const vAng = vibeAngles(n, real.length ? st.vibes?.length ?? 0 : 0);
      const vibes = real.length ? (st.vibes ?? []).map((v, i) => ({ id: `vibe:${v.name}`, name: v.name, kind: "vibe", via: v.via, ang: vAng[i] })) : [];
      const items = [...real.map((s) => ({ ...s, via: undefined as string[] | undefined, ang: -Math.PI / 2 + (TAU * st.seeds.indexOf(s)) / Math.max(1, n) })), ...vibes];
      for (const s of items) {
        const k = keyOf(s.name);
        if (!figures.has(k)) figures.set(k, { id: k, name: displayName(s.name), kind: s.kind, ...figureFor(k, size), born: drawn ? now - 5000 : now, a: 0 });
      }
      items.forEach((s, i) => {
        const fig = figures.get(keyOf(s.name))!;
        const ang = s.ang;
        const vibe = s.kind === "vibe";
        const d = wellR + size * 1.9;
        const maxX = Math.min(W, 2 * cx) - size * 1.2;
        const ax = Math.min(maxX, Math.max(size * 1.2, cx + Math.cos(ang) * d * 1.25)) + oc.x;
        const ay = Math.min(H - size, Math.max(size, cy + Math.sin(ang) * d)) + oc.y;
        const lead = st.critique && s.id === strongest;
        let tone: string | CanvasGradient = lead ? C.accent : sideB.has(s.id) ? C.m : C.ink;
        if (vibe) {
          const g = ctx.createLinearGradient(ax - size, ay - size * 0.7, ax + size, ay + size * 0.7);
          ["#ff7ab6", "#ffd36e", "#c6ff3d", "#6ee7ff", "#b18cff"].forEach((c, k) => g.addColorStop(k / 4, c));
          tone = g;
        }
        const want = s.id === current ? 0.25 : inert.has(s.id) ? 0.35 : lead ? 1 : 0.75;
        fig.a += ((narrow ? want * 0.55 : want) * D - fig.a) * (reduce ? 1 : 0.06);
        const age = now - fig.born;
        const grow = reduce ? 1 : Math.min(1, age / 1600);
        const sway = reduce ? 0 : Math.sin(t * 0.3 + i) * 2;

        // graticule: a faint arc with tick marks behind the figure, like an atlas plate
        if (!narrow && !quiet) {
          const gr = size * 1.35;
          ctx.globalAlpha = fig.a * 0.16 * grow;
          ctx.strokeStyle = C.ink;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.arc(ax, ay + sway, gr, fig.arc, fig.arc + 1.3);
          ctx.stroke();
          for (let k = 0; k <= 13; k++) {
            const a = fig.arc + (k / 13) * 1.3;
            const tk = k % 5 === 0 ? 5 : 2.5;
            ctx.beginPath();
            ctx.moveTo(ax + Math.cos(a) * gr, ay + sway + Math.sin(a) * gr);
            ctx.lineTo(ax + Math.cos(a) * (gr + tk), ay + sway + Math.sin(a) * (gr + tk));
            ctx.stroke();
          }
        }

        // engraved figure lines: hairline, stopping short of each star
        ctx.strokeStyle = tone;
        ctx.lineWidth = tone === C.ink ? 0.6 : 0.9;
        ctx.setLineDash(sideB.has(s.id) ? [3, 3] : []);
        fig.edges.forEach(([a, b], e) => {
          const seg = Math.max(0, Math.min(1, grow * fig.edges.length - e));
          if (seg <= 0) return;
          const p = fig.stars[a];
          const q = fig.stars[b];
          const len = Math.hypot(q.x - p.x, q.y - p.y);
          if (len < 10) return;
          const ux = (q.x - p.x) / len;
          const uy = (q.y - p.y) / len;
          const gap = 4 + p.m * 2;
          const sx = ax + p.x + ux * gap;
          const sy = ay + sway + p.y + uy * gap;
          const end = (len - gap - (4 + q.m * 2)) * seg;
          if (end <= 0) return;
          ctx.globalAlpha = fig.a * 0.55;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + ux * end, sy + uy * end);
          ctx.stroke();
        });
        ctx.setLineDash([]);

        // star symbols graded by magnitude; the alpha star gets a ring, ignites on arrival, and a halo when it steers
        fig.stars.forEach((p, k) => {
          const on = Math.min(1, grow * fig.stars.length - k + 1);
          if (on <= 0) return;
          const x = ax + p.x;
          const y = ay + p.y + sway;
          const r = 0.9 + p.m * 1.9;
          ctx.globalAlpha = fig.a * on * 0.45;
          ctx.drawImage(halo, x - r * 3, y - r * 3, r * 6, r * 6);
          ctx.globalAlpha = fig.a * on;
          ctx.fillStyle = tone;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU);
          ctx.fill();
          if (k === fig.alpha) {
            ctx.strokeStyle = tone;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.arc(x, y, r + 3, 0, TAU);
            ctx.stroke();
            // ignition when the love resolves: spikes flare over ~600ms, then settle
            const flare = reduce || drawn || quiet ? 0 : Math.max(0, 1 - Math.abs(age - 350) / 450);
            spikes(x, y, r * (4 + flare * 9), fig.a * (0.35 + flare * 0.6), typeof tone === "string" ? tone : "#e9ddff");
            if (lead) {
              ctx.globalAlpha = fig.a * 0.8;
              ctx.strokeStyle = C.accent;
              ctx.beginPath();
              ctx.arc(x, y, r + 7 + (reduce ? 0 : Math.sin(t * 2) * 1.2), 0, TAU);
              ctx.stroke();
            }
          }
        });

        // caption: name set along an arc, with a spaced mono sub-caption carrying only real values
        if (narrow || quiet || namelessRef.current) return;
        const low = fig.stars.reduce((m, p) => Math.max(m, p.y), 0);
        const fs = Math.round(Math.max(13, size * 0.2));
        ctx.globalAlpha = fig.a * grow * 0.7;
        ctx.fillStyle = tone;
        ctx.font = `italic ${fs}px ${serif}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const name = fig.name.length > 26 ? `${fig.name.slice(0, 25)}…` : fig.name;
        arcText(ctx, name, ax, ay + low + sway + 22, size * 4.2, 0.4);
        const kind = (vibe && s.via?.[0] ? `vibe · via ${s.via[0]}` : KIND_LABEL[fig.kind] ?? fig.kind ?? "").toUpperCase();
        const share = lead && pulled ? Math.round((pulled.shares[s.id] ?? 0) * 100) : 0;
        const sub = [kind, share > 0 ? `${share}% OF THE PULL` : "", sideB.has(s.id) ? "SIDE B" : ""].filter(Boolean).join("  ·  ");
        if (sub) {
          ctx.font = `9px ${mono}`;
          ctx.globalAlpha = fig.a * grow * 0.5;
          ctx.fillStyle = lead ? C.accent : C.dim;
          ctx.letterSpacing = "2px";
          ctx.fillText(sub, ax, ay + low + sway + 22 + fs * 0.95);
          ctx.letterSpacing = "0px";
        }
      });
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(rebuild);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("deviceorientation", onTilt);
    };
  }, [anchor, reduce, drawn, quiet]);

  return <canvas ref={cv} className={`pointer-events-none ${fixed ? "fixed" : "absolute"} inset-0 h-full w-full ${quiet ? "-z-10" : ""}`} aria-hidden />;
}
