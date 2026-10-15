import "server-only";
import { GroundingLedger } from "./grounding";
import { chat, llmConfigured, type ChatMessage, type ToolDef } from "./llm";
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

const FLUKE_SHARE = 0.6; // one seed carries ≥60% of Qloo's explained signal
const CONTRADICTION_SIM = 0.2; // seeds whose influence patterns barely overlap
const TARGET = 10;
const MIN_BRANDS = 8;

/** Everything the agent has learned so far in one run. Tools read and write this. */
class RunState {
  ledger = new GroundingLedger();
  calls = 0;
  llmSteps = 0;
  seeds: QEntity[] = [];
  filterTags: string[] = [];
  candidates: QEntity[] = [];
  ablation = new Map<string, Record<string, number>>(); // brandId -> seedId -> drop
  sim: Record<string, Record<string, number>> = {};
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
  constructor(public req: AgentRequest, public emit: Emit) {}

  get liked() {
    return this.req.feedback?.liked ?? [];
  }
  get disliked() {
    return this.req.feedback?.disliked ?? [];
  }
  seedName(id: string) {
    return this.seeds.find((s) => s.id === id)?.name ?? this.ledger.get(id)?.name ?? id;
  }
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
        return hits.find((h) => h.id === s.id) ?? hits[0];
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
    const lists = await Promise.all(queries.map((q) => findTags(q, 8, log).catch(() => [])));
    const all = lists.flat().filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);
    const brandish = all.filter((t) => /brand|fashion|apparel|cloth|beauty|cosmetic|fragrance|skin|footwear|shoe/i.test(t.id + t.name));
    return { value: brandish.slice(0, 12), summary: `${brandish.length} fashion/beauty tag URNs discovered` };
  });
  st.filterTags = tags.map((t) => t.id);
  st.done.add("tags");
  return { filter_tags: tags };
}

async function brandInsights(st: RunState) {
  if (!st.done.has("resolve")) return { error: "call resolve_seeds first" };
  st.emit({ type: "step", id: "insights", label: "Asking Qloo's taste graph for brand affinities", status: "run" });
  const signal = [...st.seeds.map((s) => s.id), ...st.liked];
  const run = (filterTags: string[], log: QlooCallLog[]) =>
    insights({ type: "brand", entityIds: signal, filterTags, excludeIds: st.disliked, take: 40, explain: true }, log);
  const cands = await logged(st, "get_insights", `brand ← ${signal.length} signals${st.filterTags.length ? ` · ${st.filterTags.length} style tags` : ""}`, async (log) => {
    let r = await run(st.filterTags, log);
    if (r.length < MIN_BRANDS + 4 && st.filterTags.length) r = await run([], log);
    return { value: r, summary: `${r.length} brands scored · top: ${r.slice(0, 3).map((b) => `${b.name} ${(b.affinity ?? 0).toFixed(2)}`).join(", ")}` };
  });
  st.candidates = cands.filter((c) => !st.disliked.includes(c.id));
  st.ledger.record(st.candidates);
  st.done.add("insights");
  st.emit({ type: "step", id: "insights", label: `${st.candidates.length} candidate brands with explainability`, status: "done" });
  return { candidates: st.candidates.slice(0, 15).map((c) => ({ id: c.id, name: c.name, affinity: round(c.affinity), explain: shortExplain(st, c) })) };
}

async function ablateSeeds(st: RunState) {
  if (!st.done.has("insights")) return { error: "call get_brand_insights first" };
  st.emit({ type: "step", id: "ablate", label: `Stress-testing: re-querying Qloo ${st.seeds.length}× with one seed removed`, status: "run" });
  const top = st.candidates.slice(0, 24);
  await logged(st, "ablate_seeds", `${st.seeds.length} leave-one-out insight calls`, async (log) => {
    const runs = await Promise.all(
      st.seeds.map(async (s) => {
        const signal = [...st.seeds.filter((x) => x.id !== s.id).map((x) => x.id), ...st.liked];
        const r = await insights({ type: "brand", entityIds: signal, filterTags: st.filterTags, excludeIds: st.disliked, take: 50 }, log);
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
    return { value: null, summary: `Attribution matrix: ${top.length} brands × ${st.seeds.length} seeds` };
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
    out[s.id] = ex !== undefined && c.explain && Object.keys(c.explain).length ? (abTotal > 0 ? 0.6 * ex + 0.4 * abShare : ex) : abShare;
  }
  return out;
}

function critique(st: RunState) {
  if (!st.done.has("ablate")) return { error: "call ablate_seeds first" };
  st.emit({ type: "step", id: "critique", label: "Self-critique: checking for contradictions and one-seed flukes", status: "run" });
  const pool = st.candidates.slice(0, 24);
  const inf = new Map(pool.map((c) => [c.id, influence(st, c)]));

  // Seed similarity = cosine between their influence columns across the pool.
  const ids = st.seeds.map((s) => s.id);
  const col = (id: string) => pool.map((c) => inf.get(c.id)![id] ?? 0);
  st.sim = {};
  st.contradictions = [];
  for (const a of ids) {
    st.sim[a] = {};
    for (const b of ids) st.sim[a][b] = a === b ? 1 : cosine(col(a), col(b));
  }
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      if (st.sim[ids[i]][ids[j]] < CONTRADICTION_SIM) st.contradictions.push({ a: ids[i], b: ids[j], overlap: round(st.sim[ids[i]][ids[j]]) });
  st.contradictions.sort((x, y) => x.overlap - y.overlap);

  const lobes: string[][] = [];
  if (st.contradictions.length) {
    const { a, b } = st.contradictions[0];
    const A = [a], B = [b];
    for (const id of ids) if (id !== a && id !== b) (st.sim[id][a] >= st.sim[id][b] ? A : B).push(id);
    lobes.push(A, B);
    st.critique.push(
      `Contradiction: ${st.seedName(a)} and ${st.seedName(b)} pull toward different brands (overlap ${(st.contradictions[0].overlap * 100).toFixed(0)}%). Splitting your Style DNA into two lobes.`,
    );
  }
  st.lobes = lobes.map((seedIds) => ({ seedIds, keywords: [] }));

  // Flukes: brands whose match collapses onto a single seed.
  const accepted: QEntity[] = [];
  const flagged: { c: QEntity; reason: string }[] = [];
  for (const c of pool) {
    const row = inf.get(c.id)!;
    const sorted = Object.entries(row).sort((x, y) => y[1] - x[1]);
    const [topId, topShare] = sorted[0] ?? ["", 0];
    if (st.seeds.length >= 3 && topShare >= FLUKE_SHARE) {
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
  for (const c of accepted) {
    const cat = categoryOf(c);
    if ((perCat.get(cat) ?? 0) >= 3 || final.length >= TARGET) continue;
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
  if (accepted.length > TARGET) st.critique.push(`Kept the ${TARGET} strongest brands that at least two of your seeds agree on.`);

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
  st.emit({ type: "step", id: "tags", label: "Reading your aesthetic from Qloo's tag graph", status: "run" });
  await logged(st, "get_tags", `urn:tag ← seeds${st.lobes.length ? " + per lobe" : ""}`, async (log) => {
    const signal = [...st.seeds.map((s) => s.id), ...st.liked];
    const [all, ...perLobe] = await Promise.all([
      insights({ type: "tag", entityIds: signal, take: 12 }, log),
      ...st.lobes.map((l) => insights({ type: "tag", entityIds: l.seedIds, take: 4 }, log)),
    ]);
    st.keywords = all.map((t) => ({ id: t.id, name: t.name })).filter((t) => !/^\s*$/.test(t.name)).slice(0, 8);
    perLobe.forEach((r, i) => (st.lobes[i].keywords = r.map((t) => ({ id: t.id, name: t.name })).slice(0, 3)));
    return { value: null, summary: `Top tags: ${st.keywords.slice(0, 5).map((k) => k.name).join(", ")}` };
  });
  st.done.add("tags_dna");
  st.emit({ type: "step", id: "tags", label: "Style keywords pulled from Qloo tags", status: "done", detail: st.keywords.slice(0, 5).map((k) => k.name).join(" · ") });
  return { keywords: st.keywords.map((k) => k.name), lobes: st.lobes.map((l) => ({ seeds: l.seedIds.map((x) => st.seedName(x)), keywords: l.keywords.map((k) => k.name) })) };
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
  return { bridges: st.bridges.map((b) => ({ id: b.entity.id, name: b.entity.name, kind: b.entity.kind })) };
}

function finalize(st: RunState, args: Record<string, unknown>) {
  if (!st.done.has("critique") || !st.done.has("tags_dna")) return { error: "need critique_matches and get_style_tags before finalize" };
  if (typeof args.name === "string") st.name = args.name.slice(0, 40);
  if (typeof args.tagline === "string") st.tagline = args.tagline.slice(0, 140);
  for (const n of (Array.isArray(args.brand_notes) ? args.brand_notes : []) as { id?: string; why?: string }[]) {
    const b = st.final.find((x) => x.entity.id === n.id); // grounded: ignores ids Qloo never returned
    if (b && typeof n.why === "string") b.why = n.why.slice(0, 160);
  }
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
  fn("get_brand_insights", "Ask Qloo insights for brands with the highest taste affinity to the seeds, with per-seed explainability.", {}),
  fn("ablate_seeds", "Re-query Qloo once per seed with that seed removed, to measure how much each seed drives each brand.", {}),
  fn("critique_matches", "Detect contradicting seeds and reject brands carried by a single seed; returns kept and rejected brands.", {}),
  fn("get_style_tags", "Ask Qloo for the aesthetic tags most associated with the seeds (and each lobe if the taste is split).", {}),
  fn("find_taste_bridges", "Ask Qloo for a place, film, artist and book that complete the aesthetic.", {}),
  fn("finalize", "Publish the result. Only reference brand/bridge ids returned by earlier tools.", {
    name: { type: "string", description: "2-4 word Style DNA name built from the Qloo tags, e.g. 'Quiet Romantic Minimalist'" },
    tagline: { type: "string", description: "One sentence describing the person's style, grounded in the tags" },
    brand_notes: {
      type: "array",
      items: { type: "object", properties: { id: { type: "string" }, why: { type: "string" } }, required: ["id", "why"] },
      description: "For each kept brand: ≤18 words linking it to the named seeds that drive it",
    },
    bridge_notes: {
      type: "array",
      items: { type: "object", properties: { id: { type: "string" }, why: { type: "string" } }, required: ["id", "why"] },
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
Plan: resolve_seeds → (find_brand_tags if not in mock mode) → get_brand_insights → ablate_seeds → critique_matches → get_style_tags → find_taste_bridges → finalize.
Before each tool call, write one short sentence of reasoning (what you expect to learn). Be terse.`;

async function dispatch(st: RunState, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "resolve_seeds":
      return st.done.has("resolve") ? { seeds: st.seeds.map((s) => s.name) } : resolveSeeds(st);
    case "find_brand_tags":
      return discoverBrandTags(st, (Array.isArray(args.queries) ? args.queries : ["fashion", "apparel", "beauty"]).map(String).slice(0, 4));
    case "get_brand_insights":
      return brandInsights(st);
    case "ablate_seeds":
      return ablateSeeds(st);
    case "critique_matches":
      return critique(st);
    case "get_style_tags":
      return styleTags(st);
    case "find_taste_bridges":
      return tasteBridges(st);
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
  for (let step = 0; step < 12 && !st.done.has("finalize"); step++) {
    const msg = await chat(messages, TOOLS);
    st.llmSteps++;
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    if (msg.content?.trim()) st.emit({ type: "thought", text: msg.content.trim().slice(0, 300) });
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
  if (!st.done.has("resolve")) await resolveSeeds(st);
  if (!st.done.has("tags")) await discoverBrandTags(st, ["fashion", "apparel", "clothing", "beauty"]);
  if (!st.done.has("insights")) await brandInsights(st);
  if (!st.done.has("ablate")) await ablateSeeds(st);
  if (!st.done.has("critique")) critique(st);
  if (!st.done.has("tags_dna")) await styleTags(st);
  if (!st.done.has("bridges")) await tasteBridges(st);
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
  if (llmConfigured()) {
    emit({ type: "step", id: "plan", label: "Agent planning its Qloo queries", status: "run" });
    try {
      await llmLoop(st);
      planner = "llm";
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

const CATS: [RegExp, string][] = [
  [/fragrance|perfume|parfum/i, "Fragrance"],
  [/skin|beauty|cosmetic|makeup/i, "Skincare & Beauty"],
  [/sneaker|footwear|shoe|boot/i, "Sneakers & Shoes"],
  [/outdoor|outerwear|jacket|coat/i, "Outerwear"],
  [/denim|jean/i, "Denim"],
  [/eyewear|sunglass|optical/i, "Eyewear"],
  [/jewel|watch|bag|accessor|leather/i, "Accessories"],
  [/knit|cashmere/i, "Knitwear"],
];

function categoryOf(c: QEntity): string {
  const hay = `${c.subtitle ?? ""} ${c.tags.map((t) => t.name).join(" ")}`;
  if (c.subtitle && /^(Outerwear|Apparel|Knitwear|Denim|Sneakers|Fragrance|Skincare|Beauty|Eyewear|Accessories|Home & Apparel)$/.test(c.subtitle))
    return ({ Sneakers: "Sneakers & Shoes", Skincare: "Skincare & Beauty", Beauty: "Skincare & Beauty", "Home & Apparel": "Apparel" } as Record<string, string>)[c.subtitle] ?? c.subtitle;
  for (const [re, cat] of CATS) if (re.test(hay)) return cat;
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

function cosine(a: number[], b: number[]) {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    x += a[i] * a[i];
    y += b[i] * b[i];
  }
  return x && y ? d / Math.sqrt(x * y) : 0;
}

const round = (v: number | undefined) => Math.round((v ?? 0) * 1000) / 1000;
