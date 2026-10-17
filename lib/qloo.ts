import "server-only";
import { kvCache } from "./cache";
import { mockQloo } from "./mock/server";
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

// In memory, plus Upstash when configured. TTL is capped at 6h; nothing is ever written to disk.
const cache = kvCache<Record<string, unknown>>("qloo", 2000);

const QLOO_TIMEOUT_MS = 8000;
const QLOO_ATTEMPTS = 4;

/** Every Qloo request goes through here: cache, timing, up to 3 backed-off retries on 429/5xx/network, mock switch. */
async function qget(path: string, params: Record<string, string>, log?: QlooCallLog[]): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
  const mode = qlooMode();
  const key = `${mode}:${path}?${qs}`;
  const t0 = Date.now();
  const hit = await cache.get(key);
  if (hit) {
    log?.push({ endpoint: path, params, ms: Date.now() - t0, cached: true, count: countOf(hit) });
    return hit;
  }

  let json: Record<string, unknown>;
  if (mode === "mock") {
    // Simulated network latency so the mock trace streams like a live run.
    await new Promise((r) => setTimeout(r, 140 + Math.random() * 260));
    json = mockQloo(path, qs) as Record<string, unknown>;
  } else {
    let res: Response | undefined;
    let netErr: unknown;
    for (let attempt = 0; attempt < QLOO_ATTEMPTS; attempt++) {
      if (attempt) {
        // Bursts (5 seed searches at once) trip Qloo's 429; jittered backoff spreads the retries apart.
        const after = Number(res?.headers.get("retry-after"));
        const wait = after > 0 ? Math.min(after * 1000, 3000) : 500 * 2 ** (attempt - 1) + Math.random() * 400;
        await new Promise((r) => setTimeout(r, wait));
      }
      try {
        res = await fetch(`${BASE()}${path}?${qs}`, {
          headers: { "X-Api-Key": process.env.QLOO_API_KEY!, accept: "application/json" },
          signal: AbortSignal.timeout(QLOO_TIMEOUT_MS),
        });
        netErr = undefined;
      } catch (err) {
        res = undefined;
        netErr = err; // timeout or network error: retry once (4 × 8s timeouts would eat the route's budget)
        if (attempt >= 1) break;
        continue;
      }
      if (res.status !== 429 && res.status < 500) break;
    }
    if (!res) throw new Error(`Qloo ${path}: ${(netErr as Error)?.name === "TimeoutError" ? "timed out" : "network error"}`);
    if (!res.ok) throw new Error(`Qloo ${path} → HTTP ${res.status}`);
    json = (await res.json()) as Record<string, unknown>;
  }
  if (json.success === false) throw new Error(`Qloo ${path}: ${String(json.error ?? "request failed")}`);
  await cache.set(key, json);
  log?.push({ endpoint: path, params, ms: Date.now() - t0, cached: false, count: countOf(json) });
  return json;
}

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
