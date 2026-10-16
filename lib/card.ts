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
  /** Each stat carries a one-line `hint` that says exactly what it measures. */
  stats: { label: string; value: number; hint: string }[];
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
  /** Points behind the rarity tier (range + edge + contradiction); thresholds 40 / 58 / 75. */
  rarityScore: number;
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
  const n = Math.max(1, r.seeds.length);

  // ---- Stats: each one is a single, explainable reading of the run (see `hint`).
  // Range: how many of the 7 seed domains you use, and how evenly your loves spread across them.
  const kindCounts = new Map<string, number>();
  for (const sd of r.seeds) kindCounts.set(sd.kind, (kindCounts.get(sd.kind) ?? 0) + 1);
  const domains = kindCounts.size;
  const entropy = [...kindCounts.values()].reduce((t, c) => t - (c / n) * Math.log(c / n), 0);
  const evenness = domains > 1 ? entropy / Math.log(domains) : 0;
  const range = clampStat(100 * (0.6 * (domains / SEED_DOMAINS) + 0.4 * evenness));

  // Edge: share of your signature brands that sit outside Qloo's top-10% popularity.
  const pops = main.map((b) => b.entity.popularity).filter((p): p is number => typeof p === "number");
  const offMainstream = pops.filter((p) => p < 0.9).length;
  const edge = clampStat(pops.length ? (100 * offMainstream) / pops.length : 30);

  // Cohesion: how many loves share the main aesthetic, and how many of them each brand draws on.
  const mainLobe = r.dna.lobes[0]?.seedIds.length ?? n;
  const lobeShare = dual ? mainLobe / n : 1;
  const drawn = top.length ? top.reduce((t, b) => t + Object.values(b.explain).filter((v) => v >= 0.05).length, 0) / top.length : n;
  const cohesion = clampStat(100 * (0.5 * lobeShare + 0.5 * Math.min(1, drawn / n)));

  // Signal: of everything Qloo returned, how much survived the self-critique.
  const kept = r.brands.length;
  const signal = clampStat((100 * kept) / Math.max(1, kept + r.rejected.length));

  // Rarity: breadth + nicheness + a real contradiction. Every point is listed in `rarityWhy`.
  const pts = { range: Math.round(range * 0.35), edge: Math.round(edge * 0.35), twist: dual ? 20 : 0 };
  const rarityScore = pts.range + pts.edge + pts.twist;
  const rarity: Rarity = rarityScore >= 75 ? "secret" : rarityScore >= 58 ? "holo" : rarityScore >= 40 ? "rare" : "common";
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
  const stars = r.seeds.map((s, i) => {
    const h = hash(s.id || s.name);
    return {
      name: displayName(s.name),
      kind: s.kind,
      x: 0.1 + ((i + 0.5) / n) * 0.8 + (((h % 100) / 100 - 0.5) * 0.6) / n,
      y: 0.18 + (((h >>> 8) % 1000) / 1000) * 0.6,
      weight: pull[i] / maxPull,
    };
  });

  const serial = String(hash(r.seeds.map((s) => s.id).sort().join("|")) % 10000).padStart(4, "0"); // computed once
  const mrzWord = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "<");
  const fit = (s: string) => (s + "<".repeat(36)).slice(0, 36);
  const mrz: [string, string] = [
    fit(`TS<${mrzWord(bigThree.sun.name)}<<${mrzWord(bigThree.moon.name)}<<${mrzWord(bigThree.rising.name)}`),
    fit(`${serial}<${rarity.slice(0, 2).toUpperCase()}<${Math.round(avgAff * 100)}<<${domains}DOM<${r.seeds.length}SEEDS<QLOO`),
  ];

  const rarityWhy = [
    `+${pts.range} range (${domains} of ${SEED_DOMAINS} domains)`,
    `+${pts.edge} edge (${offMainstream} of ${pops.length} brands off-mainstream)`,
    ...(dual ? [`+${pts.twist} a real contradiction`] : []),
  ];

  const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  return {
    stars,
    mrz,
    domains,
    rarityWhy,
    rarityScore,
    bigThree,
    archetype: r.dna.name,
    flavor: r.dna.tagline,
    power: Math.round(avgAff * 100),
    types,
    dual,
    rarity,
    rarityLabel,
    serial,
    moves: top.map((b) => ({
      name: displayName(b.entity.name),
      value: Math.round(b.affinity * 100),
      note: b.because
        .map((id) => r.seeds.find((s) => s.id === id)?.name)
        .filter((x): x is string => Boolean(x))
        .map(displayName)
        .join(" + "),
    })),
    stats: [
      { label: "Range", value: range, hint: `Range: ${domains} of ${SEED_DOMAINS} domains, ${evenness > 0.9 ? "evenly" : "unevenly"} spread` },
      { label: "Edge", value: edge, hint: `Edge: how far from the mainstream your brands sit (${offMainstream}/${pops.length} outside Qloo's top 10%)` },
      { label: "Cohesion", value: cohesion, hint: `Cohesion: ${mainLobe}/${n} loves share one aesthetic; brands draw on ${Math.round(drawn)}` },
      { label: "Signal", value: signal, hint: `Signal: ${plural(kept, "pick")} survived the critique, ${r.rejected.length} thrown out` },
    ],
    weakness: sideB ? sideB.keywords.map((k) => k.name).slice(0, 2).join(" / ") : undefined,
    ignores: inert ? displayName(inert.split(" barely moves")[0]) : undefined,
    evolvesFrom: r.seeds.map((s) => ({ name: displayName(s.name), kind: KIND_LABEL[s.kind] ?? s.kind, image: s.image ? proxied(s.image) : undefined })),
    art: r.seeds.map((s) => s.image).filter((x): x is string => Boolean(x)).slice(0, 5).map(proxied),
  };
}

const SEED_DOMAINS = 7;
const clampStat = (v: number) => Math.round(Math.max(5, Math.min(99, v)));

/** "Neuromancer (Sprawl, #1)" → "Neuromancer". Strips trailing (…) / […] groups, keeps the rest intact. */
export function displayName(name: string): string {
  let out = name.trim();
  for (let k = 0; k < 3; k++) {
    const next = out.replace(/\s*[([][^()[\]]*[)\]]\s*$/, "").trim();
    if (!next || next === out) break;
    out = next;
  }
  return out || name;
}

/** Same-origin image URL so the share export can draw it onto a canvas. */
export const proxied = (url: string) => `/api/img?u=${encodeURIComponent(url)}`;

/* ------------------------------------------------------------------ print edition + digital twin (additive) */

/** Season the card was minted in. Bump per seasonal set. */
export const SEASON = "01";
/** Host printed under the QR. Set NEXT_PUBLIC_SITE_HOST to the deployed domain (e.g. tastrology.vercel.app). */
export const TWIN_HOST = process.env.NEXT_PUBLIC_SITE_HOST || "tastrology.app";
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O, U

/** Short, human-typeable verify code: the serial plus 4 check characters hashed from the card's own fields. */
export function cardCode(card: Pick<CardData, "serial" | "rarity" | "mrz">): string {
  let h = hash(`${card.serial}|${card.rarity}|${card.mrz?.join("|") ?? ""}`);
  let c = "";
  for (let i = 0; i < 4; i++) {
    c += B32[h & 31];
    h >>>= 5;
  }
  return `${card.serial}-${c}`;
}

/** Path of the verifiable digital twin, e.g. /c/0427-H7K2. */
export const twinPath = (card: Pick<CardData, "serial" | "rarity" | "mrz">) => `/c/${cardCode(card)}`;
/** Absolute URL encoded in the printed QR. */
export const twinUrl = (card: Pick<CardData, "serial" | "rarity" | "mrz">) => `https://${TWIN_HOST}${twinPath(card)}`;
