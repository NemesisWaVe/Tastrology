import type { QEntity, StyleResult } from "./types";

/**
 * What a result looks like in localStorage: heavy per-entity fields the UI never renders are dropped (~200KB → a few KB).
 * `popularity` stays: rarity and the Edge stat are computed from it, and the card's verify code hashes rarity, so
 * dropping it made a reloaded card show a different tier and a code whose twin doesn't exist.
 */
export function slim(e: QEntity): QEntity {
  const { explain: _explain, ...rest } = e;
  return { ...rest, tags: (e.tags ?? []).slice(0, 4) };
}

export function trimResult(r: StyleResult): StyleResult {
  return {
    ...r,
    seeds: r.seeds.map(slim),
    brands: r.brands.map((b) => ({ ...b, entity: slim(b.entity) })),
    rejected: r.rejected.map((x) => ({ ...x, entity: slim(x.entity) })),
    bridges: r.bridges.map((b) => ({ ...b, entity: slim(b.entity) })),
  };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const entityOk = (e: unknown) => isObj(e) && typeof e.id === "string" && typeof e.name === "string";
const listOf = (x: unknown, ok: (v: unknown) => boolean) => Array.isArray(x) && x.every(ok);

/**
 * Shape check for a result read back from localStorage (old versions, hand edits, half-written saves).
 * Covers every field the result screen and buildCard() walk without a guard; anything else is optional.
 */
export function isSavedResult(r: unknown): r is StyleResult {
  if (!isObj(r) || !isObj(r.dna) || !isObj(r.stats)) return false;
  const d = r.dna;
  return (
    typeof d.name === "string" &&
    typeof d.tagline === "string" &&
    listOf(d.keywords, (k) => isObj(k) && typeof k.name === "string") &&
    listOf(d.lobes, (l) => isObj(l) && Array.isArray(l.seedIds) && Array.isArray(l.keywords)) &&
    listOf(r.seeds, entityOk) &&
    listOf(r.brands, (b) => isObj(b) && entityOk(b.entity) && typeof b.affinity === "number") &&
    listOf(r.rejected, (x) => isObj(x) && entityOk(x.entity)) &&
    listOf(r.bridges, (x) => isObj(x) && entityOk(x.entity)) &&
    Array.isArray(r.contradictions) &&
    Array.isArray(r.capsule) &&
    Array.isArray(r.critique)
  );
}
