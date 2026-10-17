import { upstash, upstashConfigured } from "./cache";

/**
 * Mint histogram for the "rarer than N%" percentile: one counter per rarity point (0–100) per season, counted once per
 * card code. Upstash only (a memory count per instance would lie). Starts collecting now; shown once there are enough mints.
 */
const histKey = (season: string) => `tm:mints:${season}`;
const seenKey = (code: string) => `tm:minted:${code}`;
const SEEN_TTL_S = 400 * 24 * 3600;

export async function recordMint(code: string, season: string, rarityScore: number): Promise<void> {
  if (!upstashConfigured()) return;
  const bucket = String(Math.max(0, Math.min(100, Math.round(rarityScore))));
  const [first] = (await upstash([["SET", seenKey(code), "1", "EX", SEEN_TTL_S, "NX"]])) ?? [];
  if (first !== "OK") return; // already counted (or Redis unreachable)
  await upstash([["HINCRBY", histKey(season), bucket, 1]]);
}

/** Counts per rarity point, index 0–100. Null when there is no shared store. */
export async function mintHistogram(season: string): Promise<number[] | null> {
  if (!upstashConfigured()) return null;
  const [raw] = (await upstash([["HGETALL", histKey(season)]])) ?? [];
  if (!Array.isArray(raw)) return null;
  const out = Array<number>(101).fill(0);
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const b = Number(raw[i]);
    if (b >= 0 && b <= 100) out[b] = Number(raw[i + 1]) || 0;
  }
  return out;
}

/** Share of minted cards strictly below `score`, or null below `minMints` total (too few to say anything honest). */
export function percentileBelow(hist: number[], score: number, minMints = 200): number | null {
  const total = hist.reduce((a, b) => a + b, 0);
  if (total < minMints) return null;
  const below = hist.slice(0, Math.max(0, Math.min(101, Math.round(score)))).reduce((a, b) => a + b, 0);
  return below / total;
}
