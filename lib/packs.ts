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
export const PACK_SIZE = 1;
type Odds = { tier: Rarity; p: number }[];

/**
 * Three packs, all one card, all Stardust only, and one pack a day across all three (scarcity is the point).
 * Star: the same odds as minting your own card. Flare: a little brighter. Supernova: holo three times as likely,
 * secret still hard (+3 points). Every table is published on the shop page.
 */
export const PACKS = {
  star: { name: "Star Pack", dust: 25, blurb: "Same odds as your own first pull.", odds: [
    { tier: "common", p: 0.7 },
    { tier: "rare", p: 0.22 },
    { tier: "holo", p: 0.06 },
    { tier: "secret", p: 0.02 },
  ] as Odds },
  flare: { name: "Flare Pack", dust: 60, blurb: "Brighter odds across the board.", odds: [
    { tier: "common", p: 0.58 },
    { tier: "rare", p: 0.29 },
    { tier: "holo", p: 0.1 },
    { tier: "secret", p: 0.03 },
  ] as Odds },
  supernova: { name: "Supernova Pack", dust: 120, blurb: "Holo three times as likely. Secret still rare.", odds: [
    { tier: "common", p: 0.43 },
    { tier: "rare", p: 0.34 },
    { tier: "holo", p: 0.18 },
    { tier: "secret", p: 0.05 },
  ] as Odds },
} as const;
export type PackKind = keyof typeof PACKS;
export const PACK_KINDS = Object.keys(PACKS) as PackKind[];
export const isPackKind = (k: unknown): k is PackKind => typeof k === "string" && k in PACKS;
/** The base pack, for places that show one price and one table. */
export const PACK_DUST = PACKS.star.dust;
export const PACK_ODDS: Odds = PACKS.star.odds;
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

export function tierFor(x: number, odds: Odds = PACK_ODDS): Rarity {
  let acc = 0;
  for (const o of odds) {
    acc += o.p;
    if (x < acc) return o.tier;
  }
  return "common";
}

/** Draws today's codes for an account: tier by the published odds, then a card from that tier (falling back to the nearest tier with cards). */
export async function drawPack(userId: string, day: string, kind: PackKind = "star"): Promise<string[] | null> {
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
    const want = tierFor(rand(), PACKS[kind].odds);
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

export type PackResult = { status: "opened" | "dup"; day: string; codes: string[]; kind: PackKind } | { status: "poor" | "empty" | "error" };

/** Opens today's pack. One a day of any kind; a second call the same day returns that pack and charges nothing. */
export async function openPack(userId: string, now = Date.now(), kind: PackKind = "star"): Promise<PackResult> {
  const day = utcDay(now);
  const cost = PACKS[kind].dust;
  const prior = await ddbGet(`USER#${userId}`, `PACK#${day}`);
  if (prior) return { status: "dup", day, codes: String(prior.codes).split(",").filter(Boolean), kind: isPackKind(prior.kind) ? prior.kind : "star" };
  const codes = await drawPack(userId, day, kind);
  if (!codes) return { status: "error" };
  if (!codes.length) return { status: "empty" };
  const r = await ddbTransact([
    { update: { PK: `USER#${userId}`, SK: "WALLET" }, set: "SET dust = dust - :cost, v = v + :one", condition: "dust >= :cost", values: { ":cost": cost, ":one": 1 } },
    { put: { PK: `USER#${userId}`, SK: `PACK#${day}`, codes: codes.join(","), kind, at: now }, condition: "attribute_not_exists(PK)" },
    { put: { PK: `USER#${userId}`, SK: `LEDGER#pack#${day}`, delta: -cost, unit: "dust", reason: `pack:${kind}`, ref: day, at: now }, condition: "attribute_not_exists(PK)" },
  ]);
  if (!r) return { status: "error" };
  if (r.ok) return { status: "opened", day, codes, kind };
  if (r.reasons[1] === CCF) return openPack(userId, now, kind);
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
