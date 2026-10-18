import { driftFor } from "./drift";
import { ddbGetStatus, ddbQuery, ddbTransact, ddbPutIfAbsent } from "./ddb";
import { getReceipt, snapOf, type SnapBrand } from "./receipt";
import { dustOn, earnsDust, isoWeek } from "./stardust";

/**
 * Brands as the reason to come back (docs/design/brand-return-ui.md):
 *   - the deck tab stays "sealed" until a card's brand sheet is opened that week;
 *   - opening it pays OPEN_DUST Stardust, for up to OPEN_CARDS cards a week. Opening pays, clicking out never does.
 *   USER#<id>  OPEN#<yyyy-Www>#<code>   at                 one per card per week (the seal)
 *   USER#<id>  OPENS#<yyyy-Www>        n, ttl             how many paid this week
 *   USER#<id>  LEDGER#open#<week>#<code>  +OPEN_DUST
 */
export const OPEN_DUST = 3;
export const OPEN_CARDS = 3;
const CCF = "ConditionalCheckFailed";
/** Only the first few cards get a live drift count on the deck; the rest show the seal without a number. */
const DRIFT_CARDS = 6;

export interface Teaser {
  /** The strongest brand on the receipt, to peek out from behind the card. */
  top: { name: string; image?: string } | null;
  /** Brands new this week (from the cached weekly drift; null when it hasn't been read yet). */
  fresh: number | null;
  opened: boolean;
}

export async function teasers(userId: string, codes: string[], now = Date.now()): Promise<Record<string, Teaser>> {
  const week = isoWeek(now);
  const opened = await ddbQuery(`USER#${userId}`, `OPEN#${week}#`, 50, undefined, ["SK"]).catch(() => null);
  const open = new Set((opened?.items ?? []).map((x) => String(x.SK).split("#").pop()));
  const out: Record<string, Teaser> = {};
  await Promise.all(
    codes.map(async (code, i) => {
      const rec = await getReceipt(code).catch(() => null);
      const snap = rec?.status === "found" ? snapOf(rec.rec) : null;
      const b: SnapBrand | undefined = snap?.brands[0];
      // The weekly drift (cached a week, under its own daily guard) gives the seal its count, for the first few cards.
      const d = snap && i < DRIFT_CARDS ? await driftFor(code, snap, now).catch(() => null) : null;
      const fresh = d ? d.entered.length : null;
      out[code] = { top: b ? { name: b.name, image: b.image } : null, fresh, opened: open.has(code) };
    }),
  );
  return out;
}

export type OpenResult = { status: "paid"; dust: number } | { status: "opened" | "already" | "capped" | "not-owner" | "error" };

/** Breaks a card's seal for the week, and pays OPEN_DUST while the week's OPEN_CARDS last. */
export async function claimOpen(userId: string, code: string, now = Date.now()): Promise<OpenResult> {
  const own = await ddbGetStatus(`OWNER#${userId}`, `CARD#${code}`);
  if (own.status === "error" || own.status === "off") return { status: "error" };
  if (own.status !== "found" || Number(own.value.minted) !== 1) return { status: "not-owner" };
  // A card bought with money breaks its seal like any other, but never earns Stardust.
  const pays = earnsDust(own.value.funding);
  const week = isoWeek(now);
  const U = `USER#${userId}`;
  const seal = { PK: U, SK: `OPEN#${week}#${code}`, at: now };
  if (!dustOn() || !pays) {
    const r = await ddbPutIfAbsent(seal);
    return r === "created" ? { status: "opened" } : r === "exists" ? { status: "already" } : { status: "error" };
  }
  const r = await ddbTransact([
    { put: seal, condition: "attribute_not_exists(PK)" },
    {
      update: { PK: U, SK: `OPENS#${week}` },
      set: "SET #ttl = :ttl ADD n :one",
      names: { "#ttl": "ttl" },
      condition: "attribute_not_exists(PK) OR n <= :max",
      values: { ":one": 1, ":max": OPEN_CARDS - 1, ":ttl": Math.floor(now / 1000) + 21 * 86_400 },
    },
    { update: { PK: U, SK: "WALLET" }, set: "SET dustAt = :now ADD dust :d", condition: "attribute_exists(PK)", values: { ":now": now, ":d": OPEN_DUST } },
    { put: { PK: U, SK: `LEDGER#open#${week}#${code}`, delta: OPEN_DUST, unit: "dust", reason: "open", ref: code, at: now }, condition: "attribute_not_exists(PK)" },
  ]);
  if (!r) return { status: "error" };
  if (r.ok) return { status: "paid", dust: OPEN_DUST };
  if (r.reasons[0] === CCF) return { status: "already" };
  if (r.reasons[1] === CCF || r.reasons[2] === CCF) {
    // Over the week's paid opens (or no wallet yet): still break the seal, just without Stardust.
    const p = await ddbPutIfAbsent(seal);
    return p === "error" ? { status: "error" } : { status: "capped" };
  }
  return { status: "error" };
}
