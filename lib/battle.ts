import { buildCard, type CardData } from "./card";
import type { QEntity, StyleResult } from "./types";

/**
 * Taste Battle: two results face off. Pure and deterministic (no network, no randomness) so it is
 * unit-testable, and every line it writes is templated from fields in the two results: seed names,
 * contradictions, rejected picks, inert seeds, shared brands and keywords. It roasts the taste, never the person.
 */

/** Bump when battle() output changes; part of the stored-result key. */
export const ENGINE_V = "3";

export type Side = "a" | "b";
export type StatName = "Range" | "Edge" | "Cohesion" | "Signal";

export interface BattleRound {
  stat: StatName;
  /** What the stat measures, in plain words. */
  measures: string;
  a: number;
  b: number;
  winner: Side | "tie";
  /** The judge's line, aimed at the losing side's taste (or both, on a tie). */
  roast: string;
  /** Where the roast came from, for the receipts. */
  receipt: string;
}

export interface Crossover {
  brand: { id: string; name: string; image?: string };
  /** true when the brand is on both lists. */
  shared: boolean;
  affinity: { a?: number; b?: number };
  reason: string;
}

export interface JointSign {
  name: string;
  glyphKeywords: [string, string];
  keywords: string[];
  /** Keywords both sides already had. */
  consensus: string[];
}

export interface BattleResult {
  names: { a: string; b: string };
  cards: { a: CardData; b: CardData };
  compatibility: number;
  breakdown: {
    brandJaccard: number;
    keywordJaccard: number;
    sharedBrands: string[];
    sharedKeywords: string[];
    weights: { brands: number; keywords: number };
    /** Each level's match, 0-100 (brands, genre, aesthetic, domains, shape). */
    levels?: Record<"brands" | "genre" | "aesthetic" | "domains" | "shape", number>;
    formula: string;
  };
  verdict: { label: string; line: string };
  rounds: BattleRound[];
  score: { a: number; b: number };
  winner: Side | "tie";
  jointSign: JointSign;
  crossover: Crossover | null;
}

/**
 * Compatibility is a blend over levels, coarse to exact, the way music matching counts a shared genre and not only a
 * shared song: exact brands, the Qloo tags and styles those brands carry, aesthetic words, the domains your loves come
 * from, and how alike the two stat lines are. Two people rarely share a brand id; they often share a register.
 */
const LEVELS = { brands: 0.15, genre: 0.3, aesthetic: 0.2, domains: 0.15, shape: 0.2 } as const;
const W_BRANDS = LEVELS.brands;
const W_KEYWORDS = LEVELS.aesthetic;

const MEASURES: Record<StatName, string> = {
  Range: "how many taste domains your loves span",
  Edge: "how far your brands sit from the mainstream",
  Cohesion: "whether your loves agree with each other",
  Signal: "how strongly Qloo backs your top brands",
};

const norm = (s: string) => s.trim().toLowerCase();

function bag(xs: [string, number][]): Map<string, number> {
  const m = new Map<string, number>();
  for (const [k, w] of xs) if (k) m.set(norm(k), (m.get(norm(k)) ?? 0) + w);
  return m;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  for (const [k, v] of a) dot += v * (b.get(k) ?? 0);
  const n = (m: Map<string, number>) => Math.sqrt([...m.values()].reduce((t, v) => t + v * v, 0));
  const d = n(a) * n(b);
  return d ? dot / d : 0;
}

/** The genre level: every tag and style on a side's brands, weighted by how strongly Qloo matched the brand. */
const genreBag = (r: StyleResult) => bag(r.brands.flatMap((b) => [...b.entity.tags.map((t) => t.name), ...(b.entity.style ?? [])].map((t): [string, number] => [t, b.affinity || 0.5])));
/** The aesthetic level, word by word: "Quiet Luxury" and "Luxury Streetwear" share "luxury". */
const wordBag = (ks: string[]) => bag(ks.flatMap((k) => k.split(/[^A-Za-z0-9]+/).filter((w) => w.length > 2).map((w): [string, number] => [w, 1])));
const domainBag = (r: StyleResult) => bag(r.seeds.map((x): [string, number] => [x.kind, 1]));

export function jaccard<T>(a: Iterable<T>, b: Iterable<T>): { score: number; shared: T[] } {
  const A = new Set(a);
  const B = new Set(b);
  const shared = [...A].filter((x) => B.has(x));
  const union = new Set([...A, ...B]).size;
  return { score: union ? shared.length / union : 0, shared };
}

/** All keyword names a result carries: main DNA plus each side of a split taste, in rank order. */
function keywordNames(r: StyleResult): string[] {
  const out: string[] = [];
  for (const k of [...r.dna.keywords, ...r.dna.lobes.flatMap((l) => l.keywords)]) if (!out.some((x) => norm(x) === norm(k.name))) out.push(k.name);
  return out;
}

const seedName = (r: StyleResult, id: string) => r.seeds.find((s) => s.id === id)?.name ?? "one of the seeds";

const KIND_PLURAL: Record<string, string> = {
  artist: "artists",
  movie: "films",
  tv_show: "series",
  book: "books",
  place: "places",
  podcast: "podcasts",
  videogame: "games",
};

function topKind(r: StyleResult): { kind: string; n: number } {
  const c = new Map<string, number>();
  for (const s of r.seeds) c.set(s.kind, (c.get(s.kind) ?? 0) + 1);
  const [kind, n] = [...c.entries()].sort((x, y) => y[1] - x[1])[0] ?? ["seed", 0];
  return { kind: KIND_PLURAL[kind] ?? kind, n };
}

/** A seed the agent flagged as barely moving any brand pick. */
function inertSeed(r: StyleResult): string | undefined {
  return r.critique.find((c) => c.includes("barely moves"))?.split(" barely moves")[0];
}

/** A pick the agent rejected for being carried by a single seed. */
function fluke(r: StyleResult): { brand: string; seed?: string } | undefined {
  const f = r.rejected.find((x) => /carried by one seed/i.test(x.reason)) ?? r.rejected[0];
  if (!f) return undefined;
  const seed = /Carried by one seed: (.+?) accounts/i.exec(f.reason)?.[1];
  return { brand: f.entity.name, seed };
}

function mainstreamBrand(r: StyleResult): { name: string; pop: number } | undefined {
  const b = r.brands
    .filter((x) => !x.side && typeof x.entity.popularity === "number")
    .sort((x, y) => (y.entity.popularity ?? 0) - (x.entity.popularity ?? 0))[0];
  return b ? { name: b.entity.name, pop: b.entity.popularity ?? 0 } : undefined;
}

function roastFor(stat: StatName, loser: StyleResult, winner: StyleResult, lc: CardData, wc: CardData): { roast: string; receipt: string } {
  const who = loser.dna.name;
  switch (stat) {
    case "Range": {
      const t = topKind(loser);
      if (lc.domains <= 2 && t.n >= 2)
        return { roast: `${t.n} of ${who}'s ${loser.seeds.length} loves are ${t.kind}. That's not a range, that's a shelf.`, receipt: `${lc.domains} domain${lc.domains === 1 ? "" : "s"} vs ${wc.domains}` };
      return { roast: `${who} covers ${lc.domains} domains. ${winner.dna.name} covers ${wc.domains} and won't stop mentioning it.`, receipt: `seed domains ${lc.domains} vs ${wc.domains}` };
    }
    case "Edge": {
      const m = mainstreamBrand(loser);
      if (m && m.pop >= 0.6)
        return { roast: `${m.name} sits at ${Math.round(m.pop * 100)}% popularity. Bold of ${who} to call that a find.`, receipt: `Qloo popularity of ${m.name}` };
      return { roast: `${who}'s brands are tasteful, in the way a hotel lobby is tasteful.`, receipt: `avg brand popularity, edge ${lc.stats[1].value} vs ${wc.stats[1].value}` };
    }
    case "Cohesion": {
      const c = loser.contradictions[0];
      if (c)
        return {
          roast: `${who} has their Moon in ${seedName(loser, c.b)}. ${seedName(loser, c.a)} would like a word. −Cohesion.`,
          receipt: `tag overlap ${Math.round(c.overlap * 100)}% between those two seeds`,
        };
      const f = fluke(loser);
      if (f)
        return { roast: `${f.brand} tried to sneak onto ${who}'s list${f.seed ? ` on ${f.seed}'s word alone` : ""}. Bounced at the door.`, receipt: `rejected by the agent's self-critique` };
      return { roast: `${who}'s loves agree with each other. Politely. Like coworkers.`, receipt: `cohesion ${lc.stats[2].value} vs ${wc.stats[2].value}` };
    }
    case "Signal": {
      const inert = inertSeed(loser);
      if (inert) return { roast: `${inert} is along for the ride: it barely moves a single one of ${who}'s brand picks.`, receipt: `flagged in the agent's critique` };
      const f = fluke(loser);
      if (f) return { roast: `${f.brand} got rejected from ${who}'s list${f.seed ? `: carried by ${f.seed} alone` : ""}. The graph wasn't convinced.`, receipt: `rejected pick` };
      const top = loser.brands[0];
      return {
        roast: top ? `${who}'s best match is ${top.entity.name} at ${Math.round(top.affinity * 100)}. Qloo says "sure", not "obviously".` : `${who}'s signal is a whisper.`,
        receipt: `avg affinity of top 3 brands`,
      };
    }
  }
}

function tieLine(stat: StatName, a: StyleResult, b: StyleResult, sharedKw: string[]): string {
  const k = sharedKw[0];
  return k
    ? `Dead heat on ${stat}. Both of you are ${k.toLowerCase()}, and both of you think you got there first.`
    : `Dead heat on ${stat}. ${a.dna.name} and ${b.dna.name} are equally sure of themselves.`;
}

/** Interleave two ranked lists (a0, b0, a1, b1…), consensus first, de-duplicated. */
function consensusKeywords(a: string[], b: string[]): { keywords: string[]; consensus: string[] } {
  const bn = new Set(b.map(norm));
  const consensus = a.filter((k) => bn.has(norm(k)));
  const out: string[] = [...consensus];
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    for (const k of [a[i], b[i]]) if (k && !out.some((x) => norm(x) === norm(k))) out.push(k);
  return { keywords: out, consensus };
}

function tagNames(e: QEntity): string[] {
  return [...e.tags.map((t) => t.name), ...(e.style ?? [])].map(norm);
}

function pickCrossover(a: StyleResult, b: StyleResult): Crossover | null {
  const aMain = a.brands;
  const bMain = b.brands;
  const bById = new Map(bMain.map((x) => [x.entity.id, x]));
  const bByName = new Map(bMain.map((x) => [norm(x.entity.name), x]));
  const both = aMain
    .map((x) => ({ x, y: bById.get(x.entity.id) ?? bByName.get(norm(x.entity.name)) }))
    .filter((p): p is { x: (typeof aMain)[number]; y: (typeof bMain)[number] } => Boolean(p.y))
    .sort((p, q) => q.x.affinity + q.y.affinity - (p.x.affinity + p.y.affinity));
  if (both[0]) {
    const { x, y } = both[0];
    return {
      brand: { id: x.entity.id, name: x.entity.name, image: x.entity.image },
      shared: true,
      affinity: { a: x.affinity, b: y.affinity },
      reason: `On both lists: ${Math.round(x.affinity * 100)} for ${a.dna.name}, ${Math.round(y.affinity * 100)} for ${b.dna.name}. The graph already agrees.`,
    };
  }
  // No shared brand: score each brand by its own affinity plus how much it speaks the other side's language.
  const aKw = keywordNames(a).map(norm);
  const bKw = keywordNames(b).map(norm);
  type Cand = { e: QEntity; aff: number; owner: Side; hits: string[]; score: number };
  const cands: Cand[] = [];
  for (const [list, owner, otherKw] of [
    [aMain, "a", bKw],
    [bMain, "b", aKw],
  ] as const) {
    for (const m of list) {
      const tags = tagNames(m.entity);
      const hits = otherKw.filter((k) => tags.includes(k));
      cands.push({ e: m.entity, aff: m.affinity, owner, hits, score: m.affinity + hits.length * 0.25 });
    }
  }
  const best = cands.sort((p, q) => q.score - p.score)[0];
  if (!best) return null;
  const ownerName = best.owner === "a" ? a.dna.name : b.dna.name;
  const otherName = best.owner === "a" ? b.dna.name : a.dna.name;
  const otherKwRaw = keywordNames(best.owner === "a" ? b : a);
  const hitLabel = best.hits.map((h) => otherKwRaw.find((k) => norm(k) === h) ?? h);
  return {
    brand: { id: best.e.id, name: best.e.name, image: best.e.image },
    shared: false,
    affinity: best.owner === "a" ? { a: best.aff } : { b: best.aff },
    reason: hitLabel.length
      ? `${ownerName}'s match (${Math.round(best.aff * 100)}), and Qloo tags it ${hitLabel.slice(0, 2).join(" and ").toLowerCase()}: ${otherName}'s language.`
      : `No brand made both lists, so the strongest single match wins: ${ownerName}'s pick at ${Math.round(best.aff * 100)}.`,
  };
}

const SIGN_HOUSES = ["Conjunction", "Eclipse", "Transit", "Alignment"];

function verdictFor(c: number): { label: string; line: string } {
  // Cuts sit higher than a plain overlap score would: the blend counts shared genre and shape, so strangers land near 40.
  if (c >= 80) return { label: "Taste twins", line: "Same group chat energy. Suspiciously so." };
  if (c >= 65) return { label: "Co-signers", line: "You'd swap recommendations and actually take them." };
  if (c >= 50) return { label: "Situationship", line: "Overlap exists. Nobody is ready to define it." };
  if (c >= 35) return { label: "Opposites, attractive", line: "Different planets, same orbit. The crossover brand is your treaty." };
  return { label: "Parallel universes", line: "Little shared language. Which is exactly why the joint sign is interesting." };
}

/** A stored card can stand in for its rebuild only if it carries the four stats the rounds read, in order. */
const ROUND_STATS = ["Range", "Edge", "Cohesion", "Signal"];
const fits = (c?: CardData | null) => (c && ROUND_STATS.every((s, i) => c.stats?.[i]?.label === s && Number.isFinite(c.stats[i].value)) ? c : undefined);

/**
 * `cards`: the fighters as minted (their twins). A fight is between the cards people hold, so their stored stats, print
 * and edition are what fight and show; a rebuild from the reading (today's formulas) is only the fallback.
 */
export function battle(a: StyleResult, b: StyleResult, cards?: { a?: CardData | null; b?: CardData | null }): BattleResult {
  const ca = fits(cards?.a) ?? buildCard(a);
  const cb = fits(cards?.b) ?? buildCard(b);

  const bj = jaccard(
    a.brands.map((x) => x.entity.id),
    b.brands.map((x) => x.entity.id),
  );
  const ak = keywordNames(a);
  const bk = keywordNames(b);
  const kj = jaccard(ak.map(norm), bk.map(norm));
  const shapeGap = ca.stats.reduce((t, s, i) => t + Math.abs(s.value - cb.stats[i].value), 0) / (100 * ca.stats.length);
  const levels = {
    brands: Math.sqrt(bj.score),
    genre: Math.sqrt(cosine(genreBag(a), genreBag(b))),
    aesthetic: Math.sqrt(cosine(wordBag(ak), wordBag(bk))),
    domains: cosine(domainBag(a), domainBag(b)),
    shape: Math.max(0, 1 - 2 * shapeGap),
  };
  // Square roots so small real overlaps register on a 0-100 dial; identical = 100.
  const compatibility = Math.round(100 * (Object.keys(LEVELS) as (keyof typeof LEVELS)[]).reduce((t, k) => t + LEVELS[k] * levels[k], 0));

  const stats: StatName[] = ["Range", "Edge", "Cohesion", "Signal"];
  const rounds: BattleRound[] = stats.map((stat, i) => {
    const va = ca.stats[i].value;
    const vb = cb.stats[i].value;
    const winner: Side | "tie" = Math.abs(va - vb) < 2 ? "tie" : va > vb ? "a" : "b";
    if (winner === "tie")
      return { stat, measures: MEASURES[stat], a: va, b: vb, winner, roast: tieLine(stat, a, b, kj.shared.map((k) => ak.find((x) => norm(x) === k) ?? k)), receipt: `${va} vs ${vb}` };
    const [L, Wr, Lc, Wc] = winner === "a" ? [b, a, cb, ca] : [a, b, ca, cb];
    return { stat, measures: MEASURES[stat], a: va, b: vb, winner, ...roastFor(stat, L, Wr, Lc, Wc) };
  });

  const score = {
    a: rounds.filter((r) => r.winner === "a").length,
    b: rounds.filter((r) => r.winner === "b").length,
  };
  const total = (s: Side) => rounds.reduce((t, r) => t + r[s], 0);
  const winner: Side | "tie" = score.a !== score.b ? (score.a > score.b ? "a" : "b") : total("a") === total("b") ? "tie" : total("a") > total("b") ? "a" : "b";

  const { keywords, consensus } = consensusKeywords(ak, bk);
  const top3 = keywords.slice(0, 3);
  const k1 = top3[0] ?? "Unwritten";
  const k2 = top3[1] ?? k1;
  const house = SIGN_HOUSES[(ak.length + bk.length + compatibility) % SIGN_HOUSES.length];

  const sharedKeywords = kj.shared.map((k) => ak.find((x) => norm(x) === k) ?? k);
  const sharedBrands = bj.shared.map((id) => a.brands.find((x) => x.entity.id === id)?.entity.name ?? id);

  return {
    names: { a: a.dna.name, b: b.dna.name },
    cards: { a: ca, b: cb },
    compatibility,
    breakdown: {
      brandJaccard: bj.score,
      keywordJaccard: kj.score,
      sharedBrands,
      sharedKeywords,
      weights: { brands: W_BRANDS, keywords: W_KEYWORDS },
      levels: Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, Math.round(v * 100)])) as Record<keyof typeof LEVELS, number>,
      formula: `a blend of shared brands ${Math.round(levels.brands * 100)} (×${W_BRANDS}), shared genre tags ${Math.round(levels.genre * 100)} (×${LEVELS.genre}), shared aesthetic words ${Math.round(levels.aesthetic * 100)} (×${W_KEYWORDS}), shared domains ${Math.round(levels.domains * 100)} (×${LEVELS.domains}) and stat shape ${Math.round(levels.shape * 100)} (×${LEVELS.shape})`,
    },
    verdict: verdictFor(compatibility),
    rounds,
    score,
    winner,
    // Consensus keyword names the sign when there is one; otherwise it fuses each side's top word.
    jointSign: { name: consensus[0] ? `The ${consensus[0]} ${house}` : `${k1} × ${k2} ${house}`, glyphKeywords: [k1, k2], keywords: top3, consensus },
    crossover: pickCrossover(a, b),
  };
}
