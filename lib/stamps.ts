import type { BattleResult } from "./battle";
import { ddbConfigured, ddbGet, ddbPutIfAbsent, ddbQuery, ddbUpdate } from "./ddb";

/**
 * Battle stamps on a card's passport (/c/<code>): a running win/loss tally and the last few opponents.
 *   STAMPS#<code>  TALLY            won, lost, tied
 *   STAMPS#<code>  VS#<other>       one stamp per opponent (write-once: refighting the same card doesn't farm stamps)
 * Battles are deterministic, so a pair always ends the same way; one stamp per pair is the honest count.
 */
export interface Stamp {
  code: string;
  name: string;
  outcome: "won" | "lost" | "tied";
  at: number;
}
export interface Stamps {
  won: number;
  lost: number;
  tied: number;
  recent: Stamp[];
}

const outcomeFor = (side: "a" | "b", w: BattleResult["winner"]): Stamp["outcome"] => (w === "tie" ? "tied" : w === side ? "won" : "lost");

async function stampOne(code: string, other: string, name: string, outcome: Stamp["outcome"], at: number) {
  const out = await ddbPutIfAbsent({ PK: `STAMPS#${code}`, SK: `VS#${other}`, code: other, name: name.slice(0, 80), outcome, at });
  if (out !== "created") return;
  await ddbUpdate(`STAMPS#${code}`, "TALLY", `ADD ${outcome} :one`, { values: { ":one": 1 } });
}

/** Stamps both cards after a fight. Safe to call on every view: only the first fight of a pair counts. */
export async function recordBattle(a: string, b: string, r: BattleResult, at = Date.now()): Promise<void> {
  if (!ddbConfigured() || a === b) return;
  await Promise.all([stampOne(a, b, r.names.b, outcomeFor("a", r.winner), at), stampOne(b, a, r.names.a, outcomeFor("b", r.winner), at)]);
}

export async function getStamps(code: string): Promise<Stamps | null> {
  if (!ddbConfigured()) return null;
  const [t, q] = await Promise.all([ddbGet(`STAMPS#${code}`, "TALLY"), ddbQuery(`STAMPS#${code}`, "VS#", 50)]);
  if (!t && !q) return null;
  const recent = (q?.items ?? [])
    .map((i) => ({ code: String(i.code), name: String(i.name), outcome: String(i.outcome) as Stamp["outcome"], at: Number(i.at) || 0 }))
    .sort((x, y) => y.at - x.at)
    .slice(0, 6);
  return { won: Number(t?.won) || 0, lost: Number(t?.lost) || 0, tied: Number(t?.tied) || 0, recent };
}
