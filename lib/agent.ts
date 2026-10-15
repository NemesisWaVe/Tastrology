import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { GroundingLedger } from "./grounding";
import { chat, llmConfigured, llmPaused, type ChatMessage, type ToolDef } from "./llm";
import { findTags, insights, qlooMode, searchEntities } from "./qloo";
import type {
  AgentRequest,
  BrandMatch,
  Bridge,
  CapsuleSlot,
  Contradiction,
  Lobe,
  QEntity,
  QlooCallLog,
  QTag,
  RejectedBrand,
  StyleResult,
  TraceEvent,
} from "./types";

type Emit = (e: TraceEvent) => void;

/** Bump when agent logic changes so cached results from older logic aren't replayed. */
export const AGENT_VERSION = 8;

const FLUKE_SHARE = 0.6; // one seed carries ≥60% of Qloo's explained signal
const TARGET = 10;
const SIDE_B = 3; // slots reserved for the minority side when the taste is split
const MIN_BRANDS = 8;

/** Everything the agent has learned so far in one run. Tools read and write this. */
class RunState {
  ledger = new GroundingLedger();
  calls = 0;
  llmSteps = 0;
  seeds: QEntity[] = [];
  filterTags: string[] = [];
  /** Qloo aesthetic tags fed back into the brand query as signal.interests.tags. */
  signalTags: string[] = [];
  seedTags = new Map<string, QTag[]>();
  inert: string[] = [];
  candidates: QEntity[] = [];
  ablation = new Map<string, Record<string, number>>(); // brandId -> seedId -> drop
  contradictions: Contradiction[] = [];
  lobes: Lobe[] = [];
  final: BrandMatch[] = [];
  rejected: RejectedBrand[] = [];
  keywords: QTag[] = [];
  bridges: Bridge[] = [];
  critique: string[] = [];
  name = "";
  tagline = "";
  done = new Set<string>();
  /** Step promises, keyed by step; prefetched steps buffer their trace events until the LLM asks for them. */
  steps = new Map<string, { p: Promise<unknown>; buf: TraceEvent[] | null }>();
  speculate = false;
  constructor(public req: AgentRequest, private rawEmit: Emit) {}

  emit = (e: TraceEvent) => (emitCtx.getStore() ?? this.rawEmit)(e);
  emitNow = (e: TraceEvent) => this.rawEmit(e);

  get liked() {
    return this.req.feedback?.liked ?? [];
  }
  get disliked() {
    return this.req.feedback?.disliked ?? [];
  }
  /** Seeds that drive the main brand query: side A when the taste is split. */
  get mainSeeds() {
    return this.lobes.length ? this.seeds.filter((s) => this.lobes[0].seedIds.includes(s.id)) : this.seeds;
  }
  seedName(id: string) {
    return this.seeds.find((s) => s.id === id)?.name ?? this.ledger.get(id)?.name ?? id;
  }
}

/* ---------------------------------------------------- speculative steps */

const emitCtx = new AsyncLocalStorage<Emit>();

type StepKey = "resolve" | "tags" | "tags_dna" | "insights" | "ablate" | "critique" | "bridges";

const STEPS: Record<StepKey, { needs: StepKey[]; run: (st: RunState) => Promise<unknown> }> = {
  resolve: { needs: [], run: resolveSeeds },
  tags: { needs: [], run: (st) => discoverBrandTags(st, ["fashion", "beauty"]) },
  tags_dna: { needs: ["resolve"], run: styleTags },
  insights: { needs: ["resolve", "tags", "tags_dna"], run: brandInsights },
  ablate: { needs: ["insights"], run: ablateSeeds },
  critique: { needs: ["ablate"], run: critique },
  bridges: { needs: ["critique"], run: tasteBridges },
};

/**
 * Runs a pipeline step once. While the LLM is reasoning, the next Qloo step is prefetched
 * (speculative) with its trace events held back; they are released when the LLM actually
 * calls that tool, so the visible trace follows the LLM's own decisions.
 */
function step(st: RunState, key: StepKey, speculative = false): Promise<unknown> {
  const hit = st.steps.get(key);
  if (hit) {
    if (!speculative && hit.buf) {
      const buf = hit.buf;
      hit.buf = null;
      buf.forEach(st.emitNow);
    }
    return hit.p;
  }
  const entry: { p: Promise<unknown>; buf: TraceEvent[] | null } = { p: Promise.resolve(), buf: speculative ? [] : null };
  st.steps.set(key, entry);
  const emitter: Emit = (e) => (entry.buf ? entry.buf.push(e) : st.emitNow(e));
  entry.p = emitCtx.run(emitter, async () => {
    await Promise.all(STEPS[key].needs.map((k) => step(st, k, speculative)));
    const out = await STEPS[key].run(st);
    if (st.speculate) prefetch(st);
    return out;
  });
  entry.p.catch(() => {}); // surfaced when the step is awaited for real
  return entry.p;
}

function prefetch(st: RunState) {
  for (const key of Object.keys(STEPS) as StepKey[])
    if (!st.steps.has(key) && STEPS[key].needs.every((k) => st.done.has(k))) step(st, key, true);
}

/* ------------------------------------------------------------------ tools */

async function logged<T>(st: RunState, name: string, args: string, fn: (log: QlooCallLog[]) => Promise<{ value: T; summary: string }>): Promise<T> {
  const log: QlooCallLog[] = [];
  const { value, summary } = await fn(log);
  st.calls += log.length;
  st.emit({ type: "tool", name, args, calls: log, summary });
  return value;
}

async function resolveSeeds(st: RunState) {
  st.emit({ type: "step", id: "resolve", label: `Resolving ${st.req.seeds.length} taste seeds in Qloo`, status: "run" });
  const resolved = await logged(st, "search_entities", st.req.seeds.map((s) => s.name).join(", "), async (log) => {
    const out = await Promise.all(
      st.req.seeds.map(async (s) => {
        const hits = await searchEntities(s.name, [s.kind], 5, log);
        return (
          hits.find((h) => h.id === s.id) ??
          hits.find((h) => h.name.toLowerCase() === s.name.toLowerCase() && (h.popularity ?? 0) >= 0.5) ??
          hits[0]
        );
      }),
    );
    const ok = out.filter(Boolean) as QEntity[];
    return { value: ok, summary: `${ok.length}/${st.req.seeds.length} seeds matched to Qloo entity IDs` };
  });
  st.seeds = resolved.filter((s, i) => resolved.findIndex((x) => x.id === s.id) === i);
  st.ledger.record(st.seeds);
  st.done.add("resolve");
  st.emit({ type: "step", id: "resolve", label: "Seeds resolved", status: "done", detail: st.seeds.map((s) => s.name).join(" · ") });
  if (st.seeds.length < 2) throw new Error("Need at least 2 seeds that Qloo recognises.");
  return { seeds: st.seeds.map((s) => ({ id: s.id, name: s.name, kind: s.kind })) };
}

async function discoverBrandTags(st: RunState, queries: string[]) {
  // The mock graph has no non-fashion brands; live Qloo's brand space includes cars, soda, banks...
  if (qlooMode() === "mock") {
    st.done.add("tags");
    return { filter_tags: [], note: "mock graph is fashion & beauty only; no filter needed" };
  }
  const tags = await logged(st, "find_tags", queries.join(", "), async (log) => {
    const lists = await Promise.all(queries.map((q) => findTags(q, 10, log, "brand").catch(() => [])));
    const all = lists.flat().filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);
    // Top-level brand genres only (sub-genres like fashion:footwear are covered by their parent).
    const genres = all.filter((t) => /^urn:tag:genre:brand:(fashion|health_and_beauty)$/.test(t.id));
    const picked = genres.length ? genres : [{ id: "urn:tag:genre:brand:fashion", name: "Fashion" }];
    return { value: picked, summary: `Brand genres: ${picked.map((t) => t.id.split(":").pop()).join(", ")}` };
  });
  st.filterTags = tags.map((t) => t.id);
  st.done.add("tags");
  return { filter_tags: tags };
}

async function brandInsights(st: RunState) {
  if (!st.done.has("resolve")) return { error: "call resolve_seeds first" };
  if (!st.done.has("tags_dna")) return { error: "call get_style_tags first: its aesthetic tags steer the brand query" };
  st.emit({ type: "step", id: "insights", label: "Asking Qloo for brands that share your taste and aesthetic", status: "run" });
  const signal = [...st.mainSeeds.map((s) => s.id), ...st.liked];
  const run = (filterTags: string[], tagIds: string[], log: QlooCallLog[]) =>
    insights({ type: "brand", entityIds: signal, tagIds, filterTags, excludeIds: st.disliked, popularity: POP_BAND(), take: 40, explain: true }, log).then(styleBrands);
  const cands = await logged(
    st,
    "get_insights",
    `brand ← ${signal.length} entities + ${st.signalTags.length} aesthetic tags${st.filterTags.length ? ` · genre filter` : ""}`,
    async (log) => {
      let r = await run(st.filterTags, st.signalTags, log);
      if (r.length < MIN_BRANDS + 4 && st.signalTags.length) {
        st.signalTags = [];
        r = await run(st.filterTags, [], log);
      }
      if (r.length < MIN_BRANDS + 4 && st.filterTags.length) r = await run([], [], log);
      return { value: r, summary: `${r.length} brands scored · top: ${r.slice(0, 3).map((b) => `${b.name} ${(b.affinity ?? 0).toFixed(2)}`).join(", ")}` };
    },
  );
  st.candidates = cands.filter((c) => !st.disliked.includes(c.id));
  st.ledger.record(st.candidates);
  st.done.add("insights");
  st.emit({ type: "step", id: "insights", label: `${st.candidates.length} candidate brands with explainability`, status: "done" });
  return { candidates: st.candidates.slice(0, 15).map((c) => ({ id: c.id, name: c.name, affinity: round(c.affinity), explain: shortExplain(st, c) })) };
}

async function ablateSeeds(st: RunState) {
  if (!st.done.has("insights")) return { error: "call get_brand_insights first" };
  const main = st.mainSeeds;
  st.emit({ type: "step", id: "ablate", label: `Stress-testing: re-querying Qloo ${main.length}× with one seed removed`, status: "run" });
  const top = st.candidates.slice(0, 24);
  await logged(st, "ablate_seeds", `${main.length} leave-one-out insight calls`, async (log) => {
    const runs = await Promise.all(
      main.map(async (s) => {
        const signal = [...main.filter((x) => x.id !== s.id).map((x) => x.id), ...st.liked];
        const r = await insights({ type: "brand", entityIds: signal, tagIds: st.signalTags, filterTags: st.filterTags, excludeIds: st.disliked, popularity: POP_BAND(), take: 50 }, log);
        st.ledger.record(r);
        return { seed: s.id, r };
      }),
    );
    for (const c of top) {
      const row: Record<string, number> = {};
      for (const { seed, r } of runs) {
        const hit = r.find((x) => x.id === c.id);
        const floor = r.length ? Math.min(...r.map((x) => x.affinity ?? 0)) : 0;
        const without = hit?.affinity ?? floor; // fell out of the top 50 → at most the floor
        row[seed] = Math.max(0, (c.affinity ?? 0) - without);
      }
      st.ablation.set(c.id, row);
    }
    return { value: null, summary: `Attribution matrix: ${top.length} brands × ${main.length} seeds` };
  });
  st.done.add("ablate");
  st.emit({ type: "step", id: "ablate", label: "Attribution matrix computed", status: "done" });
  return { matrix_rows: top.length };
}

/** Combined per-seed influence: Qloo explainability, else normalized ablation drop. */
function influence(st: RunState, c: QEntity): Record<string, number> {
  const out: Record<string, number> = {};
  const ab = st.ablation.get(c.id) ?? {};
  const abTotal = Object.values(ab).reduce((a, b) => a + b, 0);
  for (const s of st.seeds) {
    const ex = c.explain?.[s.id];
    const abShare = abTotal > 0 ? (ab[s.id] ?? 0) / abTotal : 0;
    // Live explainability is close to uniform across seeds, so measured ablation carries most of the weight.
    out[s.id] = ex !== undefined && c.explain && Object.keys(c.explain).length ? (abTotal > 0 ? 0.3 * ex + 0.7 * abShare : ex) : abShare;
  }
  return out;
}

async function critique(st: RunState) {
  if (!st.done.has("ablate")) return { error: "call ablate_seeds first" };
  st.emit({ type: "step", id: "critique", label: "Self-critique: checking for contradictions and one-seed flukes", status: "run" });
  const pool = st.candidates.slice(0, 24);
  const inf = new Map(pool.map((c) => [c.id, influence(st, c)]));
  const ids = st.mainSeeds.map((s) => s.id);
  const col = (id: string) => pool.map((c) => inf.get(c.id)![id] ?? 0);

  // Inert seeds: Qloo barely links them to any of these brands. Not a contradiction, just quiet.
  const weight = Object.fromEntries(ids.map((id) => [id, col(id).reduce((a, b) => a + b, 0) / Math.max(1, pool.length)]));
  st.inert = ids.length >= 3 ? ids.filter((id) => weight[id] < 0.35 / ids.length) : [];
  for (const id of st.inert)
    st.critique.push(`${st.seedName(id)} barely moves your brand matches (avg influence ${(weight[id] * 100).toFixed(0)}%). It still shapes your DNA, but it isn't steering brand picks.`);

  // Flukes: brands whose match collapses onto a single seed.
  const accepted: QEntity[] = [];
  const flagged: { c: QEntity; reason: string }[] = [];
  for (const c of pool) {
    const row = inf.get(c.id)!;
    const sorted = Object.entries(row).sort((x, y) => y[1] - x[1]);
    const [topId, topShare] = sorted[0] ?? ["", 0];
    if (ids.length >= 3 && topShare >= FLUKE_SHARE) {
      flagged.push({ c, reason: `Carried by one seed: ${st.seedName(topId)} accounts for ${(topShare * 100).toFixed(0)}% of the signal. Fragile match.` });
    } else if (passesBudget(st, c)) {
      accepted.push(c);
    } else {
      flagged.push({ c, reason: `Over your budget band.` });
    }
  }
  // Spread across categories so the capsule plan has range (max 3 per category).
  const final: QEntity[] = [];
  const perCat = new Map<string, number>();
  const target = st.lobes.length ? TARGET - SIDE_B : TARGET;
  for (const c of accepted) {
    const cat = categoryOf(c);
    if ((perCat.get(cat) ?? 0) >= 3 || final.length >= target) continue;
    perCat.set(cat, (perCat.get(cat) ?? 0) + 1);
    final.push(c);
  }
  for (const c of accepted) if (final.length < MIN_BRANDS && !final.includes(c)) final.push(c);
  for (const f of flagged) {
    if (final.length >= MIN_BRANDS) break;
    if (f.reason.startsWith("Over")) continue;
    final.push(f.c); // backfill rather than show too few
  }
  final.sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0));
  st.rejected = flagged.filter((f) => !final.includes(f.c)).slice(0, 6).map((f) => ({ entity: f.c, affinity: round(f.c.affinity), reason: f.reason }));
  for (const r of st.rejected.filter((r) => r.reason.startsWith("Carried")).slice(0, 2))
    st.critique.push(`Rejected ${r.entity.name} (affinity ${r.affinity.toFixed(2)}): ${r.reason}`);
  if (accepted.length > target) st.critique.push(`Kept the ${target} strongest brands that at least two of your seeds agree on.`);

  st.final = final.map((c) => {
    const row = inf.get(c.id)!;
    const because = Object.entries(row).sort((x, y) => y[1] - x[1]).filter(([, v]) => v > 0.05).slice(0, 2).map(([k]) => k);
    return {
      entity: c,
      affinity: round(c.affinity),
      category: categoryOf(c),
      explain: Object.fromEntries(Object.entries(row).map(([k, v]) => [k, round(v)])),
      ablation: Object.fromEntries(Object.entries(st.ablation.get(c.id) ?? {}).map(([k, v]) => [k, round(v)])),
      because,
    };
  });

  // Re-plan for the minority side: its own Qloo query, so it gets real picks instead of being averaged away.
  if (st.lobes.length) {
    const side = st.lobes[1];
    st.emit({ type: "step", id: "sideb", label: `Re-planning: separate Qloo query for your ${side.seedIds.map((x) => st.seedName(x)).join(" + ")} side`, status: "run" });
    const picks = await logged(st, "get_insights", `brand ← side B seeds + ${side.keywords.length} side tags`, async (log) => {
      const r = await insights(
        { type: "brand", entityIds: [...side.seedIds, ...st.liked], tagIds: side.keywords.map((k) => k.id), filterTags: st.filterTags, excludeIds: [...st.disliked, ...st.final.map((b) => b.entity.id)], popularity: POP_BAND(), take: 20, explain: true },
        log,
      ).then(styleBrands);
      st.ledger.record(r);
      const ok = r.filter((c) => passesBudget(st, c)).slice(0, SIDE_B);
      return { value: ok, summary: ok.map((b) => b.name).join(", ") };
    });
    for (const c of picks)
      st.final.push({
        entity: c,
        affinity: round(c.affinity),
        category: categoryOf(c),
        explain: Object.fromEntries(side.seedIds.map((id) => [id, round(1 / side.seedIds.length)])),
        ablation: {},
        because: side.seedIds.slice(0, 2),
        side: 1,
      });
    // A side-B pick may have been rejected as a main-list fluke; it's legitimate on its own side.
    st.rejected = st.rejected.filter((r) => !picks.some((p) => p.id === r.entity.id));
    st.critique = st.critique.filter((c) => !picks.some((p) => c.startsWith(`Rejected ${p.name} (`)));
    st.emit({ type: "step", id: "sideb", label: `${picks.length} side-B picks added`, status: "done" });
  }
  st.done.add("critique");
  st.emit({
    type: "step",
    id: "critique",
    label: `${st.final.length} brands kept, ${st.rejected.length} rejected`,
    status: st.contradictions.length ? "warn" : "done",
    detail: st.contradictions.length ? `${st.contradictions.length} contradicting seed pair(s)` : "Seeds agree with each other",
  });
  return {
    kept: st.final.map((b) => ({ id: b.entity.id, name: b.entity.name, affinity: b.affinity, because: b.because.map((x) => st.seedName(x)) })),
    rejected: st.rejected.map((r) => ({ name: r.entity.name, reason: r.reason })),
    contradictions: st.contradictions.slice(0, 3).map((c) => `${st.seedName(c.a)} vs ${st.seedName(c.b)} (overlap ${c.overlap})`),
  };
}

async function styleTags(st: RunState) {
  if (!st.done.has("resolve")) return { error: "call resolve_seeds first" };
  st.emit({ type: "step", id: "tags", label: `Reading the aesthetic of each of your ${st.seeds.length} loves in Qloo's tag graph`, status: "run" });
  await logged(st, "get_tags", `urn:tag ← each seed separately`, async (log) => {
    // Live: only Qloo's fashion vocabularies (personal style + aesthetic properties), not genre/venue tags.
    const tagTypes = qlooMode() === "live" ? STYLE_TAG_TYPES : undefined;
    const per = await Promise.all(st.seeds.map((s) => insights({ type: "tag", entityIds: [s.id], tagTypes, take: 12 }, log).catch(() => [])));
    per.forEach((r, i) => {
      st.ledger.record(r);
      st.seedTags.set(st.seeds[i].id, dedupeTags(r));
    });
    // Consensus: a tag scores by how many seeds share it, so one loud seed can't hijack the DNA.
    st.keywords = consensus(st, st.seeds.map((s) => s.id)).slice(0, 8);
    st.signalTags = st.keywords.slice(0, 5).map((k) => k.id);
    return { value: null, summary: `Consensus: ${st.keywords.slice(0, 5).map((k) => k.name).join(", ")}` };
  });
  aestheticSplit(st);
  st.done.add("tags_dna");
  st.emit({
    type: "step",
    id: "tags",
    label: st.lobes.length ? "Your loves disagree on aesthetics: DNA split into two sides" : "Aesthetic consensus found, feeding it into the brand query",
    status: st.lobes.length ? "warn" : "done",
    detail: st.keywords.slice(0, 5).map((k) => k.name).join(" · "),
  });
  return {
    keywords: st.keywords.map((k) => k.name),
    sides: st.lobes.map((l) => ({ seeds: l.seedIds.map((x) => st.seedName(x)), keywords: l.keywords.map((k) => k.name) })),
  };
}

/** Tags ranked by how many of the given seeds share them (rank-weighted). */
function consensus(st: RunState, seedIds: string[]): QTag[] {
  const score = new Map<string, { tag: QTag; s: number; n: number }>();
  for (const id of seedIds)
    (st.seedTags.get(id) ?? []).forEach((t, rank) => {
      const k = t.name.toLowerCase();
      const cur = score.get(k) ?? { tag: t, s: 0, n: 0 };
      cur.s += 1 - rank / 24;
      cur.n += 1;
      score.set(k, cur);
    });
  return [...score.values()].sort((a, b) => b.n - a.n || b.s - a.s).map((x) => x.tag);
}

/** Seeds whose aesthetic tag sets don't overlap at all form two "sides". */
function aestheticSplit(st: RunState) {
  const ids = st.seeds.map((s) => s.id).filter((id) => (st.seedTags.get(id)?.length ?? 0) >= 5);
  if (ids.length < 3) return;
  const names = (id: string) => new Set((st.seedTags.get(id) ?? []).map((t) => t.name.toLowerCase()));
  const jac = (a: string, b: string) => {
    const A = names(a), B = names(b);
    const inter = [...A].filter((x) => B.has(x)).length;
    return inter / (A.size + B.size - inter || 1);
  };
  // Each seed's average agreement with the others; the odd one out anchors side B.
  const avg = ids.map((id) => ({ id, a: ids.filter((x) => x !== id).reduce((t, x) => t + jac(id, x), 0) / (ids.length - 1) }));
  avg.sort((x, y) => x.a - y.a);
  const odd = avg[0];
  const rest = avg.slice(1).reduce((t, x) => t + x.a, 0) / (avg.length - 1);
  if (!(odd.a < 0.06 && rest > odd.a * 3 + 0.05)) return;
  const B = [odd.id, ...ids.filter((id) => id !== odd.id && jac(id, odd.id) > 0.25)];
  const A = st.seeds.map((s) => s.id).filter((id) => !B.includes(id));
  st.lobes = [A, B].map((seedIds) => ({ seedIds, keywords: consensus(st, seedIds).slice(0, 3) }));
  st.keywords = consensus(st, A).slice(0, 8);
  st.signalTags = st.keywords.slice(0, 5).map((k) => k.id);
  const other = A.reduce((best, id) => (jac(id, odd.id) < jac(best, odd.id) ? id : best), A[0]);
  st.contradictions.push({ a: other, b: odd.id, overlap: round(jac(other, odd.id)) });
  st.critique.push(
    `Contradiction: ${st.seedName(odd.id)} shares almost no aesthetic with your other loves (tag overlap ${(odd.a * 100).toFixed(0)}% vs ${(rest * 100).toFixed(0)}% among the rest). Main DNA built from the majority; ${st.seedName(odd.id)} gets its own side.`,
  );
}

async function tasteBridges(st: RunState) {
  if (!st.done.has("critique")) return { error: "call critique_matches first" };
  st.emit({ type: "step", id: "bridges", label: "Finding cross-domain taste bridges", status: "run" });
  const seedIds = new Set(st.seeds.map((s) => s.id));
  const signal = [...st.seeds.map((s) => s.id), ...st.final.slice(0, 3).map((b) => b.entity.id)];
  const kinds = ["place", "movie", "artist", "book"] as const;
  await logged(st, "get_insights", `place/movie/artist/book ← seeds + top brands`, async (log) => {
    const lists = await Promise.all(kinds.map((k) => insights({ type: k, entityIds: signal, excludeIds: [...seedIds], take: 6, explain: true }, log).catch(() => [])));
    lists.forEach((l) => st.ledger.record(l));
    const picks: Bridge[] = [];
    for (const l of lists) {
      const pick = l.find((e) => !seedIds.has(e.id));
      if (!pick) continue;
      const because = Object.entries(pick.explain ?? {}).sort((a, b) => b[1] - a[1]).map(([k]) => k).filter((k) => st.ledger.has(k)).slice(0, 2);
      picks.push({ entity: pick, because });
    }
    st.bridges = picks.slice(0, 3);
    return { value: null, summary: st.bridges.map((b) => `${b.entity.name} (${b.entity.kind})`).join(", ") };
  });
  st.done.add("bridges");
  st.emit({ type: "step", id: "bridges", label: `${st.bridges.length} taste bridges found`, status: "done" });
  return { bridges: st.bridges.map((b) => ({ id: b.entity.id, name: b.entity.name, kind: b.entity.kind, driven_by: b.because.map((x) => st.seedName(x)) })) };
}

function finalize(st: RunState, args: Record<string, unknown>) {
  if (!st.done.has("critique") || !st.done.has("tags_dna")) return { error: "need critique_matches and get_style_tags before finalize" };
  if (typeof args.name === "string") st.name = args.name.slice(0, 40);
  if (typeof args.tagline === "string") st.tagline = args.tagline.slice(0, 140);
  // Brand lines stay measured ("x% of this match traces to…"); the LLM only phrases bridges.
  for (const n of (Array.isArray(args.bridge_notes) ? args.bridge_notes : []) as { id?: string; why?: string }[]) {
    const b = st.bridges.find((x) => x.entity.id === n.id);
    if (b && typeof n.why === "string") b.why = n.why.slice(0, 160);
  }
  st.done.add("finalize");
  return { ok: true };
}

/* ------------------------------------------------------------- LLM loop */

const TOOLS: ToolDef[] = [
  fn("resolve_seeds", "Resolve the user's taste seeds to Qloo entity IDs via Qloo search.", {}),
  fn("find_brand_tags", "Search Qloo's tag catalog for tag URNs that restrict brand results to fashion & beauty.", {
    queries: { type: "array", items: { type: "string" }, description: "e.g. ['fashion','apparel','beauty']" },
  }),
  fn("get_style_tags", "Ask Qloo for the aesthetic/personal-style tags most associated with the seeds. These tags are then fed into the brand query.", {}),
  fn("get_brand_insights", "Ask Qloo insights for brands with the highest affinity to the seeds AND the aesthetic tags, with per-seed explainability.", {}),
  fn("ablate_seeds", "Re-query Qloo once per seed with that seed removed, to measure how much each seed drives each brand.", {}),
  fn("critique_matches", "Find inert seeds, contradicting seeds (splits the DNA into two sides) and brands carried by a single seed; returns kept and rejected brands.", {}),
  fn("find_taste_bridges", "Ask Qloo for a place, film, artist and book that complete the aesthetic.", {}),
  fn("finalize", "Publish the result. Only reference brand/bridge ids returned by earlier tools.", {
    name: { type: "string", description: "2-4 word Style DNA name built from the Qloo tags, e.g. 'Quiet Romantic Minimalist'" },
    tagline: { type: "string", description: "One sentence describing the person's style, grounded in the tags" },
    bridge_notes: {
      type: "array",
      items: { type: "object", properties: { id: { type: "string" }, why: { type: "string" } }, required: ["id", "why"] },
      description: "For each bridge: ≤14 words citing its driven_by entities. No invented facts.",
    },
  }),
];

function fn(name: string, description: string, properties: Record<string, unknown>): ToolDef {
  return { type: "function", function: { name, description, parameters: { type: "object", properties } } };
}

const SYSTEM = `You are TasteMirror, a style agent. You turn a person's taste in music, film, books, places and games into a Style DNA and fashion/beauty brand matches.
Hard rules:
- Every brand, place or title you mention must come from a tool result. Never invent recommendations or IDs.
- Style keywords come from get_style_tags, not from you.
Plan: resolve_seeds → find_brand_tags (skip in mock mode) → get_style_tags → get_brand_insights → ablate_seeds → critique_matches → find_taste_bridges → finalize.
In finalize, name the Style DNA (2-4 words) from the Qloo keywords, and the tension between the two sides if the taste was split. Write one tagline sentence and a short note per taste bridge citing its driven_by entities.
Before each tool call, write one short sentence of reasoning (what you expect to learn). Be terse.`;

async function dispatch(st: RunState, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "resolve_seeds":
      return step(st, "resolve");
    case "find_brand_tags":
      return step(st, "tags");
    case "get_style_tags":
      return step(st, "tags_dna");
    case "get_brand_insights":
      return step(st, "insights");
    case "ablate_seeds":
      return step(st, "ablate");
    case "critique_matches":
      return step(st, "critique");
    case "find_taste_bridges":
      return step(st, "bridges");
    case "finalize":
      return finalize(st, args);
    default:
      return { error: `unknown tool ${name}` };
  }
}

async function llmLoop(st: RunState) {
  const seedList = st.req.seeds.map((s) => `${s.name} (${s.kind})`).join(", ");
  const fb = st.req.feedback?.liked.length || st.req.feedback?.disliked.length ? `\nFeedback this round: liked ${st.liked.length} brand(s), disliked ${st.disliked.length}. They are already wired into the Qloo signals.` : "";
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Seeds: ${seedList}.${st.req.goal ? `\nStyle goal: ${st.req.goal}` : ""}\nQloo mode: ${qlooMode()}.${fb}` },
  ];
  st.speculate = true;
  prefetch(st); // Qloo work starts while the LLM reads the brief
  for (let turn = 0; turn < 12 && !st.done.has("finalize"); turn++) {
    const msg = await chat(messages, TOOLS);
    st.llmSteps++;
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    if (msg.content?.trim()) st.emit({ type: "thought", text: msg.content.trim().slice(0, 300) });
    else if (msg.tool_calls?.length) st.emit({ type: "thought", text: `Planner → ${msg.tool_calls.map((t) => t.function.name).join(", ")}` });
    if (!msg.tool_calls?.length) {
      messages.push({ role: "user", content: "Continue with the next tool call." });
      continue;
    }
    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {}
      const out = await dispatch(st, tc.function.name, args);
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(out).slice(0, 6000) });
    }
  }
}

/** Deterministic planner: same tools, fixed order. Used without an LLM key, and to finish any step the LLM skipped. */
async function autopilot(st: RunState) {
  st.speculate = false;
  // Same steps in order; anything already run (or prefetched) is reused and its trace released.
  for (const key of Object.keys(STEPS) as StepKey[]) await step(st, key);
}

function fillCopy(st: RunState) {
  const kw = st.keywords.map((k) => k.name);
  if (!st.name) st.name = kw.slice(0, 2).join(" ") + (kw[2] ? ` · ${kw[2]}` : "") || "Your Style DNA";
  if (!st.tagline) st.tagline = `Qloo reads your taste as ${kw.slice(0, 3).join(", ").toLowerCase()}${st.lobes.length ? ", with two distinct sides" : ""}.`;
  for (const b of st.final) {
    if (b.why) continue;
    const names = b.because.map((x) => st.seedName(x));
    const share = b.because.reduce((t, x) => t + (b.explain[x] ?? 0), 0);
    b.why = names.length ? `Because you love ${names.join(" and ")}: ${(share * 100).toFixed(0)}% of this match traces to them.` : "Broad match across your seeds.";
  }
  for (const b of st.bridges) {
    if (b.why) continue;
    const names = b.because.map((x) => st.seedName(x));
    b.why = names.length ? `Shares taste DNA with ${names.join(" and ")}.` : "Completes the aesthetic.";
  }
}

/* --------------------------------------------------------------- entry */

export async function runAgent(req: AgentRequest, emit: Emit): Promise<StyleResult> {
  const t0 = Date.now();
  const st = new RunState(req, emit);
  let planner: "llm" | "autopilot" = "autopilot";
  if (llmConfigured() && llmPaused()) {
    emit({ type: "thought", text: "LLM planner is cooling down after a rate limit. Running the deterministic planner over the same Qloo tools." });
  } else if (llmConfigured()) {
    emit({ type: "step", id: "plan", label: "Agent planning its Qloo queries", status: "run" });
    try {
      await llmLoop(st);
      planner = "llm";
      emit({ type: "step", id: "plan", label: `Agent planned ${st.llmSteps} steps`, status: "done" });
    } catch (err) {
      emit({ type: "step", id: "plan", label: "LLM unavailable, continuing on autopilot", status: "warn", detail: String((err as Error).message) });
    }
  } else {
    emit({ type: "thought", text: "No LLM key configured. Running the deterministic planner over the same Qloo tools." });
  }
  await autopilot(st); // no-op for steps the LLM already completed
  fillCopy(st);

  const result: StyleResult = {
    runId: Math.random().toString(36).slice(2, 10),
    mode: qlooMode(),
    planner,
    createdAt: Date.now(),
    seeds: st.seeds,
    dna: { name: st.name, tagline: st.tagline, keywords: st.keywords.slice(0, 5), lobes: st.lobes },
    brands: st.final,
    rejected: st.rejected,
    contradictions: st.contradictions.slice(0, 3),
    bridges: st.bridges,
    capsule: capsule(st.final),
    critique: st.critique,
    stats: { qlooCalls: st.calls, ms: Date.now() - t0, llmSteps: st.llmSteps },
    feedback: req.feedback,
  };
  if (req.previous) result.changes = diff(st, req.previous.brandIds);
  // Final grounding gate: anything not returned by Qloo in this run is dropped.
  result.brands = st.ledger.filter(result.brands, (b) => b.entity.id).kept;
  result.bridges = st.ledger.filter(result.bridges, (b) => b.entity.id).kept;
  return result;
}

function diff(st: RunState, prev: string[]): StyleResult["changes"] {
  const label = (id: string) => st.ledger.get(id)?.name ?? st.req.previous?.names?.[id]?.slice(0, 80) ?? "a brand";
  const now = st.final.map((b) => b.entity.id);
  const added = now.filter((id) => !prev.includes(id));
  const removed = prev.filter((id) => !now.includes(id) && !st.liked.includes(id));
  const why: string[] = [];
  for (const id of st.disliked.filter((x) => prev.includes(x)))
    why.push(`Excluded ${label(id)} from every Qloo query (filter.exclude.entities).`);
  if (st.liked.length)
    why.push(`Added ${st.liked.map(label).join(", ")} as extra Qloo signals (signal.interests.entities), so brands near them gained affinity.`);
  for (const id of added.slice(0, 3)) {
    const b = st.final.find((x) => x.entity.id === id)!;
    const liked = st.liked.map((l) => ({ l, s: b.entity.explain?.[l] ?? 0 })).sort((x, y) => y.s - x.s)[0];
    why.push(
      liked && liked.s > 0.05
        ? `${b.entity.name} entered: ${(liked.s * 100).toFixed(0)}% of its signal comes from your 👍 on ${label(liked.l)}.`
        : `${b.entity.name} moved up into your top ${st.final.length}.`,
    );
  }
  const named = (ids: string[]) => ids.map((id) => ({ id, name: label(id) }));
  return { added: named(added), removed: named(removed), why };
}

/** Qloo brand genre (urn:tag:genre:brand:…) → capsule category, most specific first. */
const GENRE_CATS: [RegExp, string][] = [
  [/fashion:(haute_couture|formalwear)$/, "Designer & Tailoring"],
  [/health_and_beauty:skincare$/, "Skincare & Beauty"],
  [/health_and_beauty:(fragrance|perfume)/, "Fragrance"],
  [/health_and_beauty$/, "Skincare & Beauty"],
  [/fashion:jeans$/, "Denim"],
  [/fashion:footwear/, "Shoes & Sneakers"],
  [/fashion:accessories:eyewear$/, "Eyewear"],
  [/fashion:accessories:watch$/, "Watches"],
  [/fashion:accessories:bags_and_leather$/, "Bags & Leather"],
  [/fashion:accessories:jewel/, "Jewellery"],
  [/fashion:(outerwear|outdoor)/, "Outerwear"],
  [/fashion:athletic$/, "Activewear"],
  [/fashion:accessories$/, "Accessories"],
];

const MOCK_CATS: Record<string, string> = { Sneakers: "Shoes & Sneakers", Skincare: "Skincare & Beauty", Beauty: "Skincare & Beauty", "Home & Apparel": "Apparel" };

function categoryOf(c: QEntity): string {
  if (c.id.startsWith("mock-") && c.subtitle) return MOCK_CATS[c.subtitle] ?? c.subtitle;
  const genres = c.tags.map((t) => t.id).filter((id) => id.startsWith("urn:tag:genre:brand:"));
  for (const [re, cat] of GENRE_CATS) if (genres.some((g) => re.test(g))) return cat;
  return "Apparel";
}

function capsule(brands: BrandMatch[]): CapsuleSlot[] {
  const m = new Map<string, string[]>();
  for (const b of brands) m.set(b.category, [...(m.get(b.category) ?? []), b.entity.id]);
  return [...m.entries()].map(([category, brandIds]) => ({ category, brandIds: brandIds.slice(0, 3) })).slice(0, 7);
}

function passesBudget(st: RunState, c: QEntity) {
  return !st.req.budget || !c.tier || c.tier <= st.req.budget;
}

function shortExplain(st: RunState, c: QEntity) {
  return Object.entries(c.explain ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k, v]) => `${st.seedName(k)} ${(v * 100).toFixed(0)}%`)
    .join(", ");
}


const round = (v: number | undefined) => Math.round((v ?? 0) * 1000) / 1000;

const STYLE_TAG_TYPES = ["urn:tag:personal_style:qloo", "urn:tag:aesthetic_property:qloo"];

/** Live only: skip mass-market giants (taste, not bestsellers) and zero-popularity junk. */
const POP_BAND = () => (qlooMode() === "live" ? { min: 0.3, max: 0.97 } : undefined);

/** Live only: keep brands Qloo actually describes with a personal style (drops contact lenses, razors…). */
function styleBrands(list: QEntity[]): QEntity[] {
  if (qlooMode() !== "live") return list;
  const styled = list.filter((e) => e.style?.length);
  return styled.length >= MIN_BRANDS ? styled : list;
}

function dedupeTags(list: QEntity[]): QTag[] {
  const seen = new Set<string>();
  const out: QTag[] = [];
  for (const t of list) {
    const k = t.name.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ id: t.id, name: t.name.trim() });
  }
  return out;
}
