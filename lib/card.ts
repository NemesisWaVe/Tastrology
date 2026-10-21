import type { BrandMatch, StyleResult } from "./types";

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
  /** Minted with a regret credit: shown as a "Second draw" mark. */
  secondDraw?: boolean;
  /** Display extras from CARD#<code> STYLE (lib/cardStyle.ts), never part of the code. */
  living?: boolean;
  /** Holo and Secret only: the order it was pulled in its tier ("Secret Rare #4"). */
  rarityNo?: number;
  /** Territories its brands were recast into. */
  recasts?: string[];
  rarityLabel: string;
  serial: string;
  /** `cut`: the love whose removal costs this brand the most affinity points (leave-one-out re-query). */
  moves: { name: string; value: number; note: string; cut?: { name: string; drop: number } }[];
  /** Each stat carries a one-line `hint` that says exactly what it measures. */
  stats: { label: string; value: number; hint: string }[];
  /** "Weak to: <love>. Moved N% of your picks." Only when the critique found an inert love. */
  weakness?: string;
  weak?: { name: string; pct: number };
  /** Average seed popularity under 30%: you love things few people do. Pure function of the run. */
  deepCut: boolean;
  /** Average seed popularity, 0-100, when Qloo gave it for at least half the seeds. */
  avgPop?: number;
  ignores?: string;
  evolvesFrom: { name: string; kind: string; image?: string }[];
  /** The vibes picked next to the loves (lib/vibes.ts), so the card's sky shows them too. Absent on older cards. */
  vibes?: { name: string; via: string[]; image?: string }[];
  art: string[]; // seed images (proxied), for the art window collage
  /** Constellation for the art window: one star per seed (0-1 coords), size = how much it drives your brands (Qloo explainability). */
  stars: { name: string; kind: string; x: number; y: number; weight: number }[];
  /** Machine-readable zone, luxury-ID style. Built only from the card's own fields. */
  mrz: [string, string];
  /** Number of distinct seed domains (artist, film, book…). */
  domains: number;
  /** Human reasons for the rarity tier, from the same inputs as the rarity score. */
  rarityWhy: string[];
  /** 0-100 from your taste: obscurity 40 + odd pairing 25 + spread 20 + tension 15. Tier cuts in RARITY_CUTS. */
  rarityScore: number;
}

/** Score thresholds, calibrated to roughly 55% Common / 30% Rare / 12% Holo / 3% Secret. */
export const RARITY_CUTS = { rare: 55, holo: 64, secret: 74 };

/** The ceiling for a card paid by a regret: the tier it replaced, except a Common gets one step of leverage, up to Rare. */
export const redrawCap = (replaced: Rarity): Rarity => (replaced === "common" ? "rare" : replaced);
/** Qloo popularity is a percentile and real loves cluster at 0.95+, so obscurity is scored over the top 15% only. */
const OBSCURE_SPAN = 0.15;

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

export const KIND_LABEL: Record<string, string> = {
  artist: "Artist",
  movie: "Film",
  tv_show: "Series",
  book: "Book",
  place: "Place",
  podcast: "Podcast",
  videogame: "Game",
};

/** Readings from this moment on use the specificity-weighted Rising (2026-10-19 UTC). */
export const RISING_V2_AT = Date.UTC(2026, 9, 19);

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

  // Signal: how strongly Qloo backs your top brands (avg affinity of the top 3). Same meaning in battle (lib/battle.ts).
  const signal = clampStat(avgAff * 100);

  // Rarity: scored on YOUR taste (not on which brands we picked). Every point is listed in `rarityWhy`.
  const seedPops = r.seeds.map((s) => s.popularity).filter((p): p is number => typeof p === "number");
  const avgPop = seedPops.length >= Math.ceil(n / 2) ? seedPops.reduce((t, p) => t + p, 0) / seedPops.length : undefined;
  const con = r.contradictions[0];
  const pts = {
    obscurity: avgPop === undefined ? 0 : Math.round(40 * Math.min(1, Math.max(0, (1 - avgPop) / OBSCURE_SPAN))),
    pairing: r.overlap === undefined ? 0 : Math.round(25 * (1 - r.overlap)),
    spread: Math.round((20 * domains) / Math.min(n, SEED_DOMAINS)),
    tension: con ? Math.round(15 * (1 - con.overlap)) : 0,
  };
  const rarityScore = pts.obscurity + pts.pairing + pts.spread + pts.tension;
  const scored: Rarity = rarityScore >= RARITY_CUTS.secret ? "secret" : rarityScore >= RARITY_CUTS.holo ? "holo" : rarityScore >= RARITY_CUTS.rare ? "rare" : "common";
  // Rolled cards take the roll; older cards and personas keep the tier their taste score earned.
  const natural: Rarity = r.roll?.tier ?? r.showcase ?? scored;
  // A second draw (paid by a regret) can't outrank the card it replaced.
  const TIER: Rarity[] = ["common", "rare", "holo", "secret"];
  const cap = r.redraw?.cap;
  const rarity: Rarity = cap && TIER.indexOf(natural) > TIER.indexOf(cap) ? cap : natural;
  const rarityLabel = { common: "Common", rare: "Rare", holo: "Holo Rare", secret: "Secret Rare" }[rarity];
  const pc = (v: number) => `${Math.round(v * 100)}%`;
  const rarityWhy = [
    ...(avgPop === undefined ? [] : [`+${pts.obscurity} obscurity: your picks sit in the top ${Math.max(1, Math.round((1 - avgPop) * 100))}% by popularity`]),
    ...(r.overlap === undefined ? [] : [`+${pts.pairing} odd pairing: your loves share ${pc(r.overlap)} of their aesthetic tags`]),
    `+${pts.spread} spread: ${domains} ${domains === 1 ? "domain" : "domains"} across ${n} ${n === 1 ? "love" : "loves"}`,
    ...(con ? [`+${pts.tension} tension: ${seedLabel(r, con.a)} and ${seedLabel(r, con.b)} share ${pc(con.overlap)}`] : []),
    ...(cap ? [`Second draw: can rank up to ${{ common: "Common", rare: "Rare", holo: "Holo Rare", secret: "Secret Rare" }[cap]}`] : []),
  ];
  const deepCut = avgPop !== undefined && avgPop < 0.9;

  const sideB = r.dna.lobes[1];
  // Weakness: the seed that moved none (well, next to none) of your brand picks, straight from the critique. Absent if there isn't one.
  const inertSeed = r.inert?.length
    ? [...r.inert].sort((x, y) => x.influence - y.influence)[0]
    : (() => {
        const line = r.critique.find((c) => c.includes("barely moves"));
        const m = line?.match(/^(.*) barely moves .*avg influence (\d+)%/);
        return m ? { name: m[1], influence: Number(m[2]) / 100 } : undefined;
      })();
  const inertName = inertSeed && ("id" in inertSeed ? seedLabel(r, inertSeed.id) : displayName(inertSeed.name));
  const weak = inertSeed && inertName ? { name: inertName, pct: Math.round(inertSeed.influence * 100) } : undefined;

  const kw = r.dna.keywords.map((k) => k.name);
  const styleCounts = new Map<string, number>();
  let risingName: string;
  if ((r.createdAt ?? 0) < RISING_V2_AT) {
    // Readings before the fix keep their Rising, so their card codes don't change.
    for (const b of main.slice(0, 6)) for (const st of b.entity.style ?? []) styleCounts.set(st, (styleCounts.get(st) ?? 0) + 1);
    risingName = [...styleCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).find((k) => !kw.slice(0, 2).includes(k)) ?? kw[2] ?? kw[1] ?? "Unwritten";
  } else {
    // A style nearly every brand carries (Minimalist, say) says nothing about you: weight each tag by how specific it is
    // to this pool and skip the near-universal ones.
    const pool = r.brands.filter((b) => !b.side);
    const df = new Map<string, number>();
    for (const b of pool) for (const st of new Set(b.entity.style ?? [])) df.set(st, (df.get(st) ?? 0) + 1);
    for (const b of main.slice(0, 6))
      for (const st of b.entity.style ?? []) {
        const n = df.get(st) ?? 1;
        if (pool.length >= 4 && n > 0.6 * pool.length) continue;
        styleCounts.set(st, (styleCounts.get(st) ?? 0) + (b.affinity || 1) / Math.log(1 + n));
      }
    const fromStyle = [...styleCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).find((k) => !kw.slice(0, 2).includes(k));
    risingName = fromStyle ?? kw.slice(2).find((k) => k !== "Minimalist") ?? kw[2] ?? kw[1] ?? "Unwritten";
  }
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

  const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  return {
    stars,
    mrz,
    domains,
    rarityWhy,
    ...(cap ? { secondDraw: true } : {}),
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
      cut: ablationLines(b, r.seeds)[0],
    })),
    stats: [
      { label: "Range", value: range, hint: `Range: ${domains} of ${SEED_DOMAINS} domains, ${evenness > 0.9 ? "evenly" : "unevenly"} spread` },
      { label: "Edge", value: edge, hint: `Edge: how far from the mainstream your brands sit (${offMainstream}/${pops.length} outside Qloo's top 10%)` },
      { label: "Cohesion", value: cohesion, hint: `Cohesion: ${mainLobe}/${n} loves share one aesthetic; brands draw on ${Math.round(drawn)}` },
      { label: "Signal", value: signal, hint: `Signal: how strongly Qloo backs your top ${plural(top.length, "brand")} (avg match ${Math.round(avgAff * 100)})` },
    ],
    weakness: weak ? `Weak to: ${weak.name}. Moved ${weak.pct}% of your picks.` : undefined,
    weak,
    deepCut,
    avgPop: avgPop === undefined ? undefined : Math.round(avgPop * 100),
    ignores: weak?.name,
    evolvesFrom: r.seeds.map((s) => ({ name: displayName(s.name), kind: KIND_LABEL[s.kind] ?? s.kind, image: s.image ? proxied(s.image) : undefined })),
    ...(r.vibes?.length ? { vibes: r.vibes.map((v) => ({ name: v.name, via: v.via, ...(v.image ? { image: proxied(v.image) } : {}) })) } : {}),
    art: r.seeds.map((s) => s.image).filter((x): x is string => Boolean(x)).slice(0, 5).map(proxied),
  };
}

const SEED_DOMAINS = 7;
const seedLabel = (r: StyleResult, id: string) => displayName(r.seeds.find((s) => s.id === id)?.name ?? "one of your loves");

/** Affinity points a brand loses when each love is removed (Qloo re-query), biggest first. Only real, measured drops. */
export function ablationLines(b: BrandMatch, seeds: { id: string; name: string }[]): { name: string; drop: number }[] {
  return Object.entries(b.ablation ?? {})
    .map(([id, v]) => ({ name: displayName(seeds.find((s) => s.id === id)?.name ?? ""), drop: Math.round(v * 100) }))
    .filter((x) => x.name && x.drop > 0)
    .sort((x, y) => y.drop - x.drop);
}
const clampStat = (v: number) => Math.round(Math.max(5, Math.min(99, v)));

/** "Neuromancer (Sprawl, #1)" → "Neuromancer". Strips trailing (…) / […] groups, keeps the rest intact. */
export function displayName(name: string): string {
  // Qloo omnibus editions ("Ikigai: ... / The Little Book of Lykke / Lagom…"): keep the first title.
  let out = name.split(" / ")[0].trim();
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
/** Host printed under the QR: NEXT_PUBLIC_SITE_HOST if set, else the Vercel production domain (exposed automatically on Vercel). */
export const TWIN_HOST =
  process.env.NEXT_PUBLIC_SITE_HOST || process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL || "tastrology.app";
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O, U

type CodeFields = Pick<CardData, "serial" | "rarity" | "mrz" | "archetype" | "moves">;

/** Short, human-typeable verify code: the serial plus 4 check characters hashed from the card's own fields (v2). */
export function cardCode(card: CodeFields): string {
  const moves = (card.moves ?? []).map((m) => `${m.name}:${m.value}`).join(",");
  let h = hash(`v2|${card.serial}|${card.rarity}|${card.mrz?.[0] ?? ""}|${card.mrz?.[1] ?? ""}|${card.archetype}|${moves}`);
  let c = "";
  for (let i = 0; i < 4; i++) {
    c += B32[h & 31];
    h >>>= 5;
  }
  return `${card.serial}-${c}`;
}

/** Path of the verifiable digital twin, e.g. /c/0427-H7K2. */
export const twinPath = (card: CodeFields) => `/c/${cardCode(card)}`;
/** Absolute URL encoded in the printed QR. */
export const twinUrl = (card: CodeFields) => `https://${TWIN_HOST}${twinPath(card)}`;
