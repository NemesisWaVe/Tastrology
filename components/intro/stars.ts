/**
 * The star layer, drawn on a 2D canvas over the mirror:
 *  - real constellations (d3-celestial lines, BSD-3, aligned to the ESO photo) that draw themselves on
 *  - "Tastrology" written the way a star chart writes it: ~60 stars of different brightness and colour
 *    at the letter strokes, joined by hairlines
 *  - the card frame, traced in light
 */
import BRIGHT from "./bright.json";
import CONS from "./constellations.json";
import { skyToScreen, type SkyView } from "./mirror";

type Con = { id: string; name: string; segs: number[][][] };
export type Rect = { x: number; y: number; w: number; h: number };
export const CARD_AR = 63 / 88;

const sst = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

// ---------- star sprite: a soft core, a halo, and (for bright stars) four faint diffraction spikes ----------
const SPR = 64;
const sprites = new Map<string, HTMLCanvasElement>();
function sprite(r: number, g: number, b: number, spikes: boolean) {
  const key = `${r},${g},${b},${spikes}`;
  let c = sprites.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = SPR;
  const x = c.getContext("2d")!;
  const m = SPR / 2;
  const halo = x.createRadialGradient(m, m, 0, m, m, m);
  halo.addColorStop(0, `rgba(255,255,255,1)`);
  halo.addColorStop(0.06, `rgba(${r},${g},${b},0.95)`);
  halo.addColorStop(0.2, `rgba(${r},${g},${b},0.28)`);
  halo.addColorStop(0.55, `rgba(${r},${g},${b},0.05)`);
  halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = halo;
  x.fillRect(0, 0, SPR, SPR);
  if (spikes) {
    x.globalCompositeOperation = "lighter";
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const gr = x.createLinearGradient(m - dx * m, m - dy * m, m + dx * m, m + dy * m);
      gr.addColorStop(0, `rgba(${r},${g},${b},0)`);
      gr.addColorStop(0.5, `rgba(255,255,255,0.55)`);
      gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      x.fillStyle = gr;
      if (dx) x.fillRect(0, m - 0.6, SPR, 1.2);
      else x.fillRect(m - 0.6, 0, 1.2, SPR);
    }
  }
  sprites.set(key, c);
  return c;
}
function star(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, a: number, rgb: [number, number, number], spikes = false) {
  if (a <= 0.003 || size <= 0) return;
  ctx.globalAlpha = Math.min(1, a);
  const s = sprite(rgb[0], rgb[1], rgb[2], spikes);
  ctx.drawImage(s, x - size / 2, y - size / 2, size, size);
}

// Real star colours from the photo are dim and muddy; push them towards their hue and lift them.
function tint(r: number, g: number, b: number): [number, number, number] {
  const m = Math.max(r, g, b, 1);
  const k = 255 / m;
  const mix = (v: number) => Math.round(Math.min(255, 150 + (v * k - 150) * 0.85));
  return [mix(r), mix(g), mix(b)];
}

// Stellar palette for the wordmark: blackbody-ish, mostly white, a few hot blues and warm ambers.
const PAL: [number, number, number][] = [[200, 215, 255], [235, 240, 255], [255, 250, 240], [255, 238, 205], [255, 214, 170], [255, 190, 140]];

export type Word = { pts: Float32Array; mag: Float32Array; col: Uint8Array; edges: Uint16Array; order: Float32Array; font: string; text: string; span: number; tw: number; base: number; x0: number };

/** Sample the wordmark into ~n star positions (card-local 0..1) and join them like a star chart. */
export function buildWord(family: string, n: number, text = "Tastrology"): Word {
  const fs = 200, pad = 30;
  const cv = document.createElement("canvas");
  const x0 = cv.getContext("2d", { willReadFrequently: true })!;
  const font = `italic 400 ${fs}px ${family}`;
  x0.font = font;
  const m = x0.measureText(text);
  const left = m.actualBoundingBoxLeft || 0, asc = m.actualBoundingBoxAscent || fs * 0.75, desc = m.actualBoundingBoxDescent || fs * 0.3;
  const tw = left + (m.actualBoundingBoxRight || m.width);
  const W = Math.ceil(tw + pad * 2), H = Math.ceil(asc + desc + pad * 2);
  cv.width = W;
  cv.height = H;
  const x = cv.getContext("2d", { willReadFrequently: true })!;
  x.font = font; // resizing the canvas reset the context, so set it again
  x.fillStyle = "#fff";
  x.fillText(text, pad + left, pad + asc);
  const d = x.getImageData(0, 0, W, H).data;
  // ink pixels that sit well inside a stroke (so stars land on the spine, not the edge)
  const ink: number[] = [];
  const at = (px: number, py: number) => d[((py * W + px) << 2) + 3] > 128;
  for (let py = 3; py < H - 3; py += 3)
    for (let px = 3; px < W - 3; px += 3) if (at(px, py) && at(px - 3, py) && at(px + 3, py) && at(px, py - 3) && at(px, py + 3)) ink.push(px, py);
  const M = ink.length / 2;
  // farthest-point sampling: even, chart-like spacing
  const pick: number[] = [];
  const dist = new Float32Array(M).fill(1e9);
  let cur = 0;
  for (let k = 0; k < Math.min(n, M); k++) {
    pick.push(cur);
    let best = 0, bi = 0;
    for (let i = 0; i < M; i++) {
      const dx = ink[i * 2] - ink[cur * 2], dy = ink[i * 2 + 1] - ink[cur * 2 + 1];
      const dd = dx * dx + dy * dy;
      if (dd < dist[i]) dist[i] = dd;
      if (dist[i] > best) {
        best = dist[i];
        bi = i;
      }
    }
    cur = bi;
  }
  const N = pick.length;
  const pts = new Float32Array(N * 2), mag = new Float32Array(N), col = new Uint8Array(N * 3), order = new Float32Array(N);
  const span = 0.84;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < N; k++) {
    const px = ink[pick[k] * 2], py = ink[pick[k] * 2 + 1];
    pts[k * 2] = 0.5 + ((px - W / 2) / tw) * span;
    pts[k * 2 + 1] = 0.5 + ((py - H / 2) / tw) * span * CARD_AR;
    mag[k] = Math.pow(rnd(), 3.2); // most faint, a few bright
    const c = PAL[Math.min(PAL.length - 1, Math.floor(Math.pow(rnd(), 1.4) * PAL.length))];
    col.set(c, k * 3);
    order[k] = (px / W) * 0.85 + rnd() * 0.15; // ignite roughly left to right
  }
  // minimum spanning tree, then drop the long jumps between letters
  const inT = new Uint8Array(N), best = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1);
  const e: number[] = [], len: number[] = [];
  best[0] = 0;
  for (let it = 0; it < N; it++) {
    let u = -1;
    for (let i = 0; i < N; i++) if (!inT[i] && (u < 0 || best[i] < best[u])) u = i;
    inT[u] = 1;
    if (from[u] >= 0) {
      e.push(from[u], u);
      len.push(Math.sqrt(best[u]));
    }
    for (let i = 0; i < N; i++) {
      if (inT[i]) continue;
      const dx = pts[i * 2] - pts[u * 2], dy = pts[i * 2 + 1] - pts[u * 2 + 1];
      const dd = dx * dx + dy * dy;
      if (dd < best[i]) {
        best[i] = dd;
        from[i] = u;
      }
    }
  }
  // keep only joins that run along the letter's own ink (no shortcuts across counters or between letters)
  const near = (qx: number, qy: number) => {
    for (let oy = -3; oy <= 3; oy += 3)
      for (let ox = -3; ox <= 3; ox += 3) {
        const X = Math.round(qx + ox), Y = Math.round(qy + oy);
        if (X >= 0 && Y >= 0 && X < W && Y < H && d[((Y * W + X) << 2) + 3] > 100) return true;
      }
    return false;
  };
  const along = (a: number, b: number) => {
    const ax = ink[pick[a] * 2], ay = ink[pick[a] * 2 + 1], bx = ink[pick[b] * 2], by = ink[pick[b] * 2 + 1];
    for (let k = 1; k < 8; k++) if (!near(ax + ((bx - ax) * k) / 8, ay + ((by - ay) * k) / 8)) return false;
    return true;
  };
  const med = [...len].sort((a, b) => a - b)[len.length >> 1] || 0;
  const keep: number[] = [];
  for (let i = 0; i < len.length; i++) if (len[i] < med * 2.4 && along(e[i * 2], e[i * 2 + 1])) keep.push(e[i * 2], e[i * 2 + 1]);
  // where the text's baseline sits in card-local units, for the glow pass
  const base = 0.5 + ((pad + asc - H / 2) / tw) * span * CARD_AR;
  const ox = 0.5 + ((pad + left - W / 2) / tw) * span; // text origin, card-local
  return { pts, mag, col, edges: new Uint16Array(keep), order, font: `italic 400 FSpx ${family}`, text, span, tw, base, x0: ox };
}

export type StarFrame = {
  w: number; h: number; t: number; view: SkyView;
  cons: number;   // 0..1 constellations drawn on
  consDim: number; // 0..1 how much they recede for the wordmark
  word: number;   // 0..1 wordmark ignition
  frame: number;  // 0..1 card frame traced
  fade: number;   // 0..1 overall layer opacity (dock handoff)
  twinkle: number; // 0..1 living-star layer
  shimmer?: number; // 0..1 the finished wordmark's held twinkle, before it docks
  card: Rect;
  mono: string;
  phone: boolean;
};

const CONS_LIST = CONS as Con[];
const BRIGHT_LIST = BRIGHT as number[][];
const FEATURED = new Set(["Sco", "Sgr", "Oph", "Lup", "CrA"]);

export function drawStars(ctx: CanvasRenderingContext2D, word: Word | null, f: StarFrame) {
  const { w, h, t, view } = f;
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  const k = f.phone ? 0.8 : 1;

  // ---- the photo's own brightest stars, alive: they scintillate in the sky and glint in the water ----
  const H0 = view.hz * h;
  const nB = f.phone ? 160 : BRIGHT_LIST.length; // brightest first
  for (let i = 0; i < nB; i++) {
    const [u, v, r, g, b] = BRIGHT_LIST[i];
    const [x, y] = skyToScreen(view, u, v, w, h);
    if (x < -20 || x > w + 20) continue;
    const rank = 1 - i / nB;
    // scintillation: mostly calm, with quick bright flickers
    const ph = i * 12.9898, sp = 0.6 + (i % 7) * 0.35;
    const tw = Math.pow(0.5 + 0.5 * Math.sin(t * sp + ph), 6) * 0.9 + 0.1 * (0.5 + 0.5 * Math.sin(t * 7.3 + ph * 3));
    const a = (0.25 + 0.75 * tw) * (0.35 + 0.65 * rank) * f.fade * f.twinkle;
    const size = (5 + rank * 9 + tw * 8) * k;
    const c = tint(r, g, b);
    if (y < H0 && y > -20) star(ctx, x, y, size, a, c, rank > 0.9 && tw > 0.6);
    const yw = H0 + (H0 - y) / 0.92; // where the water reflects it
    if (yw > H0 + 2 && yw < h + 20) star(ctx, x + Math.sin(t * 1.7 + i) * 1.5, yw, size * 0.8, a * 0.35, c);
  }

  // ---- real constellations ----
  if (f.cons > 0) {
    const show = f.cons * (1 - 0.75 * f.consDim) * f.fade;
    CONS_LIST.forEach((c, ci) => {
      const feat = FEATURED.has(c.id);
      const local = sst(ci * 0.05, ci * 0.05 + 0.5, f.cons);
      if (local <= 0) return;
      let cx = 0, cy = 0, cn = 0;
      for (const seg of c.segs) {
        const P = seg.map(([u, v]) => skyToScreen(view, u, v, w, h));
        // line draws on along the segment
        ctx.globalAlpha = show * (feat ? 0.55 : 0.28);
        ctx.strokeStyle = "rgba(200,220,255,0.9)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        const total = P.length - 1, upto = local * total;
        for (let i = 0; i <= Math.min(total, Math.floor(upto)); i++) {
          const [x, y] = P[i];
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const fl = Math.floor(upto);
        if (fl < total) {
          const fr = upto - fl;
          ctx.lineTo(P[fl][0] + (P[fl + 1][0] - P[fl][0]) * fr, P[fl][1] + (P[fl + 1][1] - P[fl][1]) * fr);
        }
        ctx.stroke();
        seg.forEach(([, , r, g, b], i) => {
          const [x, y] = P[i];
          cx += x;
          cy += y;
          cn++;
          const lit = sst(i / Math.max(1, total) - 0.05, i / Math.max(1, total) + 0.1, local);
          const bright = (r + g + b) / 765;
          const tw = 0.85 + 0.15 * Math.sin(t * (1.7 + i) + ci * 3.1);
          star(ctx, x, y, (10 + bright * 26) * k, show * lit * tw * (feat ? 1 : 0.7), tint(r, g, b), bright > 0.75 && feat);
        });
      }
      if (feat && cn) {
        ctx.globalAlpha = show * sst(0.45, 0.85, local) * 0.75;
        ctx.fillStyle = "rgb(190,205,235)";
        ctx.font = `500 ${f.phone ? 9 : 10}px ${f.mono}`;
        ctx.textAlign = "center";
        ctx.fillText(c.name.toUpperCase().split("").join(" "), cx / cn, cy / cn + 24);
      }
    });
  }

  // ---- the card frame: a luminous holo line, stitched with stars ----
  const R = f.card;
  if (f.frame > 0 && R.w > 0) {
    const rr = R.w * 0.055;
    const per = 2 * (R.w + R.h);
    const full = f.frame > 0.995;
    const holo = ctx.createLinearGradient(R.x, R.y, R.x + R.w, R.y + R.h);
    holo.addColorStop(0, "rgba(198,255,61,1)");
    holo.addColorStop(0.5, "rgba(143,216,255,1)");
    holo.addColorStop(1, "rgba(216,117,255,1)");
    const pass = (lw: number, a: number, blur: number, style: string | CanvasGradient) => {
      ctx.save();
      ctx.globalAlpha = a * f.fade;
      ctx.strokeStyle = style;
      ctx.lineWidth = lw;
      ctx.shadowColor = "rgba(170,200,255,0.9)";
      ctx.shadowBlur = blur;
      if (!full) ctx.setLineDash([per * f.frame, per * 2]);
      ctx.beginPath();
      ctx.roundRect(R.x, R.y, R.w, R.h, rr);
      ctx.stroke();
      ctx.restore();
    };
    pass(7, 0.16, 26, holo);
    pass(2.2, 0.45, 10, holo);
    pass(0.9, 0.95, 0, "rgba(245,248,255,1)");
    // stars stitched along the edge: they light as the trace reaches them, and keep twinkling
    const N = 30;
    for (let i = 0; i < N; i++) {
      const u = i / N;
      if (u > f.frame) break;
      const d = u * per;
      let x: number, y: number;
      if (d < R.w) [x, y] = [R.x + d, R.y];
      else if (d < R.w + R.h) [x, y] = [R.x + R.w, R.y + d - R.w];
      else if (d < 2 * R.w + R.h) [x, y] = [R.x + R.w - (d - R.w - R.h), R.y + R.h];
      else [x, y] = [R.x, R.y + R.h - (d - 2 * R.w - R.h)];
      const tw = Math.pow(0.5 + 0.5 * Math.sin(t * (1.3 + (i % 4) * 0.7) + i * 2.3), 3);
      star(ctx, x, y, (8 + tw * 10) * k, f.fade * (0.35 + 0.65 * tw), PAL[i % PAL.length]);
    }
    if (f.frame > 0.9) {
      const a = sst(0.9, 1, f.frame) * f.fade;
      for (const [x, y] of [[R.x, R.y], [R.x + R.w, R.y], [R.x + R.w, R.y + R.h], [R.x, R.y + R.h]]) {
        const tw = 0.8 + 0.2 * Math.sin(t * 2.1 + x * 0.01);
        star(ctx, x, y, 44 * k * tw, a, [235, 245, 255], true);
      }
    }
    const g = ctx.createRadialGradient(R.x + R.w * 0.35, R.y + R.h * 0.4, 0, R.x + R.w * 0.5, R.y + R.h * 0.5, R.w * 0.9);
    g.addColorStop(0, "rgba(140,110,255,0.10)");
    g.addColorStop(0.5, "rgba(198,255,61,0.04)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = f.fade * sst(0.3, 1, f.frame);
    ctx.fillStyle = g;
    ctx.fillRect(R.x, R.y, R.w, R.h);
  }

  // ---- the wordmark, as a constellation ----
  if (word && f.word > 0 && R.w > 0) {
    const N = word.mag.length;
    const px = (i: number) => R.x + word.pts[i * 2] * R.w, py = (i: number) => R.y + word.pts[i * 2 + 1] * R.h;
    const lit = (i: number) => sst(word.order[i] * 0.8, word.order[i] * 0.8 + 0.2, f.word);
    // the word itself, as a faint nebula the stars sit in (so the eye reads it before the stars resolve)
    const fsPx = (R.w * word.span) / word.tw * 200;
    ctx.save();
    ctx.globalAlpha = 0.16 * sst(0.25, 1, f.word) * f.fade;
    ctx.font = word.font.replace("FS", fsPx.toFixed(1));
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(200,215,255,1)";
    ctx.shadowColor = "rgba(160,140,255,0.9)";
    ctx.shadowBlur = fsPx * 0.25;
    ctx.fillText(word.text, R.x + word.x0 * R.w, R.y + word.base * R.h);
    ctx.restore();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(210,225,255,1)";
    ctx.lineWidth = 0.8;
    for (let j = 0; j < word.edges.length; j += 2) {
      const a = word.edges[j], b = word.edges[j + 1];
      const la = Math.min(lit(a), lit(b));
      if (la <= 0) continue;
      ctx.globalAlpha = la * 0.55 * f.fade;
      ctx.beginPath();
      ctx.moveTo(px(a), py(a));
      ctx.lineTo(px(a) + (px(b) - px(a)) * la, py(a) + (py(b) - py(a)) * la);
      ctx.stroke();
    }
    const base = R.w / 300;
    const sh = f.shimmer ?? 0;
    for (let i = 0; i < N; i++) {
      const L = lit(i);
      if (L <= 0) continue;
      const m = word.mag[i];
      const flare = 1 + 1.6 * Math.max(0, 1 - Math.abs(L - 0.6) * 3) * (1 - f.word * 0.5); // ignition flash
      // held: each star scintillates on its own beat, and a slow glint sweeps the word left to right
      const calm = 0.88 + 0.12 * Math.sin(t * (2 + (i % 5)) + i);
      const sc = Math.pow(0.5 + 0.5 * Math.sin(t * (1.1 + (i % 7) * 0.45) + i * 2.39), 4);
      const dx = word.pts[i * 2] - (((t * 0.32) % 1.5) - 0.25);
      const glint = Math.exp(-(dx * dx) / 0.006) * sh;
      const tw = calm * (1 - sh) + (0.62 + 0.38 * sc + 0.5 * glint) * sh;
      const size = (6 + m * 34) * base * flare * (1 + sh * (0.35 * sc + 0.9 * glint));
      star(ctx, px(i), py(i), size, Math.min(1.4, L * tw * f.fade * (0.75 + m * 0.4)), [word.col[i * 3], word.col[i * 3 + 1], word.col[i * 3 + 2]], m > 0.55 || glint > 0.5);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

type Drop = { x: number; y: number; t: number; amp: number; name?: string; user?: boolean };

/** The ripples carry taste: each named drop's love rides the near edge of its ring, and rings that meet are joined. */
export function drawDrops(ctx: CanvasRenderingContext2D, drops: Drop[], now: number, hz: number, mono: string, phone: boolean, fade: number, taps: { x: number; y: number; t: number }[] = []) {
  const named = drops.filter((d) => d.name);
  if ((!named.length && !taps.length) || fade <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const ring = (d: Drop) => {
    const age = now - d.t;
    return { age, rx: age * 260, ry: (age * 260) / 2.6, a: sst(0, 0.35, age) * (1 - sst(1.1, 1.8, age)) * fade };
  };
  // where two rings meet, a line of light joins their centres
  // each drop joins only the one before it: a single thread, not a mesh
  for (let i = 0; i + 1 < named.length; i++)
    for (let j = i + 1; j <= i + 1; j++) {
      const A = named[i], B = named[j], ra = ring(A), rb = ring(B);
      if (Math.hypot(B.x - A.x, (B.y - A.y) * 2.6) > ra.rx + rb.rx) continue;
      const a = Math.min(ra.a, rb.a);
      const gr = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
      gr.addColorStop(0, "rgba(198,255,61,0.9)");
      gr.addColorStop(1, "rgba(216,117,255,0.9)");
      ctx.globalAlpha = a * 0.4;
      ctx.strokeStyle = gr;
      ctx.lineWidth = 0.7;
      ctx.shadowColor = "rgba(198,255,61,0.8)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
      star(ctx, A.x, A.y, 26, a, [220, 255, 180], true);
      star(ctx, B.x, B.y, 26, a, [235, 200, 255], true);
    }
  // a visitor's drop sprouts its own little constellation: 5 stars in a jagged chain, drawn in ~0.35s
  for (const d of taps) {
    const age = now - d.t;
    const a = (1 - sst(3.6, 5, age)) * fade;
    if (a <= 0) continue;
    let seed = Math.floor(d.t * 1000) % 2147483646 || 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pts: [number, number][] = [[d.x, d.y]];
    let ang = rnd() * Math.PI * 2;
    for (let k = 0; k < 4; k++) {
      ang += (rnd() - 0.5) * 2.4; // sharp turns, like a real asterism
      const len = (phone ? 34 : 48) + rnd() * (phone ? 24 : 36);
      const [px, py] = pts[pts.length - 1];
      pts.push([px + Math.cos(ang) * len, py + Math.sin(ang) * len * 0.55]);
    }
    const prog = Math.min(1, age / 0.35) * 4; // stars find each other one by one
    ctx.globalAlpha = a;
    ctx.strokeStyle = "rgba(225,255,170,1)";
    ctx.lineWidth = 1.6;
    ctx.shadowColor = "rgba(198,255,61,1)";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k <= Math.min(4, Math.ceil(prog)); k++) {
      const fr = Math.min(1, prog - (k - 1));
      ctx.lineTo(pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * fr, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * fr);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    pts.forEach(([x, y], k) => {
      const on = sst(k - 0.2, k + 0.1, prog);
      const tw = 0.8 + 0.2 * Math.sin(now * (3 + k) + k);
      star(ctx, x, y, (k === 0 ? 52 : 30 + (k % 2) * 12) * tw, a * on, PAL[(k * 2) % PAL.length], true);
    });
  }
  ctx.font = `500 ${phone ? 10 : 11.5}px ${mono}`;
  ctx.textAlign = "center";
  for (const d of named) {
    const { rx, ry, a } = ring(d);
    if (a <= 0) continue;
    // a faint crest so the ring reads, then the name on its near edge
    ctx.globalAlpha = a * 0.22;
    ctx.strokeStyle = "rgba(200,225,255,1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(d.x, d.y, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    ctx.stroke();
    const ty = d.y + ry + 16;
    if (ty < hz + 8) continue;
    const floor = ctx.canvas.clientHeight - 120; // keep clear of the caption line
    ctx.globalAlpha = a * 0.92 * (1 - sst(floor - 40, floor, ty));
    ctx.fillStyle = "rgb(226,236,255)";
    ctx.fillText(d.name!.toLowerCase(), d.x, ty);
  }
  ctx.restore();
}
