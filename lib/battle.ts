import { buildCard, type CardData } from "./card";
import type { QEntity, StyleResult } from "./types";

/**
 * Taste Battle: two results face off. Pure and deterministic (no network, no randomness) so it is
 * unit-testable, and every line it writes is templated from fields in the two results: seed names,
 * contradictions, rejected picks, inert seeds, shared brands and keywords. It roasts the taste, never the person.
 */

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
    formula: string;
  };
  verdict: { label: string; line: string };
  rounds: BattleRound[];
  score: { a: number; b: number };
  winner: Side | "tie";
  jointSign: JointSign;
  crossover: Crossover | null;
}

const W_BRANDS = 0.4;
const W_KEYWORDS = 0.6;

const MEASURES: Record<StatName, string> = {
  Range: "how many taste domains your loves span",
  Edge: "how far your brands sit from the mainstream",
  Cohesion: "whether your loves agree with each other",
  Signal: "how strongly Qloo backs your top brands",
};

const norm = (s: string) => s.trim().toLowerCase();

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
  if (c >= 70) return { label: "Taste twins", line: "Same group chat energy. Suspiciously so." };
  if (c >= 45) return { label: "Co-signers", line: "You'd swap recommendations and actually take them." };
  if (c >= 25) return { label: "Situationship", line: "Overlap exists. Nobody is ready to define it." };
  if (c >= 10) return { label: "Opposites, attractive", line: "Different planets, same orbit. The crossover brand is your treaty." };
  return { label: "Parallel universes", line: "Zero shared language. Which is exactly why the joint sign is interesting." };
}

export function battle(a: StyleResult, b: StyleResult): BattleResult {
  const ca = buildCard(a);
  const cb = buildCard(b);

  const bj = jaccard(
    a.brands.map((x) => x.entity.id),
    b.brands.map((x) => x.entity.id),
  );
  const ak = keywordNames(a);
  const bk = keywordNames(b);
  const kj = jaccard(ak.map(norm), bk.map(norm));
  // Square-root curve so small real overlaps register on a 0-100 dial; identical = 100, disjoint = 0.
  const compatibility = Math.round(100 * (W_BRANDS * Math.sqrt(bj.score) + W_KEYWORDS * Math.sqrt(kj.score)));

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
      formula: `${W_BRANDS * 100}% shared brands (√Jaccard ${bj.shared.length}/${new Set([...a.brands, ...b.brands].map((x) => x.entity.id)).size}) + ${W_KEYWORDS * 100}% shared aesthetic (√Jaccard ${kj.shared.length}/${new Set([...ak, ...bk].map(norm)).size})`,
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
