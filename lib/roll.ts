import { createHash, createHmac } from "node:crypto";
import type { Rarity } from "./card";
import { ODDS_V, tierAt } from "./odds";

/**
 * Rarity is a roll, not a verdict on taste (docs/design/rarity-roll.md). Taste stays deterministic from the picks;
 * the tier comes from a keyed hash of the minting account and the paid run, so:
 *   - a reload, a replay of the same picks (served from cache, same card) or a refresh can't re-roll it;
 *   - nobody can predict it before minting (ROLL_SECRET is server-only);
 *   - it can be checked after the season: the season key is committed on /odds now (its sha256) and revealed later.
 * Without ROLL_SECRET the roll is off and rarity falls back to the old taste score.
 */
export const rollOn = () => Boolean(process.env.ROLL_SECRET);

const seasonKey = (season: string) => createHmac("sha256", process.env.ROLL_SECRET ?? "").update(`season|${season}`).digest();

/** Published before the season: sha256 of the season key. */
export const commitment = (season: string) => createHash("sha256").update(seasonKey(season)).digest("hex");

export interface Roll {
  tier: Rarity;
  /** The roll in [0, 1), 6 decimals: lower is luckier. */
  u: number;
  season: string;
  /** The odds table it was drawn under (ODDS_V). Absent on rolls from before it was recorded (all version 1). */
  odds?: string;
}

export function rollFor(ownerId: string, runId: string, season: string): Roll {
  const h = createHmac("sha256", seasonKey(season)).update(`${ownerId}|${runId}`).digest();
  const u = Math.floor((h.readUInt32BE(0) / 2 ** 32) * 1e6) / 1e6;
  return { tier: tierAt(u), u, season, odds: ODDS_V };
}
