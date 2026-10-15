import type { StyleResult } from "./types";

/**
 * Turns an agent result into a collectible card. Every number on the card is derived from
 * Qloo data in the result (affinities, popularity, contradictions, seed domains): nothing invented.
 */

export type Rarity = "common" | "rare" | "holo" | "secret";

export interface CardType {
  name: string;
  glyph: string;
  a: string; // primary colour
  b: string; // secondary colour
}

/** Taste "Big Three", each read from real Qloo data. */
export interface BigThree {
  sun: CardType; // main aesthetic: top consensus Qloo style tag
  moon: CardType; // hidden side: the contradiction lobe if any, else the next consensus tag
  rising: CardType; // how you come across: Qloo's personal_style of your top brands
  moonIsContradiction: boolean;
}

export interface CardData {
  bigThree: BigThree;
  archetype: string;
  flavor: string;
  power: number; // headline number, avg affinity of the signature brands × 100
  types: CardType[];
  dual: boolean;
  rarity: Rarity;
  rarityLabel: string;
  serial: string;
  moves: { name: string; value: number; note: string }[];
  stats: { label: string; value: number }[];
  weakness?: string;
  ignores?: string;
  evolvesFrom: { name: string; kind: string; image?: string }[];
  art: string[]; // seed images (proxied), for the art window collage
  /** Constellation for the art window: one star per seed (0-1 coords), size = how much it drives your brands (Qloo explainability). */
  stars: { name: string; kind: string; x: number; y: number; weight: number }[];
  /** Machine-readable zone, luxury-ID style. Built only from the card's own fields. */
  mrz: [string, string];
  /** Number of distinct seed domains (artist, film, book…). */
  domains: number;
  /** Human reasons for the rarity tier, from the same inputs as the rarity score. */
  rarityWhy: string[];
}

const TYPE_STYLES: [RegExp, Omit<CardType, "name">][] = [
  [/futur|tech|industrial|architect|precision|engineer|cyber|sharp/i, { glyph: "⚡", a: "#38bdf8", b: "#8b5cf6" }],
  [/floral|romantic|feminine|soft|delicate|whimsical pattern/i, { glyph: "✿", a: "#f472b6", b: "#fda4af" }],
  [/vintage|retro|heritage|nostalg|classic|timeless/i, { glyph: "◷", a: "#f59e0b", b: "#b45309" }],
  [/minimal|clean|understated|neutral|monochrom|modern/i, { glyph: "◯", a: "#e2e8f0", b: "#94a3b8" }],
  [/boho|bohemian|ethnic|handcraft|embroider|textile|texture|artisan|traditional/i, { glyph: "❋", a: "#fb923c", b: "#c2410c" }],
  [/edgy|grunge|dark|noir|punk|rebel|gothic/i, { glyph: "✦", a: "#f43f5e", b: "#1f2937" }],
  [/athleisure|sport|utility|utilitarian|outdoor|functional|practical/i, { glyph: "▲", a: "#a3e635", b: "#15803d" }],
  [/luxe|luxury|elegant|sophisticat|refined|polished|chic|dapper/i, { glyph: "◆", a: "#fcd34d", b: "#a16207" }],
  [/whimsical|playful|quirk|colorful|pop/i, { glyph: "☻", a: "#facc15", b: "#ec4899" }],
  [/avant|unconventional|artistic|eclectic|individual|experimental|oversized|silhouette/i, { glyph: "◐", a: "#d946ef", b: "#22d3ee" }],
  [/british|preppy|tailored|professional/i, { glyph: "♜", a: "#60a5fa", b: "#1e3a8a" }],
  [/authentic|organic|natural|earthy/i, { glyph: "❦", a: "#86efac", b: "#4d7c0f" }],
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function typeOf(name: string): CardType {
  for (const [re, st] of TYPE_STYLES) if (re.test(name)) return { name, ...st };
  const hue = hash(name) % 360;
  return { name, glyph: "✧", a: `hsl(${hue} 85% 65%)`, b: `hsl(${(hue + 50) % 360} 80% 45%)` };
}

const KIND_LABEL: Record<string, string> = {
  artist: "Artist",
  movie: "Film",
  tv_show: "Series",
  book: "Book",
  place: "Place",
  podcast: "Podcast",
  videogame: "Game",
};

export function buildCard(r: StyleResult): CardData {
  const dual = r.dna.lobes.length > 1;
  const typeNames = dual
    ? [r.dna.lobes[0].keywords[0]?.name, r.dna.lobes[1].keywords[0]?.name]
    : [r.dna.keywords[0]?.name, r.dna.keywords[1]?.name];
  const types = typeNames.filter((x): x is string => Boolean(x)).map(typeOf);

  const main = r.brands.filter((b) => !b.side);
  const top = main.slice(0, 3);
  const avgAff = top.reduce((t, b) => t + b.affinity, 0) / Math.max(1, top.length);
  const pops = main.map((b) => b.entity.popularity).filter((p): p is number => typeof p === "number");
  const avgPop = pops.length ? pops.reduce((a, b) => a + b, 0) / pops.length : 0.8;
  const domains = new Set(r.seeds.map((s) => s.kind)).size;

  // Stats: all derived from the run.
  const range = Math.round(Math.min(99, 25 + (domains / 5) * 74));
  const edge = Math.round(Math.min(99, Math.max(5, (1 - avgPop) * 260)));
  const cohesion = Math.round(dual ? 22 + (r.contradictions[0]?.overlap ?? 0) * 300 : Math.min(99, 55 + avgAff * 45));
  const signal = Math.round(Math.min(99, avgAff * 100));

  // Rarity: breadth of taste + nicheness + a contradiction makes you rarer.
  const score = domains * 10 + edge * 0.4 + (dual ? 25 : 0) + (r.rejected.length > 3 ? 5 : 0);
  const rarity: Rarity = score >= 85 ? "secret" : score >= 65 ? "holo" : score >= 45 ? "rare" : "common";
  const rarityLabel = { common: "Common", rare: "Rare", holo: "Holo Rare", secret: "Secret Rare" }[rarity];

  const sideB = r.dna.lobes[1];
  const inert = r.critique.find((c) => c.includes("barely moves"));

  const kw = r.dna.keywords.map((k) => k.name);
  const styleCounts = new Map<string, number>();
  for (const b of main.slice(0, 6)) for (const st of b.entity.style ?? []) styleCounts.set(st, (styleCounts.get(st) ?? 0) + 1);
  const risingName = [...styleCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).find((k) => !kw.slice(0, 2).includes(k)) ?? kw[2] ?? kw[1] ?? "Unwritten";
  const bigThree: BigThree = {
    sun: typeOf(kw[0] ?? "Unwritten"),
    moon: typeOf(dual ? (sideB.keywords[0]?.name ?? kw[1] ?? "Unwritten") : (kw[1] ?? "Unwritten")),
    rising: typeOf(risingName),
    moonIsContradiction: dual,
  };

  // Constellation: deterministic positions per seed, brightness from summed Qloo influence on the signature brands.
  const pull = r.seeds.map((s) => main.reduce((t, b) => t + (b.explain[s.id] ?? 0), 0));
  const maxPull = Math.max(0.0001, ...pull);
  const n = Math.max(1, r.seeds.length);
  const stars = r.seeds.map((s, i) => {
    const h = hash(s.id || s.name);
    return {
      name: s.name,
      kind: s.kind,
      x: 0.1 + ((i + 0.5) / n) * 0.8 + (((h % 100) / 100 - 0.5) * 0.6) / n,
      y: 0.18 + (((h >>> 8) % 1000) / 1000) * 0.6,
      weight: pull[i] / maxPull,
    };
  });

  const serial = String(hash(r.seeds.map((s) => s.id).sort().join("|")) % 10000).padStart(4, "0");
  const mrzWord = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "<");
  const fit = (s: string) => (s + "<".repeat(36)).slice(0, 36);
  const mrz: [string, string] = [
    fit(`TS<${mrzWord(bigThree.sun.name)}<<${mrzWord(bigThree.moon.name)}<<${mrzWord(bigThree.rising.name)}`),
    fit(`${serial}<${rarity.slice(0, 2).toUpperCase()}<${Math.round(avgAff * 100)}<<${domains}DOM<${r.seeds.length}SEEDS<QLOO`),
  ];

  const rarityWhy = [
    `${domains} taste domain${domains === 1 ? "" : "s"}`,
    `edge ${edge}`,
    ...(dual ? ["a real contradiction"] : []),
    ...(r.rejected.length > 3 ? [`${r.rejected.length} picks rejected`] : []),
  ];

  return {
    stars,
    mrz,
    domains,
    rarityWhy,
    bigThree,
    archetype: r.dna.name,
    flavor: r.dna.tagline,
    power: Math.round(avgAff * 100),
    types,
    dual,
    rarity,
    rarityLabel,
    serial: String(hash(r.seeds.map((s) => s.id).sort().join("|")) % 10000).padStart(4, "0"),
    moves: top.map((b) => ({
      name: b.entity.name,
      value: Math.round(b.affinity * 100),
      note: b.because.map((id) => r.seeds.find((s) => s.id === id)?.name).filter(Boolean).join(" + "),
    })),
    stats: [
      { label: "Range", value: range },
      { label: "Edge", value: edge },
      { label: "Cohesion", value: Math.max(5, Math.min(99, cohesion)) },
      { label: "Signal", value: signal },
    ],
    weakness: sideB ? sideB.keywords.map((k) => k.name).slice(0, 2).join(" / ") : undefined,
    ignores: inert ? inert.split(" barely moves")[0] : undefined,
    evolvesFrom: r.seeds.map((s) => ({ name: s.name, kind: KIND_LABEL[s.kind] ?? s.kind, image: s.image ? proxied(s.image) : undefined })),
    art: r.seeds.map((s) => s.image).filter((x): x is string => Boolean(x)).slice(0, 5).map(proxied),
  };
}

/** Same-origin image URL so the share export can draw it onto a canvas. */
export const proxied = (url: string) => `/api/img?u=${encodeURIComponent(url)}`;
