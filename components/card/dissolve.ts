"use client";

import { sfx } from "@/lib/sound";

/**
 * The burn (docs/design/burn.md §1). Pure canvas + DOM, no React state, so it holds 60fps over any card.
 *   0 – 280 ms   crack: the foil splits along glowing lime fractures from a random impact point; the card shudders and flashes.
 *  280 – 900 ms  burn: a hot edge sweeps the card bottom-up, eating it through a mask. Embers spit off the edge;
 *                about 1,000 motes in the card's own colours lift, curl and stream into `target` (the dust counter).
 *   end          afterglow: a lime bloom where the card stood and a ring bursting off the counter.
 * No target (dust off): motes drift up and fade. Reduced motion: no particles and no movement, the card greys out in 250 ms.
 */
export interface Dissolve {
  done: Promise<void>;
  /** Puts the card back (the burn request failed). */
  restore: () => void;
}

interface Mote {
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  delay: number;
  life: number;
  size: number;
  color: string;
  wob: number;
  seed: number;
}
interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  hue: string;
  px: number;
  py: number;
}

const LIME = "#c6ff3d";
const EMBER = ["#ffd166", "#ff9f43", "#ff6b35", LIME, "#fff4c2"];
const CRACK_MS = 280;
const SWEEP_MS = 620;
const GLOW_MS = 520;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** A jagged fracture: a random walk from the impact point, with a chance to fork. */
function fracture(x: number, y: number, ang: number, len: number, depth: number, out: [number, number][][]) {
  const pts: [number, number][] = [[x, y]];
  const steps = 6 + ((Math.random() * 5) | 0);
  for (let i = 0; i < steps; i++) {
    ang += (Math.random() - 0.5) * 0.9;
    x += Math.cos(ang) * (len / steps);
    y += Math.sin(ang) * (len / steps);
    pts.push([x, y]);
    if (depth < 2 && Math.random() < 0.18) fracture(x, y, ang + (Math.random() < 0.5 ? -0.8 : 0.8), len * 0.45, depth + 1, out);
  }
  out.push(pts);
}

export function dissolve(el: HTMLElement, opts: { target?: HTMLElement | null; colors: string[]; reduce: boolean }): Dissolve {
  const prev = { mask: el.style.maskImage, wmask: el.style.webkitMaskImage, filter: el.style.filter, opacity: el.style.opacity, transform: el.style.transform };
  let cancelled = false;
  let cleanup = () => {};
  const restore = () => {
    cancelled = true;
    cleanup();
    Object.assign(el.style, { maskImage: prev.mask, webkitMaskImage: prev.wmask, filter: prev.filter, opacity: prev.opacity, transform: prev.transform });
  };

  if (opts.reduce) {
    const a = el.animate([{ filter: "grayscale(0)", opacity: 1 }, { filter: "grayscale(1)", opacity: 0 }], { duration: 250, fill: "forwards" });
    cleanup = () => a.cancel();
    return { done: a.finished.then(() => undefined).catch(() => undefined), restore };
  }

  const r = el.getBoundingClientRect();
  const tr = opts.target?.getBoundingClientRect();
  const tx = tr ? tr.left + tr.width / 2 : 0;
  const ty = tr ? tr.top + tr.height / 2 : 0;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "60" });
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // Cracks from an impact point in the upper half of the card.
  const ix = r.left + r.width * (0.3 + Math.random() * 0.4);
  const iy = r.top + r.height * (0.25 + Math.random() * 0.3);
  const cracks: [number, number][][] = [];
  const arms = 5 + ((Math.random() * 3) | 0);
  for (let i = 0; i < arms; i++) fracture(ix, iy, (i / arms) * Math.PI * 2 + Math.random() * 0.5, Math.max(r.width, r.height) * (0.35 + Math.random() * 0.35), 0, cracks);

  const n = Math.round(Math.min(1100, Math.max(450, (r.width * r.height) / 75)));
  const colors = opts.colors.length ? opts.colors : [LIME];
  const motes: Mote[] = [];
  for (let i = 0; i < n; i++) {
    const fx = Math.random();
    const fy = Math.random();
    const x0 = r.left + fx * r.width;
    const y0 = r.top + fy * r.height;
    motes.push({
      x0,
      y0,
      cx: x0 + (Math.random() - 0.5) * 160,
      cy: y0 - 50 - Math.random() * 150,
      x1: tr ? tx + (Math.random() - 0.5) * 8 : x0 + (Math.random() - 0.5) * 140,
      y1: tr ? ty + (Math.random() - 0.5) * 8 : y0 - 180 - Math.random() * 220,
      delay: CRACK_MS + (1 - fy) * SWEEP_MS + Math.random() * 80,
      life: 620 + Math.random() * 360,
      size: (0.8 + Math.random() * 1.8) * dpr,
      color: Math.random() < 0.12 ? LIME : colors[(Math.random() * colors.length) | 0],
      wob: 6 + Math.random() * 16,
      seed: Math.random() * 6.28,
    });
  }
  const embers: Ember[] = [];

  let raf = 0;
  cleanup = () => {
    cancelAnimationFrame(raf);
    canvas.remove();
  };

  const done = new Promise<void>((resolve) => {
    const t0 = performance.now();
    let last = t0;
    let endAt = 0;
    const frame = (now: number) => {
      if (cancelled) return resolve();
      const ms = now - t0;
      const dt = Math.min(48, now - last) / 16.67;
      last = now;
      const live = opts.target?.getBoundingClientRect();
      const aim = live ? { x: live.left + live.width / 2, y: live.top + live.height / 2 } : { x: tx, y: ty };

      // Card: shudder + flash while it cracks, then the burn mask eats it bottom-up.
      const crack = Math.min(1, ms / CRACK_MS);
      const line = Math.max(0, Math.min(1, (ms - CRACK_MS) / SWEEP_MS));
      if (ms < CRACK_MS) {
        const j = (1 - crack) * 3;
        el.style.transform = `translate(${(Math.random() - 0.5) * j}px, ${(Math.random() - 0.5) * j}px)`;
        el.style.filter = `brightness(${1 + Math.sin(crack * Math.PI) * 0.6}) saturate(1.4)`;
      } else {
        el.style.transform = prev.transform;
        const cut = 100 - line * 114;
        const mask = `linear-gradient(to top, transparent ${cut}%, #000 ${cut + 10}%)`;
        el.style.maskImage = mask;
        el.style.webkitMaskImage = mask;
        el.style.filter = `sepia(${0.25 + line * 0.5}) saturate(${1.3 + line}) brightness(${1.05 + line * 0.3})`;
      }
      const edgeY = r.bottom - line * r.height;

      let alive = 0;
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "lighter";

        // Fractures: grow out from the impact, glow, then burn away with the card (clipped above the edge).
        if (line < 1) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(r.left - 4, r.top - 4, r.width + 8, Math.max(0, edgeY - r.top + 4));
          ctx.clip();
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.shadowColor = LIME;
          ctx.shadowBlur = 12;
          ctx.strokeStyle = `rgba(230,255,170,${0.95 - line * 0.6})`;
          ctx.lineWidth = 1.4;
          for (const c of cracks) {
            const k = Math.max(1, Math.floor(c.length * crack));
            ctx.beginPath();
            ctx.moveTo(c[0][0], c[0][1]);
            for (let i = 1; i < k; i++) ctx.lineTo(c[i][0], c[i][1]);
            ctx.stroke();
          }
          ctx.restore();
        }

        // The burn edge: a hot band across the card, plus embers spat off it.
        if (ms >= CRACK_MS && line < 1) {
          const g = ctx.createLinearGradient(0, edgeY - 22, 0, edgeY + 6);
          g.addColorStop(0, "rgba(198,255,61,0)");
          g.addColorStop(0.55, "rgba(255,170,60,0.55)");
          g.addColorStop(0.85, "rgba(255,244,194,0.9)");
          g.addColorStop(1, "rgba(255,120,40,0)");
          ctx.fillStyle = g;
          ctx.fillRect(r.left - 6, edgeY - 22, r.width + 12, 28);
          for (let i = 0; i < 5 * dt; i++)
            embers.push({
              x: r.left + Math.random() * r.width,
              y: edgeY - Math.random() * 6,
              vx: (Math.random() - 0.5) * 1.6,
              vy: -1.2 - Math.random() * 2.8,
              born: ms,
              life: 450 + Math.random() * 650,
              hue: EMBER[(Math.random() * EMBER.length) | 0],
              px: 0,
              py: 0,
            });
        }

        // Embers: buoyant sparks with short trails and a flicker.
        ctx.lineCap = "round";
        for (const e of embers) {
          const k = (ms - e.born) / e.life;
          if (k >= 1) continue;
          alive++;
          e.px = e.x;
          e.py = e.y;
          e.vx += Math.sin((e.y + ms) * 0.02) * 0.05 * dt;
          e.vy -= 0.03 * dt;
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          ctx.globalAlpha = (1 - k) * (0.6 + Math.random() * 0.4);
          ctx.strokeStyle = e.hue;
          ctx.lineWidth = 1.6 * (1 - k * 0.6);
          ctx.beginPath();
          ctx.moveTo(e.px - e.vx * 2, e.py - e.vy * 2);
          ctx.lineTo(e.x, e.y);
          ctx.stroke();
        }

        // Motes: the card itself, pulled into the counter.
        for (const p of motes) {
          const local = ms - p.delay;
          if (local < 0) {
            alive++;
            continue;
          }
          const k = Math.min(1, local / p.life);
          if (k >= 1) continue;
          alive++;
          const e = smooth(k);
          const u = 1 - e;
          // The counter is aimed at where it is now, not where it was when the burn began (scrolls, layout shifts).
          const x1 = tr ? aim.x + (p.x1 - tx) : p.x1;
          const y1 = tr ? aim.y + (p.y1 - ty) : p.y1;
          let x = u * u * p.x0 + 2 * u * e * p.cx + e * e * x1;
          const y = u * u * p.y0 + 2 * u * e * p.cy + e * e * y1;
          x += Math.sin(p.seed + k * 9) * p.wob * (1 - k);
          ctx.globalAlpha = tr ? (k < 0.85 ? 1 : (1 - k) / 0.15) : 1 - k;
          ctx.fillStyle = p.color;
          const s = (p.size * (1 - k * 0.5)) / dpr;
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }

        // Afterglow: a lime bloom where the card stood, and a ring off the counter as the last motes land.
        if (alive === 0 && ms > CRACK_MS + SWEEP_MS && !endAt) endAt = ms;
        const tail = endAt ? (ms - endAt) / GLOW_MS : 0;
        const bloom = line >= 1 ? Math.max(0, 1 - (endAt ? tail : 0)) * 0.5 : line * 0.5;
        if (bloom > 0) {
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const rad = Math.max(r.width, r.height) * 0.75;
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
          g.addColorStop(0, `rgba(198,255,61,${0.35 * bloom})`);
          g.addColorStop(1, "rgba(198,255,61,0)");
          ctx.globalAlpha = 1;
          ctx.fillStyle = g;
          ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
        }
        if (tr && endAt && tail < 1) {
          ctx.globalAlpha = 1 - tail;
          ctx.strokeStyle = LIME;
          ctx.lineWidth = 2;
          ctx.shadowColor = LIME;
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.ellipse(tx, ty, tr.width / 2 + tail * 36, tr.height / 2 + tail * 22, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
      if (!ctx && !endAt && ms > CRACK_MS + SWEEP_MS) endAt = ms - GLOW_MS;
      if (!endAt || (ms - endAt) / GLOW_MS < 1) raf = requestAnimationFrame(frame);
      else {
        canvas.remove();
        resolve();
      }
    };
    raf = requestAnimationFrame(frame);
  });
  return { done, restore };
}

/** Burn crackle + falling hiss, via the shared sound bus (silent unless the visitor turned sound on). */
export function playBurnSound(): void {
  sfx("burn");
}
