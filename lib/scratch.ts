/**
 * Scratch-off foil for sealed brands (components/deck/ScratchReveal.tsx): the foil each love wears, how much of it is
 * gone, the path the automatic scratch takes, and the streak that walks the completion chime up the scale. Pure
 * functions plus one small canvas painter; no dependencies.
 */

export type Material = "silver" | "gold" | "carbon" | "holo";
export type Pattern =
  "brushed" | "guilloche" | "hex" | "etch" | "weave" | "prism";

export const FOILS: { pattern: Pattern; material: Material }[] = [
  { pattern: "brushed", material: "silver" },
  { pattern: "guilloche", material: "gold" },
  { pattern: "hex", material: "silver" },
  { pattern: "etch", material: "silver" },
  { pattern: "weave", material: "carbon" },
  { pattern: "prism", material: "holo" },
];

/** FNV-1a, so the same love always wears the same foil. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Each love has its own foil (pattern and the sound of it), so your loves become familiar by feel and ear. */
export const foilFor = (loveId: string) =>
  FOILS[hash(`foil|${loveId}`) % FOILS.length];

/** ISO week number, for the weekly rare foil. */
export function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${w}`;
}

/** About one brand in twelve wears a shimmer foil this week. Cosmetic and fixed by the brand and week: never a prize. */
export const rareFoil = (brandId: string, week = isoWeek()) =>
  hash(`rare|${brandId}|${week}`) % 12 === 0;

/** Stronger pulls wear thicker foil: it takes a little more scratching to clear. */
export const thresholdFor = (strength: number) =>
  0.5 + 0.1 * Math.min(1, Math.max(0, strength));

/**
 * What's been scratched off, on a grid of `cell`-px squares. Two zones (the logo on the left of `split`, the name to
 * its right) so a scratch only completes once both have been worked, not just one corner.
 */
export class Coverage {
  readonly cols: number;
  readonly rows: number;
  private hit: Uint8Array;
  private n = 0;
  private nz = [0, 0];
  private tz = [0, 0];
  constructor(
    readonly w: number,
    readonly h: number,
    readonly split = 0,
    readonly cell = 8,
  ) {
    this.cols = Math.max(1, Math.ceil(w / cell));
    this.rows = Math.max(1, Math.ceil(h / cell));
    this.hit = new Uint8Array(this.cols * this.rows);
    for (let c = 0; c < this.cols; c++) this.tz[this.zone(c)] += this.rows;
  }
  private zone(c: number) {
    return this.split > 0 && (c + 0.5) * this.cell < this.split ? 0 : 1;
  }
  /** Mark the cells whose centres fall inside a circle. */
  stamp(x: number, y: number, r: number) {
    const c0 = Math.max(0, Math.floor((x - r) / this.cell));
    const c1 = Math.min(this.cols - 1, Math.floor((x + r) / this.cell));
    const r0 = Math.max(0, Math.floor((y - r) / this.cell));
    const r1 = Math.min(this.rows - 1, Math.floor((y + r) / this.cell));
    for (let c = c0; c <= c1; c++)
      for (let rr = r0; rr <= r1; rr++) {
        const cx = (c + 0.5) * this.cell - x;
        const cy = (rr + 0.5) * this.cell - y;
        if (cx * cx + cy * cy > r * r) continue;
        const k = rr * this.cols + c;
        if (this.hit[k]) continue;
        this.hit[k] = 1;
        this.n++;
        this.nz[this.zone(c)]++;
      }
  }
  get total() {
    return this.n / this.hit.length;
  }
  /** Share cleared in each zone; a zone with no cells counts as done. */
  get zones(): [number, number] {
    return [
      this.tz[0] ? this.nz[0] / this.tz[0] : 1,
      this.tz[1] ? this.nz[1] / this.tz[1] : 1,
    ];
  }
  /** Enough gone overall, and each zone at least worked. */
  done(threshold: number) {
    const [a, b] = this.zones;
    return this.total >= threshold && a >= 0.35 && b >= 0.35;
  }
}

/** One point of the automatic scratch: where the fingertip is at time t (ms), and whether it's pressing. */
export type PathPt = { t: number; x: number; y: number; down: boolean };

/**
 * The automatic scratch, choreographed to read like a person doing it (about 3.4s): the fingertip arrives, hatches
 * the logo in three diagonal strokes, holds a beat, zigzags across the name (the first letters a little slower, the
 * pace breathing), then one quick clean-up swipe.
 */
export function autoPath(w: number, h: number, split: number): PathPt[] {
  const pts: PathPt[] = [];
  const pad = 4;
  let t = 0;
  const at = (x: number, y: number, down: boolean) =>
    pts.push({ t, x, y, down });
  at(pad, h / 2, false);
  t = 250;
  // logo: three diagonal hatches
  const L = Math.max(split, 24);
  for (let k = 0; k < 3; k++) {
    const x0 = pad + (k * (L - pad * 2)) / 3;
    at(x0, pad, false);
    t += 1;
    at(x0, pad, true);
    t += 200;
    at(Math.min(L, x0 + L * 0.55), h - pad, true);
    t += 1;
    at(Math.min(L, x0 + L * 0.55), h - pad, false);
    t += 25;
  }
  t += 120; // a beat: the logo is out
  // name: zigzag, ~11px per half-stroke, overshooting the edges a little
  const x0 = L - 2;
  const span = Math.max(20, w - x0);
  const dur = Math.min(2000, Math.max(1200, span * 8));
  const segs = Math.max(4, Math.ceil(span / 11));
  at(x0, -4, false);
  t += 1;
  at(x0, -4, true);
  const base = dur / segs;
  for (let s = 1; s <= segs; s++) {
    const slow = s <= 4 ? 1.3 : 1;
    const breath = 0.8 + 0.35 * Math.sin(s * 1.3);
    t += base * slow * breath;
    at(x0 + (span * s) / segs, s % 2 ? h + 4 : -4, true);
  }
  at(w, h / 2, false);
  t += 30;
  // clean-up swipe
  at(pad, h * 0.5, false);
  t += 1;
  at(pad, h * 0.5, true);
  t += 250;
  at(w - pad, h * 0.42, true);
  t += 1;
  at(w - pad, h * 0.42, false);
  return pts;
}

/** Where the fingertip is at time t along a path. */
export function pathAt(pts: PathPt[], t: number): PathPt {
  if (t <= pts[0].t) return pts[0];
  for (let i = 1; i < pts.length; i++) {
    const b = pts[i];
    if (t > b.t) continue;
    const a = pts[i - 1];
    const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    return {
      t,
      x: a.x + (b.x - a.x) * e,
      y: a.y + (b.y - a.y) * e,
      down: a.down && b.down,
    };
  }
  return pts[pts.length - 1];
}

/**
 * Scratches less than 20s apart climb the completion chime up the scale; a pause lets it fall back. Skill and rhythm,
 * never chance.
 */
let streak = { n: -1, at: 0 };
export function streakStep(now = Date.now()): number {
  streak = {
    n: now - streak.at < 20_000 ? Math.min(streak.n + 1, 9) : 0,
    at: now,
  };
  return streak.n;
}

/** A tiny buzz on phones that have it. */
export function buzz(p: number | number[]) {
  try {
    navigator.vibrate?.(p);
  } catch {}
}

const BASE: Record<Material, string[]> = {
  silver: ["#8d9099", "#d9dce3", "#9a9ea8", "#e7e9ee", "#7f838c"],
  gold: ["#8a6d2f", "#e6c77a", "#a8873f", "#f3dc9c", "#7a5f27"],
  carbon: ["#1c1d22", "#3b3d44", "#24262c", "#454852", "#191a1e"],
  holo: ["#9aa0ad", "#e3e6ee", "#b4b9c4", "#f0f2f6", "#8b909b"],
};

const seeded = (seed: number) => {
  let s = seed || 1;
  return () =>
    ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) ^ (s + 0x9e3779b9)) >>> 0) /
    4294967296;
};

/**
 * Paint a foil into a canvas context at CSS-pixel size w×h (the caller has scaled for DPR): metal gradient, the
 * love's pattern, a little grain, the brand's first letter embossed as a hint, a lit edge.
 */
export function paintFoil(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  o: {
    pattern: Pattern;
    material: Material;
    strength: number;
    letter: string;
    seed: number;
    rare: boolean;
    font?: string;
  },
) {
  const rnd = seeded(o.seed);
  const col = BASE[o.material];
  const lin = g.createLinearGradient(0, 0, w, h);
  col.forEach((c, i) => lin.addColorStop(i / (col.length - 1), c));
  g.fillStyle = lin;
  g.fillRect(0, 0, w, h);
  const ink = "255 255 255";
  const shade = o.material === "carbon" ? "0 0 0" : "40 40 50";
  const a = 0.7 + 0.6 * Math.min(1, Math.max(0, o.strength));
  g.save();
  switch (o.pattern) {
    case "brushed":
      for (let y = 0; y < h; y += 1) {
        g.fillStyle = `rgb(${rnd() < 0.5 ? ink : shade} / ${(0.04 + rnd() * 0.08) * a})`;
        g.fillRect(0, y, w, 1);
      }
      break;
    case "guilloche":
      g.lineWidth = 0.7;
      for (let k = 0; k < 16; k++) {
        g.strokeStyle = `rgb(${ink} / ${0.22 * a})`;
        g.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const y =
            h / 2 +
            Math.sin(x * 0.09 + k * 0.42) *
              (h * 0.36) *
              Math.cos(x * 0.013 + k * 0.2);
          if (x) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.stroke();
      }
      break;
    case "hex":
      for (let y = 2, r = 0; y < h; y += 3.5, r++)
        for (let x = r % 2 ? 2 : 4; x < w; x += 4) {
          g.fillStyle = `rgb(${shade} / ${0.22 * a})`;
          g.fillRect(x, y, 1.2, 1.2);
        }
      break;
    case "etch":
      for (let k = 0; k < (w * h) / 220; k++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const s = 1.5 + rnd() * 2.5;
        g.strokeStyle = `rgb(${ink} / ${(0.25 + rnd() * 0.25) * a})`;
        g.lineWidth = 0.6;
        g.beginPath();
        g.moveTo(x - s, y);
        g.lineTo(x + s, y);
        g.moveTo(x, y - s);
        g.lineTo(x, y + s);
        g.stroke();
      }
      break;
    case "weave":
      for (let y = 0; y < h; y += 4)
        for (let x = 0; x < w; x += 4) {
          const on = ((x + y) / 4) % 2 === 0;
          const gr = g.createLinearGradient(
            x,
            y,
            x + (on ? 4 : 0),
            y + (on ? 0 : 4),
          );
          gr.addColorStop(0, `rgb(255 255 255 / ${0.1 * a})`);
          gr.addColorStop(1, "rgb(0 0 0 / 0.15)");
          g.fillStyle = gr;
          g.fillRect(x, y, 4, 4);
        }
      break;
    case "prism":
      for (let x = -h; x < w; x += 7) {
        g.strokeStyle = `hsl(${(x * 2.2) % 360} 90% 70% / ${0.22 * a})`;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x, h);
        g.lineTo(x + h, 0);
        g.stroke();
      }
      break;
  }
  g.restore();
  if (o.rare) {
    const c = g.createLinearGradient(0, 0, w, 0);
    ["#ff9ad5", "#9ad7ff", "#c6ff3d", "#ffe08a", "#c79aff"].forEach((v, i) =>
      c.addColorStop(i / 4, v),
    );
    g.globalAlpha = 0.28;
    g.fillStyle = c;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 1;
  }
  // grain
  for (let k = 0; k < (w * h) / 40; k++) {
    g.fillStyle = rnd() < 0.5 ? "rgb(255 255 255 / 0.05)" : "rgb(0 0 0 / 0.05)";
    g.fillRect(rnd() * w, rnd() * h, 1, 1);
  }
  // the hint: the first letter, pressed into the foil
  if (o.letter) {
    g.font = `700 ${Math.round(h * 0.62)}px ${o.font || "system-ui, sans-serif"}`;
    g.textBaseline = "middle";
    const x = Math.min(w * 0.3, 64);
    g.fillStyle = "rgb(0 0 0 / 0.1)";
    g.fillText(o.letter, x + 1, h / 2 + 1);
    g.fillStyle = "rgb(255 255 255 / 0.14)";
    g.fillText(o.letter, x, h / 2);
  }
  // lit top edge, shaded bottom
  const edge = g.createLinearGradient(0, 0, 0, h);
  edge.addColorStop(0, "rgb(255 255 255 / 0.35)");
  edge.addColorStop(0.08, "rgb(255 255 255 / 0)");
  edge.addColorStop(0.9, "rgb(0 0 0 / 0)");
  edge.addColorStop(1, "rgb(0 0 0 / 0.25)");
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);
}
