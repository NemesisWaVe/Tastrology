/**
 * Constellation figures, shared by the live sky (Sky.tsx) and the printed receipt, so a love draws the same figure
 * everywhere. Deterministic from the love's display name.
 */

export const TAU = Math.PI * 2;

/** Small deterministic PRNG (mulberry32) seeded from a string. */
export function rng(seed: string) {
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

export interface FigureShape {
  stars: { x: number; y: number; m: number }[];
  edges: [number, number][];
  /** index of the brightest star */
  alpha: number;
  /** graticule arc start angle */
  arc: number;
}

/** 5–7 stars in a loose cluster, joined nearest-neighbour style, with one branch: reads as a figure, not a polygon. */
export function figureFor(id: string, size: number): FigureShape {
  const r = rng(id);
  const k = 5 + Math.floor(r() * 3);
  const stars = Array.from({ length: k }, () => ({ x: (r() - 0.5) * size * 2, y: (r() - 0.5) * size * 1.4, m: 0.35 + Math.pow(r(), 2) * 0.65 }));
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
    const from = used.size === Math.ceil(k / 2) ? Math.floor(r() * cur) : cur;
    edges.push([from, best]);
    used.add(best);
    cur = best;
  }
  const alpha = stars.reduce((bi, s, i) => (s.m > stars[bi].m ? i : bi), 0);
  stars[alpha].m = 1;
  return { stars, edges, alpha, arc: r() * TAU };
}
