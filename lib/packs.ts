import { createHash } from "node:crypto";
import type { CardData, Rarity } from "./card";
import { ddbGet, ddbPutIfAbsent, ddbQuery, ddbTransact } from "./ddb";
import { dustOn } from "./stardust";
import { burnedAt, getTwin } from "./twins";

/**
 * Battle Packs (docs/design/regret-burn.md §3): one card from someone else's sky, bought with earned Stardust only.
 * One card, not a bundle: every card stays a person, and a collection grows slowly enough that each one matters.
 * They go to a collection to fight, never into your deck: they aren't you, carry no dust and can't be burned.
 *   POOL#<tier>      CARD#<code>     every fresh mint, by tier (the pool packs draw from)
 *   USER#<id>        PACK#<day>      codes (comma-joined), at        one pack a day, write-once
 *   USER#<id>        LEDGER#pack#<day>   -PACK_DUST
 * Contents are fixed per account per UTC day, so there is nothing to re-roll. Stardust is never sold (legal review).
 */
export const PACK_DUST = 25;
export const PACK_SIZE = 1;
/** Published odds per slot. Shown on the shop page. */
export const PACK_ODDS: { tier: Rarity; p: number }[] = [
  { tier: "common", p: 0.7 },
  { tier: "rare", p: 0.22 },
  { tier: "holo", p: 0.06 },
  { tier: "secret", p: 0.02 },
];
const TIERS: Rarity[] = ["common", "rare", "holo", "secret"];
const CCF = "ConditionalCheckFailed";

export const packsOn = () => dustOn() && process.env.PACKS !== "0";
export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Adds a fresh mint to the pool packs draw from. Fire-and-forget. */
export async function addToPool(code: string, tier: Rarity): Promise<void> {
  await ddbPutIfAbsent({ PK: `POOL#${tier}`, SK: `CARD#${code}`, code, at: Date.now() });
}

/** A seeded stream of [0,1) numbers: the same account and day always draw the same pack. */
function stream(seed: string) {
  let n = 0;
  return () => {
    const h = createHash("sha256").update(`${seed}|${n++}`).digest();
    return h.readUInt32BE(0) / 2 ** 32;
  };
}

export function tierFor(x: number): Rarity {
  let acc = 0;
  for (const o of PACK_ODDS) {
    acc += o.p;
    if (x < acc) return o.tier;
  }
  return "common";
}

/** Draws today's codes for an account: tier by the published odds, then a card from that tier (falling back to the nearest tier with cards). */
export async function drawPack(userId: string, day: string): Promise<string[] | null> {
  const rand = stream(`${userId}|${day}`);
  const mine = await ddbQuery(`OWNER#${userId}`, "CARD#", 50, undefined, ["code"]);
  if (!mine) return null;
  const skip = new Set(mine.items.map((i) => String(i.code)));
  const pools = new Map<Rarity, string[]>();
  const pool = async (t: Rarity) => {
    if (!pools.has(t)) {
      const q = await ddbQuery(`POOL#${t}`, "CARD#", 200, undefined, ["code"]);
      pools.set(t, (q?.items ?? []).map((i) => String(i.code)).sort());
    }
    return pools.get(t)!;
  };
  const out: string[] = [];
  for (let slot = 0; slot < PACK_SIZE; slot++) {
    const want = tierFor(rand());
    const order = [want, ...TIERS.filter((t) => t !== want).sort((a, b) => Math.abs(TIERS.indexOf(a) - TIERS.indexOf(want)) - Math.abs(TIERS.indexOf(b) - TIERS.indexOf(want)))];
    for (const t of order) {
      const free = (await pool(t)).filter((c) => !skip.has(c) && !out.includes(c));
      if (!free.length) continue;
      const pick = free[Math.floor(rand() * free.length)];
      if (await burnedAt(pick).catch(() => null)) {
        skip.add(pick);
        slot--;
        break;
      }
      out.push(pick);
      break;
    }
  }
  return out;
}

export type PackResult = { status: "opened" | "dup"; day: string; codes: string[] } | { status: "poor" | "empty" | "error" };

/** Opens today's pack for PACK_DUST. One a day; a second call the same day returns the same pack and charges nothing. */
export async function openPack(userId: string, now = Date.now()): Promise<PackResult> {
  const day = utcDay(now);
  const prior = await ddbGet(`USER#${userId}`, `PACK#${day}`);
  if (prior) return { status: "dup", day, codes: String(prior.codes).split(",").filter(Boolean) };
  const codes = await drawPack(userId, day);
  if (!codes) return { status: "error" };
  if (!codes.length) return { status: "empty" };
  const r = await ddbTransact([
    { update: { PK: `USER#${userId}`, SK: "WALLET" }, set: "SET dust = dust - :cost, v = v + :one", condition: "dust >= :cost", values: { ":cost": PACK_DUST, ":one": 1 } },
    { put: { PK: `USER#${userId}`, SK: `PACK#${day}`, codes: codes.join(","), at: now }, condition: "attribute_not_exists(PK)" },
    { put: { PK: `USER#${userId}`, SK: `LEDGER#pack#${day}`, delta: -PACK_DUST, unit: "dust", reason: "pack", ref: day, at: now }, condition: "attribute_not_exists(PK)" },
  ]);
  if (!r) return { status: "error" };
  if (r.ok) return { status: "opened", day, codes };
  if (r.reasons[1] === CCF) return openPack(userId, now);
  return r.reasons[0] === CCF ? { status: "poor" } : { status: "error" };
}

/** The account's collection, newest pack first, with each card (burned or missing cards drop out). */
export async function collection(userId: string, max = 5): Promise<{ day: string; cards: { code: string; card: CardData }[] }[]> {
  const q = await ddbQuery(`USER#${userId}`, "PACK#", 60);
  const packs = (q?.items ?? []).map((i) => ({ day: String(i.SK).slice(5), codes: String(i.codes).split(",").filter(Boolean) })).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, max);
  return Promise.all(
    packs.map(async (p) => ({
      day: p.day,
      cards: (await Promise.all(p.codes.map(async (code) => ({ code, card: await getTwin(code).catch(() => null) })))).filter((x): x is { code: string; card: CardData } => Boolean(x.card)),
    })),
  );
}
