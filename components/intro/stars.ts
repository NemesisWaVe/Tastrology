/**
 * The star layer, drawn on a 2D canvas over the mirror:
 *  - real constellations (d3-celestial lines, BSD-3, aligned to the ESO photo) that draw themselves on
 *  - "Tastrology" written the way a star chart writes it: ~60 stars of different brightness and colour
 *    at the letter strokes, joined by hairlines
 *  - the card frame, traced in light
 */
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

export type Word = { pts: Float32Array; mag: Float32Array; col: Uint8Array; edges: Uint16Array; order: Float32Array; font: string; text: string; span: number; tw: number; base: number };

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
  const med = [...len].sort((a, b) => a - b)[len.length >> 1] || 0;
  const keep: number[] = [];
  for (let i = 0; i < len.length; i++) if (len[i] < med * 2.1) keep.push(e[i * 2], e[i * 2 + 1]);
  // where the text's baseline sits in card-local units, for the glow pass
  const base = 0.5 + ((pad + asc - H / 2) / tw) * span * CARD_AR;
  return { pts, mag, col, edges: new Uint16Array(keep), order, font: `italic 400 FSpx ${family}`, text, span, tw, base };
}

export type StarFrame = {
  w: number; h: number; t: number; view: SkyView;
  cons: number;   // 0..1 constellations drawn on
  consDim: number; // 0..1 how much they recede for the wordmark
  word: number;   // 0..1 wordmark ignition
  frame: number;  // 0..1 card frame traced
  fade: number;   // 0..1 overall layer opacity (dock handoff)
  card: Rect;
  mono: string;
  phone: boolean;
};

const CONS_LIST = CONS as Con[];
const FEATURED = new Set(["Sco", "Sgr", "Oph", "Lup", "CrA"]);

export function drawStars(ctx: CanvasRenderingContext2D, word: Word | null, f: StarFrame) {
  const { w, h, t, view } = f;
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  const k = f.phone ? 0.8 : 1;

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

  // ---- the card frame, traced in light ----
  const R = f.card;
  if (f.frame > 0 && R.w > 0) {
    const rr = R.w * 0.055;
    const per = 2 * (R.w + R.h);
    ctx.save();
    ctx.globalAlpha = f.fade * 0.85;
    ctx.strokeStyle = "rgba(225,235,255,0.9)";
    ctx.lineWidth = 1;
    ctx.shadowColor = "rgba(198,255,61,0.55)";
    ctx.shadowBlur = 14;
    ctx.setLineDash([per * f.frame, per]);
    ctx.lineDashOffset = -per * 0.12;
    ctx.beginPath();
    ctx.roundRect(R.x, R.y, R.w, R.h, rr);
    ctx.stroke();
    ctx.restore();
    // a breath of nebula inside the frame
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
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(200,215,255,1)";
    ctx.shadowColor = "rgba(160,140,255,0.9)";
    ctx.shadowBlur = fsPx * 0.25;
    ctx.fillText(word.text, R.x + R.w / 2, R.y + word.base * R.h);
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
    for (let i = 0; i < N; i++) {
      const L = lit(i);
      if (L <= 0) continue;
      const m = word.mag[i];
      const flare = 1 + 1.6 * Math.max(0, 1 - Math.abs(L - 0.6) * 3) * (1 - f.word * 0.5); // ignition flash
      const tw = 0.88 + 0.12 * Math.sin(t * (2 + (i % 5)) + i);
      const size = (6 + m * 34) * base * flare;
      star(ctx, px(i), py(i), size, L * tw * f.fade * (0.75 + m * 0.4), [word.col[i * 3], word.col[i * 3 + 1], word.col[i * 3 + 2]], m > 0.55);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
