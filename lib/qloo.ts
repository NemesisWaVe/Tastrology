import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { kvCache, sharedCache, MAX_TTL_MS } from "./cache";
import { mockQloo } from "./mock/server";
import { bumpDaily } from "./ratelimit";
import type { EntityKind, InsightsParams, QEntity, QlooCallLog, QTag } from "./types";

export const qlooMode = (): "live" | "mock" =>
  process.env.QLOO_MODE === "live" && process.env.QLOO_API_KEY ? "live" : "mock";

const BASE = () => (process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com").replace(/\/$/, "");

// /search spells it "videogame", /v2/insights spells it "video_game".
const searchUrn = (k: EntityKind) => `urn:entity:${k}`;
const insightsUrn = (k: EntityKind) => `urn:entity:${k === "videogame" ? "video_game" : k}`;

function kindOf(raw: Record<string, unknown>): EntityKind {
  const cands = [raw.subtype, ...(Array.isArray(raw.types) ? raw.types : []), raw.type].filter(
    (x): x is string => typeof x === "string" && x.startsWith("urn:entity:"),
  );
  const k = (cands[0] ?? "urn:entity:brand").replace("urn:entity:", "").replace("video_game", "videogame");
  return k as EntityKind;
}

function normTags(raw: unknown): QTag[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t: Record<string, unknown>) => ({ id: String(t.id ?? t.tag_id ?? ""), name: String(t.name ?? "") }))
    .filter((t) => t.id && t.name);
}

function normEntity(raw: Record<string, unknown>): QEntity {
  const props = (raw.properties ?? {}) as Record<string, unknown>;
  const img = props.image as { url?: string } | string | undefined;
  const query = (raw.query ?? {}) as Record<string, unknown>;
  const ex = (query.explainability ?? {}) as Record<string, unknown>;
  const exList = ex["signal.interests.entities"];
  let explain: Record<string, number> | undefined;
  if (Array.isArray(exList)) {
    explain = {};
    for (const x of exList as Record<string, unknown>[]) {
      const id = String(x.entity_id ?? x.id ?? "");
      if (id) explain[id] = Number(x.score ?? 0);
    }
  }
  const pop = raw.popularity ?? props.popularity;
  const strs = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "" && !/^(null|undefined|n\/a)$/i.test(x.trim())) : [];
  const style = [...strs(props.personal_style), ...strs(props.aesthetic_properties)].filter((s, i, a) => a.indexOf(s) === i).slice(0, 5);
  const priceMin = typeof props.price_range_usd_min === "number" ? props.price_range_usd_min : undefined;
  const liveTier = priceMin === undefined ? undefined : priceMin < 60 ? 1 : priceMin < 250 ? 2 : 3;
  // Real links only: the brand's own site, else its Instagram handle (shapes seen: {id} or [{id}]).
  const site = typeof props.official_site === "string" && /^https?:\/\/[^\s]+$/i.test(props.official_site) ? props.official_site : undefined;
  const ig = (props.external as Record<string, unknown> | undefined)?.instagram;
  const igId = (Array.isArray(ig) ? ig[0] : ig) as { id?: unknown } | undefined;
  const instagram = typeof igId?.id === "string" && /^[A-Za-z0-9._]{1,30}$/.test(igId.id) ? igId.id : undefined;
  const founded = typeof props.founded_year === "string" || typeof props.founded_year === "number" ? String(props.founded_year).slice(0, 4) : undefined;
  return {
    id: String(raw.entity_id ?? raw.id),
    name: String(raw.name),
    kind: kindOf(raw),
    image: typeof img === "string" ? img : img?.url,
    subtitle: (props.short_description as string) ?? (props.mock_category as string) ?? undefined,
    tags: normTags(raw.tags),
    popularity: typeof pop === "number" ? pop : undefined,
    affinity: typeof query.affinity === "number" ? query.affinity : undefined,
    explain,
    tier: (props.mock_tier as 1 | 2 | 3) ?? liveTier,
    style: style.length ? style : undefined,
    site,
    instagram,
    founded,
  };
}

// Seed-level calls (search, tags, entity lookups, one-entity insights) are what different people share, so they go to
// memory plus Upstash. Combination and ablation calls are unique to one reading: memory only, which keeps Upstash
// commands per reading low. TTL is capped at 6h either way; nothing is ever written to disk.
const shared = kvCache<Record<string, unknown>>("qloo", 2000);
const local = sharedCache<Record<string, unknown>>("qloo-local", 2000);
const isShared = (path: string, params: Record<string, string>) =>
  path !== "/v2/insights" || (!params["signal.interests.entities"]?.includes(",") && !params["filter.exclude.entities"]);

/** Identical requests already on the wire share one fetch. */
const inflight = new Map<string, Promise<Record<string, unknown>>>();

/** At most QLOO_CONCURRENCY live requests per instance; the rest wait in line (bursts are what trip Qloo 429s). */
const QLOO_CONCURRENCY = Number(process.env.QLOO_CONCURRENCY) || 4;
/** Longest a request waits in line for a free slot before giving up. */
const GATE_WAIT_MS = 30_000;
let active = 0;
const waiting: (() => void)[] = [];

const abortError = (signal?: AbortSignal) => (signal?.reason instanceof Error ? signal.reason : Object.assign(new Error("Qloo request aborted"), { name: "AbortError" }));

/** Runs `fn` once a slot is free. A queued waiter leaves the line when `signal` aborts or after GATE_WAIT_MS. */
export async function gate<T>(fn: () => Promise<T>, signal?: AbortSignal, waitMs = GATE_WAIT_MS): Promise<T> {
  signal?.throwIfAborted();
  if (active >= QLOO_CONCURRENCY) {
    await new Promise<void>((resolve, reject) => {
      const go = () => {
        cleanup();
        resolve();
      };
      const leave = (err: Error) => {
        cleanup();
        const i = waiting.indexOf(go);
        if (i >= 0) waiting.splice(i, 1);
        reject(err);
      };
      const onAbort = () => leave(abortError(signal));
      const t = setTimeout(() => leave(Object.assign(new Error("Qloo queue timed out"), { name: "TimeoutError" })), waitMs);
      const cleanup = () => {
        clearTimeout(t);
        signal?.removeEventListener("abort", onAbort);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      waiting.push(go);
    });
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** Tests only: how many requests hold or wait for a slot. */
export const gateLoad = () => ({ active, waiting: waiting.length });

/**
 * The abort signal for every Qloo call made inside `fn` (an agent run), without threading it through each tool.
 * qget() also takes an explicit signal, which wins.
 */
const signalCtx = new AsyncLocalStorage<AbortSignal>();
export function withQlooSignal<T>(signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
  return signal ? signalCtx.run(signal, fn) : fn();
}

const QLOO_TIMEOUT_MS = 8000;
const QLOO_ATTEMPTS = 4;

/** Resolves with `p`, or rejects as soon as `signal` aborts (the shared work itself carries on for other callers). */
function raceAbort<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** Every Qloo request goes through here: cache (shared or local), in-flight dedupe, timing. */
export async function qget(path: string, params: Record<string, string>, log?: QlooCallLog[], signal?: AbortSignal): Promise<Record<string, unknown>> {
  const sig = signal ?? signalCtx.getStore();
  sig?.throwIfAborted();
  const qs = new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
  const mode = qlooMode();
  const key = `${mode}:${path}?${qs}`;
  const t0 = Date.now();
  const share = isShared(path, params);
  const hit = share ? await shared.get(key) : local.get(key);
  if (hit) {
    log?.push({ endpoint: path, params, ms: Date.now() - t0, cached: true, count: countOf(hit) });
    return hit;
  }
  const start = () => {
    const p = fetchQloo(path, qs, mode, sig).finally(() => inflight.get(key) === p && inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
  let p = inflight.get(key) ?? start();
  let json: Record<string, unknown>;
  try {
    json = await raceAbort(p, sig);
  } catch (err) {
    // We joined someone else's request and *their* run was aborted while it waited in line: ours is still wanted.
    if ((err as Error)?.name !== "AbortError" || sig?.aborted) throw err;
    p = inflight.get(key) ?? start();
    json = await raceAbort(p, sig);
  }
  if (share) await shared.set(key, json);
  else local.set(key, json, MAX_TTL_MS);
  log?.push({ endpoint: path, params, ms: Date.now() - t0, cached: false, count: countOf(json) });
  return json;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError(signal));
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** One Qloo request: mock switch, or a gated live fetch with up to 3 backed-off retries on 429/5xx/network. */
async function fetchQloo(path: string, qs: URLSearchParams, mode: "live" | "mock", signal?: AbortSignal): Promise<Record<string, unknown>> {
  if (mode === "mock") {
    // Simulated network latency so the mock trace streams like a live run.
    await sleep(140 + Math.random() * 260, signal);
    return mockQloo(path, qs) as Record<string, unknown>;
  }
  return gate(async () => {
    let res: Response | undefined;
    let netErr: unknown;
    for (let attempt = 0; attempt < QLOO_ATTEMPTS; attempt++) {
      if (attempt) {
        // Bursts (5 seed searches at once) trip Qloo's 429; jittered backoff spreads the retries apart.
        const after = Number(res?.headers.get("retry-after"));
        const wait = after > 0 ? Math.min(after * 1000, 3000) : 500 * 2 ** (attempt - 1) + Math.random() * 400;
        await sleep(wait, signal);
      }
      try {
        res = await fetch(`${BASE()}${path}?${qs}`, {
          headers: { "X-Api-Key": process.env.QLOO_API_KEY!, accept: "application/json" },
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(QLOO_TIMEOUT_MS)]) : AbortSignal.timeout(QLOO_TIMEOUT_MS),
        });
        netErr = undefined;
      } catch (err) {
        if (signal?.aborted) throw abortError(signal);
        res = undefined;
        netErr = err; // timeout or network error: retry once (4 × 8s timeouts would eat the route's budget)
        if (attempt >= 1) break;
        continue;
      }
      if (res.status === 429) void bumpDaily("qloo_429");
      if (res.status !== 429 && res.status < 500) break;
    }
    if (!res) throw Object.assign(new Error(`Qloo ${path}: ${(netErr as Error)?.name === "TimeoutError" ? "timed out" : "network error"}`), { upstream: true });
    if (!res.ok) throw Object.assign(new Error(`Qloo ${path} → HTTP ${res.status}`), { upstream: res.status === 429 || res.status >= 500 });
    const json = (await res.json()) as Record<string, unknown>;
    if (json.success === false) throw new Error(`Qloo ${path}: ${String(json.error ?? "request failed")}`);
    return json;
  }, signal);
}

/** True for errors that mean Qloo itself is down or overloaded (network, timeout, 429, 5xx), not a bad query. */
export const isUpstreamError = (err: unknown) => Boolean((err as { upstream?: boolean })?.upstream) || (err as Error)?.name === "TimeoutError";

function countOf(json: Record<string, unknown>): number {
  const r = json.results as unknown;
  if (Array.isArray(r)) return r.length;
  const o = (r ?? {}) as Record<string, unknown[]>;
  return (o.entities ?? o.tags ?? []).length;
}

/** Batch entity lookup: the full profile Qloo keeps per entity (official site, social handles, founding year). */
export async function lookupEntities(ids: string[], log?: QlooCallLog[]): Promise<QEntity[]> {
  if (!ids.length) return [];
  const json = await qget("/entities", { entity_ids: ids.slice(0, 25).join(",") }, log);
  const r = json.results as unknown;
  const list = (Array.isArray(r) ? r : ((r as Record<string, unknown> | undefined)?.entities ?? json.entities ?? [])) as Record<string, unknown>[];
  return list.map(normEntity);
}

export async function searchEntities(query: string, kinds: EntityKind[], take = 8, log?: QlooCallLog[]): Promise<QEntity[]> {
  const json = await qget("/search", { query, types: kinds.map(searchUrn).join(","), take: String(take) }, log);
  const results = (Array.isArray(json.results) ? json.results : []) as Record<string, unknown>[];
  return results.map(normEntity);
}

export async function insights(p: InsightsParams, log?: QlooCallLog[]): Promise<QEntity[]> {
  const params: Record<string, string> = {
    "filter.type": p.type === "tag" ? "urn:tag" : insightsUrn(p.type),
    take: String(Math.min(p.take ?? 20, 50)),
  };
  if (p.entityIds.length) params["signal.interests.entities"] = p.entityIds.join(",");
  if (p.tagIds?.length) params["signal.interests.tags"] = p.tagIds.join(",");
  if (p.filterTags?.length) params["filter.tags"] = p.filterTags.join(",");
  if (p.excludeIds?.length) params["filter.exclude.entities"] = p.excludeIds.join(",");
  if (p.tagTypes?.length) params["filter.tag.types"] = p.tagTypes.join(",");
  if (p.popularity?.min !== undefined) params["filter.popularity.min"] = String(p.popularity.min);
  if (p.popularity?.max !== undefined) params["filter.popularity.max"] = String(p.popularity.max);
  if (p.explain) params["feature.explainability"] = "true";

  const json = await qget("/v2/insights", params, log);
  const r = (json.results ?? {}) as Record<string, unknown[]>;
  const list = (r.entities ?? r.tags ?? []) as Record<string, unknown>[];
  if (p.type === "tag") {
    return list.map((t) => ({
      id: String(t.id ?? t.tag_id ?? t.entity_id),
      name: String(t.name),
      kind: "brand" as EntityKind,
      tags: [],
      affinity: Number(((t.query ?? {}) as Record<string, unknown>).affinity ?? 0) || undefined,
    }));
  }
  return list.map(normEntity);
}

export async function findTags(query: string, take = 10, log?: QlooCallLog[], parentType?: EntityKind): Promise<QTag[]> {
  const params: Record<string, string> = { "filter.query": query, take: String(take) };
  if (parentType) params["filter.parents.types"] = `urn:entity:${parentType}`;
  const json = await qget("/v2/tags", params, log);
  const r = (json.results ?? {}) as Record<string, unknown>;
  return normTags(r.tags);
}
