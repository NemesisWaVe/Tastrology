import { sharedCache, upstash, upstashConfigured, upstashGetStatus } from "./cache";
import type { Lookup } from "./lookup";
import { s3GetStatus, s3PutIfAbsent } from "./s3";
import { TWIN_CODE } from "./twins";
import type { BrandMatch, EntityKind, QEntity, StyleResult } from "./types";

/**
 * A fighter sheet is the minimum slice of a reading that battle() and buildCard() need.
 * No images, explainability dumps or raw Qloo responses. Affinity and popularity are on a 0-100 scale.
 */
export interface FighterSheet {
  v: 1;
  seeds: { id: string; name: string; kind: EntityKind; popularity?: number }[];
  dna: { name: string; tagline: string; keywords: string[]; lobes: { seedIds: string[]; keywords: string[] }[] };
  brands: { id: string; name: string; affinity: number; popularity?: number; style?: string[]; tags: string[]; side?: 1; explain: Record<string, number>; because: string[] }[];
  rejected: { name: string; reason: string }[];
  contradictions: { a: string; b: string; overlap: number }[];
  /** The critique line naming a seed that barely moves any pick. */
  inert?: string;
  overlap?: number;
}

/** 0-100 scale, one decimal: whole integers flipped a knife-edge Signal tie in testing. */
const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n * 1000) / 10));
const pctOpt = (n?: number) => (typeof n === "number" ? pct(n) : undefined);
const unpct = (n?: number) => (typeof n === "number" ? n / 100 : undefined);
const r2 = (n: number) => Math.round(n * 100) / 100;
const tag = (name: string, i: number) => ({ id: `k${i}`, name });

export function toSheet(r: StyleResult): FighterSheet {
  return {
    v: 1,
    seeds: r.seeds.map((s) => ({ id: s.id, name: s.name, kind: s.kind, popularity: pctOpt(s.popularity) })),
    dna: {
      name: r.dna.name,
      tagline: r.dna.tagline,
      keywords: r.dna.keywords.map((k) => k.name),
      lobes: r.dna.lobes.map((l) => ({ seedIds: l.seedIds, keywords: l.keywords.map((k) => k.name) })),
    },
    brands: r.brands.map((b) => ({
      id: b.entity.id,
      name: b.entity.name,
      affinity: pct(b.affinity),
      popularity: pctOpt(b.entity.popularity),
      style: b.entity.style?.slice(0, 8),
      tags: b.entity.tags.slice(0, 8).map((t) => t.name),
      side: b.side,
      explain: Object.fromEntries(Object.entries(b.explain).map(([k, v]) => [k, r2(v)])),
      because: b.because,
    })),
    rejected: r.rejected.map((x) => ({ name: x.entity.name, reason: x.reason })),
    contradictions: r.contradictions.map((c) => ({ a: c.a, b: c.b, overlap: r2(c.overlap) })),
    inert: r.critique.find((c) => c.includes("barely moves")),
    overlap: r.overlap === undefined ? undefined : r2(r.overlap),
  };
}

export function fromSheet(s: FighterSheet): StyleResult {
  const ent = (id: string, name: string, kind: EntityKind, extra: Partial<QEntity> = {}): QEntity => ({ id, name, kind, tags: [], ...extra });
  const brands: BrandMatch[] = s.brands.map((b) => ({
    entity: ent(b.id, b.name, "brand", { popularity: unpct(b.popularity), style: b.style, tags: b.tags.map((n, i) => tag(n, i)) }),
    affinity: b.affinity / 100,
    category: "",
    explain: b.explain,
    ablation: {},
    because: b.because,
    side: b.side,
  }));
  return {
    runId: "fighter",
    mode: "live",
    planner: "autopilot",
    createdAt: 0,
    seeds: s.seeds.map((x) => ent(x.id, x.name, x.kind, { popularity: unpct(x.popularity) })),
    dna: {
      name: s.dna.name,
      tagline: s.dna.tagline,
      keywords: s.dna.keywords.map((n, i) => tag(n, i)),
      lobes: s.dna.lobes.map((l) => ({ seedIds: l.seedIds, keywords: l.keywords.map((n, i) => tag(n, i)) })),
    },
    brands,
    rejected: s.rejected.map((x, i) => ({ entity: ent(`rej${i}`, x.name, "brand"), affinity: 0, reason: x.reason })),
    contradictions: s.contradictions,
    bridges: [],
    capsule: [],
    critique: s.inert ? [s.inert] : [],
    stats: { qlooCalls: 0, ms: 0, llmSteps: 0 },
    overlap: s.overlap,
  };
}

const TTL_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 40_000;
const WAIT_MS = 3000;
const mem = sharedCache<string>("fighters", 2000);
const rkey = (code: string) => `tm:fighter:${code}`;

/** Stores the sheet under the card's code: memory, S3 write-once, Upstash NX. Never throws; waits up to ~3s. */
export async function registerFighter(code: string, sheet: FighterSheet): Promise<void> {
  try {
    if (!TWIN_CODE.test(code)) return;
    const json = JSON.stringify(sheet);
    if (json.length > MAX_BYTES) return;
    mem.set(code, json, TTL_MS);
    const writes = Promise.allSettled([
      s3PutIfAbsent(`fighters/v1/${code}.json`, json),
      upstashConfigured() ? upstash([["SET", rkey(code), json, "PX", TTL_MS, "NX"]]) : null,
    ]);
    await Promise.race([writes, new Promise((r) => setTimeout(r, WAIT_MS))]);
  } catch {}
}

export type FighterLookup = { status: "found"; sheet: FighterSheet } | { status: "missing" | "error"; sheet: null };

/** Memory, then S3, then Upstash. "error": nothing found and a backend couldn't answer (see getTwinStatus). */
export async function getFighterStatus(code: string): Promise<FighterLookup> {
  if (!TWIN_CODE.test(code)) return { status: "missing", sheet: null };
  const parse = (raw: string | null | undefined): FighterSheet | null => {
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as FighterSheet;
      return s?.v === 1 && Array.isArray(s.brands) ? s : null;
    } catch {
      return null;
    }
  };
  const hit = parse(mem.get(code));
  if (hit) return { status: "found", sheet: hit };
  const seen: Lookup<unknown>["status"][] = [];
  for (const read of [() => s3GetStatus(`fighters/v1/${code}.json`), () => upstashGetStatus(rkey(code))]) {
    const r = await read();
    seen.push(r.status);
    const found = parse(r.status === "found" ? r.value : null);
    if (found) {
      mem.set(code, JSON.stringify(found), TTL_MS);
      return { status: "found", sheet: found };
    }
  }
  return { status: seen.includes("error") ? "error" : "missing", sheet: null };
}

export async function getFighter(code: string): Promise<FighterSheet | null> {
  return (await getFighterStatus(code)).sheet;
}

/** Dev only (QLOO_MODE=mock): seed memory directly so /api/battle can be exercised without a live run. */
export function putFighterMemory(code: string, sheet: FighterSheet) {
  mem.set(code, JSON.stringify(sheet), TTL_MS);
}
