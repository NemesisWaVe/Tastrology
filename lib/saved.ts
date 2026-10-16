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
