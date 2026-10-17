/**
 * Intro scene model + the 2D overlay renderer (stars, constellations, ring names, drops, the star card).
 * Camera: at height 1 above the pond (y = 0), looking along +z, pitched by `pitch` (radians, + = up).
 * Shares its projection with the shader in water.ts so overlay and water agree.
 */
import { MAX_RINGS } from "./water";
import { CARD_AR, outlinePoints, wordmarkPoints } from "./starText";

export type Rect = { x: number; y: number; w: number; h: number };
type Ring = { x: number; z: number; p: number; name: string };

export type Scene = {
  phone: boolean;
  w: number;
  h: number;
  tanH: number;
  p0: number; // starting pitch
  p1: number; // pitch after the look-up
  hHalf: number;
  n: number; // star count
  az: Float32Array;
  el: Float32Array;
  br: Float32Array;
  ph: Float32Array;
  tint: Uint8Array;
  dl: Float32Array; // stream delay 0..1
  tg: Int32Array; // target index or -1
  targets: Float32Array; // card-local u,v pairs
  nOutline: number;
  cons: number[][]; // constellation star index chains
  rings: Ring[];
  g1: [number, number];
  g2: [number, number];
  ringBuf: Float32Array;
  mono: string;
  gap: number; // wordmark dot pitch, in card widths
  sx: Float32Array; // per-frame screen positions (sky / reflection), reused
  sy: Float32Array;
  rx: Float32Array;
  ry: Float32Array;
};

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export { sstep, clamp01 };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const P = new Float32Array(2);
/** Project a camera-relative vector (direction or point) to CSS px. */
export function project(s: Scene, pitch: number, X: number, Y: number, Z: number, out = P): boolean {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const b = Y * cp - Z * sp, c = Y * sp + Z * cp;
  if (c <= 1e-4) return false;
  out[0] = ((X / c / (s.tanH * (s.w / s.h))) * 0.5 + 0.5) * s.w;
  out[1] = (0.5 - (b / c / s.tanH) * 0.5) * s.h;
  return true;
}

function unprojectToWater(s: Scene, pitch: number, fx: number, fy: number): [number, number] {
  const qx = (fx * 2 - 1) * (s.w / s.h) * s.tanH, qy = (1 - fy * 2) * s.tanH;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const dx = qx, dy = qy * cp + sp, dz = -qy * sp + cp;
  const t = 1 / Math.max(1e-3, -dy);
  return [dx * t, dz * t];
}

export const horizonY = (s: Scene, pitch: number) => (0.5 + (Math.tan(pitch) / s.tanH) * 0.5) * s.h;

export function buildScene(w: number, h: number, names: string[], mono: string): Scene {
  const phone = w < 768;
  const vHalf = ((phone ? 64 : 50) / 2) * (Math.PI / 180);
  const tanH = Math.tan(vHalf);
  const p0 = (phone ? -22 : -12) * (Math.PI / 180);
  const p1 = p0 + (phone ? 58 : 60) * (Math.PI / 180);
  const hHalf = Math.atan(tanH * (w / h));
  const n = phone ? 720 : 900; // phone needs ~600 for a legible wordmark
  const r = rng(7);
  const s: Scene = {
    phone, w, h, tanH, p0, p1, hHalf, n,
    az: new Float32Array(n), el: new Float32Array(n), br: new Float32Array(n), ph: new Float32Array(n),
    tint: new Uint8Array(n), dl: new Float32Array(n), tg: new Int32Array(n).fill(-1),
    targets: new Float32Array(0), nOutline: 0, cons: [], rings: [],
    g1: [0, 0], g2: [0, 0], ringBuf: new Float32Array(MAX_RINGS * 4), mono, gap: 0.015,
    sx: new Float32Array(n), sy: new Float32Array(n), rx: new Float32Array(n), ry: new Float32Array(n),
  };
  const elMax = p1 + vHalf, hi = vHalf - p0 - 0.05;
  const hy = horizonY(s, p0) / h;
  /** Sky direction (az, el) whose reflection lands at screen fraction (fx, fy) at the start pitch. */
  const mirrorDir = (fx: number, fy: number): [number, number] => {
    const qx = (fx * 2 - 1) * (w / h) * tanH, qy = (1 - fy * 2) * tanH;
    const dx = qx, dy = qy * Math.cos(p0) + Math.sin(p0), dz = -qy * Math.sin(p0) + Math.cos(p0);
    return [Math.atan2(dx, dz), Math.asin(Math.min(1, -dy / Math.hypot(dx, dy, dz)))];
  };

  // Constellations first (bright, chained), then the field.
  const nRings = phone ? 4 : 8;
  const K = nRings - 1;
  let i = 0;
  for (let k = 0; k < K; k++) {
    // anchored in the visible water band (upper-middle of the pond), central 70% of the width
    const [caz, cel0] = mirrorDir(0.15 + (0.7 * (k + 0.25 + r() * 0.5)) / K, hy + (1 - hy) * (0.16 + r() * 0.4));
    const cel = Math.max(0.05, cel0);
    const m = phone ? 4 : 5 + ((r() * 2) | 0);
    const ids: number[] = [];
    for (let j = 0; j < m && i < n; j++, i++) {
      const a = r() * Math.PI * 2, d = 0.03 + r() * (phone ? 0.07 : 0.09);
      s.az[i] = caz + (Math.cos(a) * d) / Math.cos(cel);
      s.el[i] = Math.max(0.03, cel + Math.sin(a) * d * 0.8);
      s.br[i] = 0.8 + r() * 0.2;
      ids.push(i);
    }
    // nearest-neighbour walk gives a believable chain
    const chain = [ids[0]], left = ids.slice(1);
    while (left.length) {
      const last = chain[chain.length - 1];
      let bi = 0, bd = 1e9;
      left.forEach((q, qi) => {
        const d = (s.az[q] - s.az[last]) ** 2 + (s.el[q] - s.el[last]) ** 2;
        if (d < bd) {
          bd = d;
          bi = qi;
        }
      });
      chain.push(left.splice(bi, 1)[0]);
    }
    s.cons.push(chain);
  }
  for (; i < n; i++) {
    s.az[i] = (r() * 2 - 1) * hHalf * 1.15;
    s.el[i] = 0.03 + Math.pow(r(), 0.85) * (elMax - 0.03);
    s.br[i] = 0.18 + Math.pow(r(), 2.2) * 0.75;
  }
  for (let j = 0; j < n; j++) {
    s.ph[j] = r() * 6.283;
    const q = r();
    s.tint[j] = q < 0.1 ? 1 : q < 0.18 ? 2 : 0;
    s.dl[j] = r();
  }

  // Ring sources: screen spots at the starting pitch, central 70% of the width, inside the water band.
  const spots: [number, number][] = phone
    ? [[0.5, 0.5], [0.32, 0.3], [0.66, 0.66], [0.42, 0.8]]
    : [[0.5, 0.55], [0.3, 0.35], [0.7, 0.42], [0.4, 0.72], [0.6, 0.25], [0.24, 0.58], [0.76, 0.7], [0.52, 0.82]];
  for (let k = 0; k < nRings; k++) {
    const [fx, fb] = spots[k];
    const fy = hy + fb * (0.88 - hy);
    const [x, z] = unprojectToWater(s, p0, fx, fy);
    s.rings.push({ x, z, p: k === 0 ? -1 : 0.03 + ((k - 1) / Math.max(1, nRings - 2)) * 0.23, name: k === 0 ? "" : names[(k - 1) % names.length] });
  }

  s.g1 = [hHalf * 0.38, Math.max(0.12, Math.min(hi - 0.1, 0.42))];
  s.g2 = [-hHalf * 0.42, p1 + vHalf * 0.3];
  return s;
}

/** Assign card targets (outline + wordmark). Safe to call again once fonts load. */
export function buildTargets(s: Scene, serif: string) {
  const nO = s.phone ? 110 : 200;
  const { pts: word, gap } = wordmarkPoints(s.phone ? 580 : 560, serif, s.phone ? 0.88 : 0.8, "Tastrology", s.phone ? 0.02 : 0.045);
  s.gap = gap;
  const out = outlinePoints(nO);
  const t = new Float32Array(out.length + word.length);
  t.set(out);
  t.set(word, out.length);
  s.targets = t;
  s.nOutline = nO;
  const nt = Math.min(s.n, t.length / 2);
  // Sort stars and targets left-to-right so streams cross as little as possible.
  const stars = Array.from({ length: s.n }, (_, i) => i)
    .sort((a, b) => s.br[b] - s.br[a])
    .slice(0, nt)
    .sort((a, b) => s.az[a] - s.az[b]);
  // more targets than stars: keep the whole outline, thin the wordmark evenly (never drop its bottom rows)
  const nT = t.length / 2, keepW = Math.max(0, nt - nO), nW = nT - nO;
  const pick = Array.from({ length: Math.min(nt, nO) }, (_, i) => i);
  for (let k = 0; k < keepW; k++) pick.push(nO + Math.floor((k * nW) / keepW));
  const tg = pick.sort((a, b) => t[a * 2] - t[b * 2]);
  s.tg.fill(-1);
  for (let k = 0; k < nt; k++) s.tg[stars[k]] = tg[k];
}

// ---------- sprites ----------
const sprites: HTMLCanvasElement[] = [];
function sprite(i: number) {
  if (sprites[i]) return sprites[i];
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const x = c.getContext("2d")!;
  const col = ["243,241,236", "198,255,61", "216,117,255"][i];
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, `rgba(255,255,255,1)`);
  g.addColorStop(0.18, `rgba(${col},0.9)`);
  g.addColorStop(0.45, `rgba(${col},0.18)`);
  g.addColorStop(1, `rgba(${col},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  return (sprites[i] = c);
}

export type FrameState = {
  p: number; // scroll progress 0..1
  t: number; // seconds since mount
  cold: number; // seconds into the cold open
  pitch: number;
  calm: number;
  card: Rect;
  gl: boolean; // false → also paint the 2D pond
  bg: number; // background opacity (fallback pond)
  fade: number;
};

const easeBack = (x: number) => {
  const c = 1.4;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

/** Ring state into s.ringBuf (x, z, radius, amp); returns it for the shader. */
export function ringState(s: Scene, p: number, cold: number, calm: number) {
  const R = s.phone ? 1.5 : 2.6;
  for (let k = 0; k < MAX_RINGS; k++) {
    const g = s.rings[k];
    let amp = 0, rad = 0;
    if (g) {
      const u = g.p < 0 ? (cold - 0.95) / 5 : (p - g.p) / 0.2;
      if (u > 0 && u < 1) {
        amp = Math.pow(1 - u, 1.4) * (1 - calm);
        rad = 0.06 + u * R;
      }
    }
    s.ringBuf.set([g?.x ?? 0, g?.z ?? 0, rad, amp], k * 4);
  }
  return s.ringBuf;
}

function slopeAt(s: Scene, x: number, z: number, out: Float32Array) {
  let gx = 0, gz = 0, sum = 0, mx = 0;
  const b = s.ringBuf;
  for (let k = 0; k < MAX_RINGS; k++) {
    const a = b[k * 4 + 3];
    if (a <= 0) continue;
    const dx = x - b[k * 4], dz = z - b[k * 4 + 1];
    const d = Math.hypot(dx, dz) + 1e-4, q = d - b[k * 4 + 2];
    const env = Math.exp(-q * q * 14), w = a * env, c = Math.cos(q * 26) * w;
    gx += (dx / d) * c;
    gz += (dz / d) * c;
    sum += env * a;
    mx = Math.max(mx, env * a);
  }
  out[0] = gx;
  out[1] = gz;
  return Math.min(1, sum - mx);
}

const Q = new Float32Array(2), G = new Float32Array(2);

export function draw(ctx: CanvasRenderingContext2D, s: Scene, f: FrameState) {
  const { p, t, pitch, card } = f;
  const { w, h } = s;
  ctx.clearRect(0, 0, w, h);
  const hy = horizonY(s, pitch);
  const look = sstep(0.52, 0.72, p);

  if (!f.gl) paintPond(ctx, s, f, hy);

  const streamA = sstep(0.71, 0.73, p); // beat 4 begins
  const cardFade = 1 - sstep(0.985, 1, p);
  const reflA = (0.7 + 0.3 * f.calm) * (1 - look * 0.6);
  const lineA = (0.3 + 0.4 * sstep(0.3, 0.45, p)) * (1 - sstep(0.72, 0.77, p));
  const shimmer = 0.2 + 0.45 * sstep(0.52, 0.66, p) * (1 - sstep(0.72, 0.77, p));
  const unpicked = 1 - sstep(0.72, 0.77, p);
  const scale = s.phone ? 1 : Math.min(1.25, h / 820);
  const { sx, sy, rx, ry } = s;

  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < s.n; i++) {
    const ce = Math.cos(s.el[i]), se = Math.sin(s.el[i]);
    const X = Math.sin(s.az[i]) * ce, Z = Math.cos(s.az[i]) * ce;
    const tw = 1 - shimmer + shimmer * (0.5 + 0.5 * Math.sin(t * (1.4 + s.ph[i] * 0.4) + s.ph[i] * 3));
    const base = s.br[i] * f.fade;
    const spr = sprite(s.tint[i]);
    const sz = (2.2 + s.br[i] * 4.6) * scale;
    sx[i] = sy[i] = rx[i] = ry[i] = NaN;

    // reflection (below the horizon)
    if (p < 0.73 && project(s, pitch, X, -se, Z, Q) && Q[1] > hy) {
      const ov = slopeAt(s, X / se, Z / se, G);
      // crisp mirror; it only wobbles where a ring passes
      const jx = G[0] * 22 * scale, jy = G[1] * 12 * scale;
      rx[i] = Q[0] + jx;
      ry[i] = Q[1] + jy;
      const a = base * reflA * (1 + ov * 3) * tw;
      if (a > 0.01) {
        const z = sz * (1 + Math.min(0.6, Math.hypot(G[0], G[1]) * 2));
        ctx.globalAlpha = Math.min(1, a);
        ctx.drawImage(spr, rx[i] - z / 2, ry[i] - z / 2, z, z);
      }
    }

    // real sky (above the horizon) and, in beat 4, the stream into the card
    let vis = project(s, pitch, X, se, Z, Q) && Q[1] < hy;
    let x = Q[0], y = Q[1], a = base * (0.3 + 0.75 * look) * tw, z = sz;
    const tgi = s.tg[i];
    if (streamA > 0 && tgi >= 0 && s.targets.length) {
      const l = clamp01((p - 0.72 - s.dl[i] * 0.04) / 0.05);
      if (l > 0) {
        if (!vis) {
          // stars below the frame fly in from under it
          if (!project(s, pitch, X, se, Z, Q)) {
            Q[0] = w / 2;
            Q[1] = h * 1.2;
          }
          x = Q[0];
          y = Q[1];
          a = base * 0.5;
        }
        const tx = card.x + s.targets[tgi * 2] * card.w, ty = card.y + s.targets[tgi * 2 + 1] * card.h;
        // curved path; easeBack lets the dot overshoot a hair and spring back
        const e = easeBack(l), k = 1 - e;
        const cx = (x + tx) / 2 + (ty - y) * 0.18, cy = (y + ty) / 2 - (tx - x) * 0.18;
        x = k * k * x + 2 * k * e * cx + e * e * tx;
        y = k * k * y + 2 * k * e * cy + e * e * ty;
        // dot size follows the card (and the wordmark's own sampling pitch) so it stays legible small
        const word = tgi >= s.nOutline;
        const dot = word ? Math.max(1.8, card.w * s.gap * 1.9) : Math.max(2.4, card.w * 0.03);
        z = z + (dot - z) * l;
        a = (a + (0.95 - a) * l) * cardFade;
        vis = true;
        if (word && l > 0.85 && a > 0.05) {
          // a crisp core under the glow keeps the letters sharp
          const c = Math.max(1, card.w * s.gap * 0.5);
          ctx.globalAlpha = Math.min(1, a) * (l - 0.85) / 0.15;
          ctx.fillStyle = "rgb(243,241,236)";
          ctx.fillRect(x - c / 2, y - c / 2, c, c);
        }
      }
    } else if (streamA > 0) a *= unpicked;
    if (vis && a > 0.01) {
      sx[i] = x;
      sy[i] = y;
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(spr, x - z / 2, y - z / 2, z, z);
    }
  }

  // constellation lines, revealed one per drop
  ctx.globalCompositeOperation = "source-over";
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = "rgb(220,228,255)";
  s.cons.forEach((ch, k) => {
    const g = s.rings[k + 1];
    const rev = g ? sstep(g.p + 0.03, g.p + 0.08, p) : 1;
    const a = rev * lineA * f.fade;
    if (a < 0.01) return;
    for (const [X, Y, A] of [[rx, ry, a * 0.7], [sx, sy, a * (0.6 + look)]] as const) {
      ctx.globalAlpha = Math.min(1, A);
      ctx.beginPath();
      let on = false;
      for (const q of ch) {
        if (Number.isNaN(X[q])) {
          on = false;
          continue;
        }
        if (on) ctx.lineTo(X[q], Y[q]);
        else ctx.moveTo(X[q], Y[q]);
        on = true;
      }
      ctx.stroke();
    }
  });

  drawDrops(ctx, s, f);
  drawNames(ctx, s, f);
  if (p > 0.73) drawCard(ctx, card, p, cardFade);
  ctx.globalAlpha = 1;
}

function paintPond(ctx: CanvasRenderingContext2D, s: Scene, f: FrameState, hy: number) {
  const { w, h } = s;
  ctx.globalAlpha = f.bg * f.fade;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  const k = Math.min(1, Math.max(0, hy / h));
  g.addColorStop(0, "#05060d");
  g.addColorStop(Math.max(0, k - 0.001), "#1b1733");
  g.addColorStop(Math.min(1, k + 0.001), "#0d1d24");
  g.addColorStop(1, "#05070f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgb(198,255,61)";
  ctx.lineWidth = 1;
  const b = s.ringBuf;
  for (let r = 0; r < MAX_RINGS; r++) {
    const a = b[r * 4 + 3];
    if (a <= 0) continue;
    for (let j = 0; j < 3; j++) {
      const rad = b[r * 4 + 2] - j * 0.22;
      if (rad <= 0) continue;
      ctx.globalAlpha = Math.min(1, a * 0.6 * (1 - j * 0.3) * f.fade);
      ctx.beginPath();
      for (let q = 0; q <= 48; q++) {
        const an = (q / 48) * Math.PI * 2;
        if (project(s, f.pitch, b[r * 4] + Math.cos(an) * rad, -1, b[r * 4 + 1] + Math.sin(an) * rad, Q)) {
          if (q) ctx.lineTo(Q[0], Q[1]);
          else ctx.moveTo(Q[0], Q[1]);
        }
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** A falling lime drop (k: 0..1 of the fall) and its splash (sk: 0..1 after impact). */
function drawDrop(ctx: CanvasRenderingContext2D, s: Scene, f: FrameState, g: { x: number; z: number }, k: number, sk: number) {
  if (!project(s, f.pitch, g.x, -1, g.z, Q)) return;
  const ix = Q[0], iy = Q[1];
  if (!Number.isFinite(ix) || !Number.isFinite(iy)) return;
  ctx.globalAlpha = f.fade;
  if (k > 0 && k < 1) {
    const y = -40 + (iy + 40) * k * k, len = 26 + 60 * k;
    const gr = ctx.createLinearGradient(0, y - len, 0, y);
    gr.addColorStop(0, "rgba(198,255,61,0)");
    gr.addColorStop(1, "rgba(220,255,140,1)");
    ctx.strokeStyle = gr;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ix, y - len);
    ctx.lineTo(ix, y);
    ctx.stroke();
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(sprite(1), ix - 12, y - 12, 24, 24);
    ctx.drawImage(sprite(0), ix - 4, y - 4, 8, 8);
    ctx.globalCompositeOperation = "source-over";
  }
  if (sk > 0 && sk < 1) {
    // flash + a little crown of droplets thrown up and falling back
    ctx.globalCompositeOperation = "lighter";
    const fl = 1 - sk, sc = s.phone ? 0.8 : 1;
    ctx.globalAlpha = f.fade * fl;
    const z = 70 * sc * (0.4 + sk);
    ctx.drawImage(sprite(1), ix - z / 2, iy - z / 4, z, z / 2);
    for (let j = 0; j < 9; j++) {
      const an = Math.PI * (0.12 + (0.76 * j) / 8), v = (0.7 + ((j * 7) % 5) * 0.12) * sc;
      const x = ix + Math.cos(an) * 34 * v * sk * (j % 2 ? 1 : -1);
      const y = iy - Math.sin(an) * 46 * v * sk + 70 * sk * sk;
      if (y > iy + 2) continue;
      ctx.globalAlpha = f.fade * fl;
      ctx.drawImage(sprite(1), x - 3, y - 3, 6, 6);
    }
    ctx.globalCompositeOperation = "source-over";
  }
}

function drawDrops(ctx: CanvasRenderingContext2D, s: Scene, f: FrameState) {
  s.rings.forEach((g, k) => {
    if (k === 0) drawDrop(ctx, s, f, g, (f.cold - 0.35) / 0.6, (f.cold - 0.95) / 0.6);
    else drawDrop(ctx, s, f, g, (f.p - (g.p - 0.028)) / 0.028, (f.p - g.p) / 0.03);
  });
}

/** Each love's name rides the front arc of its ring, then fades as the ring widens. */
function drawNames(ctx: CanvasRenderingContext2D, s: Scene, f: FrameState) {
  ctx.font = `500 ${s.phone ? 10 : 11}px ${s.mono}`;
  ctx.fillStyle = "rgb(243,241,236)";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const b = s.ringBuf;
  s.rings.forEach((g, k) => {
    if (!g.name) return;
    const amp = b[k * 4 + 3], rad = b[k * 4 + 2];
    if (amp <= 0) return;
    const u = (f.p - g.p) / 0.2;
    const a = sstep(0.02, 0.1, u) * (1 - sstep(0.45, 0.8, u)) * f.fade * (1 - f.calm);
    if (a < 0.02) return;
    ctx.globalAlpha = a * 0.85;
    const text = g.name;
    const ws = Array.from(text, (c) => ctx.measureText(c).width + 1.2);
    const total = ws.reduce((x, y) => x + y, 0);
    const pt = (an: number) => (project(s, f.pitch, g.x + Math.cos(an) * rad, -1, g.z + Math.sin(an) * rad, Q) ? [Q[0], Q[1]] : null);
    // walk the arc from the front point (angle -π/2) back by half the text, in screen arc length
    const step = (an: number, dist: number) => {
      const a0 = pt(an), a1 = pt(an + 0.01);
      if (!a0 || !a1) return an;
      const ds = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) / 0.01;
      return an + dist / Math.max(1e-3, ds);
    };
    // keep the label inside the viewport with 16px gutters
    const front = pt(-Math.PI / 2);
    if (!front) return;
    const cx = Math.min(Math.max(front[0], 16 + total / 2), s.w - 16 - total / 2);
    ctx.globalAlpha = a * 0.85 * (1 - sstep(s.h - 40, s.h - 16, front[1]));
    let an = step(-Math.PI / 2, cx - front[0] - total / 2);
    for (let c = 0; c < ws.length; c++) {
      const mid = step(an, ws[c] / 2), q0 = pt(mid), q1 = pt(mid + 0.01);
      if (q0 && q1) {
        ctx.save();
        ctx.translate(q0[0], q0[1] + 4);
        ctx.rotate(Math.atan2(q1[1] - q0[1], q1[0] - q0[0]));
        ctx.fillText(text[c], 0, 0);
        ctx.restore();
      }
      an = step(an, ws[c]);
    }
  });
}

export function roundRect(ctx: CanvasRenderingContext2D, r: Rect) {
  const k = r.w * 0.055;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, k);
}

function drawCard(ctx: CanvasRenderingContext2D, r: Rect, p: number, fade: number) {
  const settle = sstep(0.78, 0.81, p) * fade;
  if (settle <= 0) return;
  roundRect(ctx, r);
  ctx.globalAlpha = settle * 0.22;
  ctx.fillStyle = "#0e0e13";
  ctx.fill();
  ctx.globalAlpha = settle * 0.35;
  ctx.strokeStyle = "rgb(243,241,236)";
  ctx.lineWidth = 1;
  ctx.stroke();
  // one foil sheen sweeps the card
  const k = (p - 0.8) / 0.06;
  if (k > 0 && k < 1) {
    ctx.save();
    roundRect(ctx, r);
    ctx.clip();
    const x = r.x - r.w + k * r.w * 3;
    const g = ctx.createLinearGradient(x - r.w * 0.5, r.y, x + r.w * 0.5, r.y + r.h);
    ["#ff777300", "#ffed5f66", "#a8ff5f80", "#83fff780", "#7894ff66", "#d875ff00"].forEach((c, i) => g.addColorStop(i / 5, c));
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.55 * fade * Math.sin(k * Math.PI);
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  }
}

/** The centred "birth" rect for the card (before docking). */
export function birthRect(s: Scene): Rect {
  let cw = s.phone ? s.w * 0.78 : (s.h * 0.6) * CARD_AR;
  let ch = cw / CARD_AR;
  if (ch > s.h * 0.72) {
    ch = s.h * 0.72;
    cw = ch * CARD_AR;
  }
  return { x: (s.w - cw) / 2, y: s.h * 0.45 - ch / 2, w: cw, h: ch };
}
