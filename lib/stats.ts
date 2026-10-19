import { upstash, upstashConfigured } from "./cache";

/**
 * Mint histogram for the "rarer than N%" percentile: one counter per rarity point (0–100) per season, counted once per
 * card code. Upstash only (a memory count per instance would lie). Starts collecting now; shown once there are enough mints.
 */
const histKey = (season: string) => `tm:mints:v2:${season}`;
const seenKey = (code: string) => `tm:minted:v2:${code}`;
const SEEN_TTL_S = 400 * 24 * 3600;

export function weekKey(now = new Date()) {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return `tm:signs:${monday.toISOString().slice(0, 10)}`;
}

export async function recordMint(code: string, season: string, rarityScore: number, sun = "Unwritten"): Promise<void> {
  if (!upstashConfigured()) return;
  const bucket = String(Math.max(0, Math.min(100, Math.round(rarityScore))));
  await upstash([["EVAL", "if redis.call('SET',KEYS[1],'1','EX',ARGV[1],'NX') then redis.call('HINCRBY',KEYS[2],ARGV[2],1); redis.call('HINCRBY',KEYS[3],ARGV[3],1); redis.call('EXPIRE',KEYS[3],1209600); return 1 end return 0", 3, seenKey(code), histKey(season), weekKey(), SEEN_TTL_S, bucket, sun.slice(0, 80)]]);
}

export async function weeklySigns(): Promise<{ name: string; count: number }[]> {
  const [raw] = await upstash([["HGETALL", weekKey()]]) ?? [];
  if (!Array.isArray(raw)) return [];
  const signs: { name: string; count: number }[] = [];
  for (let index = 0; index + 1 < raw.length; index += 2) signs.push({ name: String(raw[index]), count: Number(raw[index + 1]) || 0 });
  return signs.filter((sign) => sign.count >= 5).sort((left, right) => right.count - left.count).slice(0, 3);
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
