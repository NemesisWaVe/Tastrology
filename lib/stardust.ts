import type { Rarity } from "./card";
import { ddbGet, ddbTransact } from "./ddb";
import { creditsOn, RUN_ID_RE } from "./ledger";

/**
 * Stardust: the free, closed-loop reward for retiring a card (docs/design/burn.md, legal "Burn rewards").
 * Earned only, never sold, transferred or refunded, no cash value, never converted into credits. It buys Battle Packs,
 * Recasts and Living sigils (lib/economy.ts). Money never reaches it: a card bought with money earns no Stardust in any
 * way (retire, dividend, regret, brand-sheet bonus), so no rupee can reach a random pack or roll.
 * On only with credits (CREDITS_ON=1 and the table configured). With it off, burning is a pure ritual and earns nothing.
 *   USER#<id>  WALLET               + dust, dustAt
 *   USER#<id>  DUSTWEEK#<yyyy-Www>  earned, ttl                  weekly cap counter
 *   USER#<id>  LEDGER#burn#<code>   +dust for the first burn of a code (write-once)
 *   USER#<id>  LEDGER#dust#<runId>  -READING_DUST for one reading paid in dust (write-once per run id)
 *   USER#<id>  LEDGER#dustback#<runId>  the refund when that run failed
 */
export const dustOn = creditsOn;

/** Published rates. Rule 1 (legal): every burn returns less than a reading costs. */
export const DUST_RATES: Record<Rarity, number> = { common: 15, rare: 30, holo: 75, secret: 95 };
/** A card minted with a paid credit retires for nothing: money must never turn into Stardust (legal review 2026-10-18). */
export const PAID_FLAT_DUST = 0;
/** Funding that may earn Stardust: the free monthly card, a regret credit (itself from a free card), and older cards with none recorded. */
export const earnsDust = (funding: unknown) => funding === undefined || funding === null || funding === "" || funding === "free" || funding === "regret";
export const READING_DUST = 100;
export const WEEKLY_DUST_CAP = 150;

export type Funding = "free" | "paid" | "dust";

/** Dust a burn earns before the weekly cap. Only mints that spent a credit earn anything; dust-paid mints earn 0. */
export function dustFor(rarity: Rarity, funding: Funding | undefined): number {
  if (funding === "paid") return PAID_FLAT_DUST;
  if (funding === "free") return DUST_RATES[rarity] ?? 0;
  return 0;
}

/** ISO-8601 week, e.g. "2026-W42" (UTC). */
export function isoWeek(ms: number): string {
  const d = new Date(ms);
  const day = d.getUTCDay() || 7;
  const thu = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - day);
  const year = new Date(thu).getUTCFullYear();
  const week = Math.floor((thu - Date.UTC(year, 0, 1)) / 86_400_000 / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export const rates = () => ({ ...DUST_RATES, paidFlat: PAID_FLAT_DUST, reading: READING_DUST, weeklyCap: WEEKLY_DUST_CAP });

const pk = (userId: string) => `USER#${userId}`;
const key = (userId: string, SK: string) => ({ PK: pk(userId), SK });
const CCF = "ConditionalCheckFailed";

/** Dust earned so far this week (0 when the counter doesn't exist yet or can't be read; the transaction re-checks the cap). */
export async function earnedThisWeek(userId: string, now = Date.now()): Promise<number> {
  const w = await ddbGet(pk(userId), `DUSTWEEK#${isoWeek(now)}`);
  return Math.max(0, Number(w?.earned) || 0);
}

/** Balance plus what's left of this week's cap, for /api/me and the deck. */
export async function dustStatus(userId: string, now = Date.now()): Promise<{ dust: number; weekLeft: number }> {
  const [w, earned] = await Promise.all([ddbGet(pk(userId), "WALLET"), earnedThisWeek(userId, now)]);
  return { dust: Math.max(0, Number(w?.dust) || 0), weekLeft: Math.max(0, WEEKLY_DUST_CAP - earned) };
}

/** Pays for one reading with READING_DUST. Idempotent per run id, like spendCredit. */
export async function spendDust(userId: string, runId: string): Promise<"spent" | "dup" | "used" | "empty" | "error"> {
  if (!RUN_ID_RE.test(runId)) return "error";
  const r = await ddbTransact([
    { update: key(userId, "WALLET"), set: "SET dust = dust - :cost, v = v + :one", condition: "dust >= :cost", values: { ":cost": READING_DUST, ":one": 1 } },
    { put: { ...key(userId, `LEDGER#dust#${runId}`), delta: -READING_DUST, unit: "dust", reason: "reading", ref: runId, at: Date.now() }, condition: "attribute_not_exists(PK)" },
  ]);
  if (!r) return "error";
  if (r.ok) return "spent";
  if (r.reasons[1] === CCF) return (await ddbGet(pk(userId), `LEDGER#dustback#${runId}`)) ? "used" : "dup";
  return r.reasons[0] === CCF ? "empty" : "error";
}

/** Gives back the dust a failed run took. Write-once per run id, and only when that run was paid in dust. */
export async function refundDust(userId: string, runId: string): Promise<"refunded" | "dup" | "none" | "error"> {
  if (!RUN_ID_RE.test(runId)) return "error";
  const r = await ddbTransact([
    { update: key(userId, "WALLET"), set: "SET v = v + :one ADD dust :cost", condition: "attribute_exists(PK)", values: { ":one": 1, ":cost": READING_DUST } },
    { put: { ...key(userId, `LEDGER#dustback#${runId}`), delta: READING_DUST, unit: "dust", reason: "refund", ref: runId, at: Date.now() }, condition: "attribute_not_exists(PK)" },
    { check: key(userId, `LEDGER#dust#${runId}`), condition: "attribute_exists(PK)" },
  ]);
  if (!r) return "error";
  if (r.ok) return "refunded";
  if (r.reasons[1] === CCF) return "dup";
  if (r.reasons[2] === CCF) return "none";
  return "error";
}
