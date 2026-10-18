import { tierOf } from "./burn";
import { upstash } from "./cache";
import { ddbGet, ddbQuery, ddbTransact } from "./ddb";
import { dustOn } from "./stardust";

/**
 * Holding pays: once a calendar month (UTC), every Holo you minted and still hold pays HOLO_DIVIDEND Stardust and
 * every Secret SECRET_DIVIDEND. Lazy, paid on your first visit of the month (no cron). Burning pays once; keeping
 * pays every month, so a lucky pull is worth more kept than burned.
 *   USER#<id>  LEDGER#div#<yyyy-mm>   +dust, holo, secret   write-once per month
 */
export const HOLO_DIVIDEND = 10;
export const SECRET_DIVIDEND = 25;
/** A ceiling, so a full deck of rares can't print Stardust. */
export const DIVIDEND_MAX = 75;

export const month = (ms: number) => new Date(ms).toISOString().slice(0, 7);

export function dividendFor(tiers: string[]): number {
  const n = tiers.reduce((a, t) => a + (t === "secret" ? SECRET_DIVIDEND : t === "holo" ? HOLO_DIVIDEND : 0), 0);
  return Math.min(DIVIDEND_MAX, n);
}

export async function payDividend(userId: string, now = Date.now()): Promise<{ paid: number; month: string } | null> {
  if (!dustOn()) return null;
  const m = month(now);
  const U = `USER#${userId}`;
  // Cheap gates first: /api/me runs on every page. Paid already, or checked this month with nothing to pay.
  const paidAlready = await ddbGet(U, `LEDGER#div#${m}`).catch(() => null);
  if (paidAlready) return { paid: Number(paidAlready.delta) || 0, month: m };
  const chk = `tm:divchk:${userId}:${m}`;
  const seen = await upstash([["GET", chk]]);
  if (seen?.[0]) return null;
  const page = await ddbQuery(`OWNER#${userId}`, "CARD#", 50, undefined, ["card", "minted", "rarityScore"]);
  if (!page) return null;
  const tiers = page.items.filter((x) => Number(x.minted) === 1).map(tierOf);
  const paid = dividendFor(tiers);
  if (paid <= 0) {
    await upstash([["SET", chk, "1", "EX", 86_400]]);
    return null;
  }
  const r = await ddbTransact([
    {
      put: { PK: U, SK: `LEDGER#div#${m}`, delta: paid, unit: "dust", reason: "dividend", ref: m, holo: tiers.filter((t) => t === "holo").length, secret: tiers.filter((t) => t === "secret").length, at: now },
      condition: "attribute_not_exists(PK)",
    },
    { update: { PK: U, SK: "WALLET" }, set: "SET dustAt = :now ADD dust :d", condition: "attribute_exists(PK)", values: { ":now": now, ":d": paid } },
  ]);
  return r?.ok ? { paid, month: m } : null;
}
