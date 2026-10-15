import "server-only";
import { sharedCache } from "./cache";
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
  };
}

const cache = sharedCache<unknown>("qloo", 2000);

/** Every Qloo request goes through here: cache, timing, retry on 429, mock switch. */
async function qget(path: string, params: Record<string, string>, log?: QlooCallLog[]): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
  const mode = qlooMode();
  const key = `${mode}:${path}?${qs}`;
  const t0 = Date.now();
  const hit = cache.get(key) as Record<string, unknown> | undefined;
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
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(`${BASE()}${path}?${qs}`, {
        headers: { "X-Api-Key": process.env.QLOO_API_KEY!, accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });
      if (res.status !== 429) break;
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
    if (!res!.ok) throw new Error(`Qloo ${path} → HTTP ${res!.status}`);
    json = (await res!.json()) as Record<string, unknown>;
  }
  if (json.success === false) throw new Error(`Qloo ${path}: ${String(json.error ?? "request failed")}`);
  cache.set(key, json);
  log?.push({ endpoint: path, params, ms: Date.now() - t0, cached: false, count: countOf(json) });
  return json;
}

function countOf(json: Record<string, unknown>): number {
  const r = json.results as unknown;
  if (Array.isArray(r)) return r.length;
  const o = (r ?? {}) as Record<string, unknown[]>;
  return (o.entities ?? o.tags ?? []).length;
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
