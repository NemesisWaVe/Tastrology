import { ddbConfigured, ddbGet, ddbTransact } from "./ddb";

/**
 * Reading credits (DynamoDB). Off unless CREDITS_ON=1 and the table is configured, so the demo never changes.
 *   USER#<id>  PROFILE                 createdAt, freeGranted
 *   USER#<id>  WALLET                  credits, v
 *   USER#<id>  LEDGER#grant#free       the lazy FREE_MINTS grant (write-once)
 *   USER#<id>  LEDGER#run#<runId>      one spend per run id (write-once, so a retried request never charges twice)
 *   USER#<id>  LEDGER#refund#<runId>   one refund per run id, only if that run was charged
 *   USER#<id>  LEDGER#refill#<base>    the monthly refill for the cycle that started at <base> (write-once, so it never stacks)
 *   DEVICE#<id> GRANTS#<yyyy-mm>       how many accounts this browser funded a first card for this month
 * Ledger keys carry no timestamp on purpose: the key is the idempotency check. Each entry stores `at` for ordering.
 */
export const creditsOn = () => process.env.CREDITS_ON === "1" && ddbConfigured();

/** Days between free refills (env REFILL_DAYS, default 30): one new card a month, held one at a time. */
export function refillDays(): number {
  const n = Math.floor(Number(process.env.REFILL_DAYS));
  return Number.isFinite(n) && n >= 1 ? n : 30;
}
const DAY = 24 * 3600 * 1000;
/** A browser may fund at most this many first cards a month; accounts past it start empty and wait for the refill. */
const DEVICE_GRANTS = 2;

/**
 * Free readings per account (env FREE_MINTS, default 3). Never below 1: a referred friend must be able to qualify
 * without paying (legal review, design doc §11 #9), so a 0 or junk value falls back to the floor. Enforced by a test.
 */
export const FREE_MINTS_FLOOR = 1;
export function freeMints(): number {
  const raw = process.env.FREE_MINTS;
  const n = raw === undefined || raw === "" ? 3 : Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.max(FREE_MINTS_FLOOR, n) : 3;
}

export const RUN_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

const pk = (userId: string) => `USER#${userId}`;
const key = (userId: string, SK: string) => ({ PK: pk(userId), SK });
const ONE = { ":one": 1 };
const CCF = "ConditionalCheckFailed";

/**
 * Creates the wallet with FREE_MINTS on first use (and the PROFILE if it isn't there yet). Safe to call repeatedly.
 * With a device id, it also counts the grant against that browser: past DEVICE_GRANTS a month the wallet starts at 0.
 */
export async function ensureWallet(userId: string, device?: string | null): Promise<"created" | "exists" | "error"> {
  const now = Date.now();
  const make = (free: number, withDevice: boolean) =>
    ddbTransact([
      { put: { ...key(userId, "WALLET"), credits: free, v: 0 }, condition: "attribute_not_exists(PK)" },
      { put: { ...key(userId, "LEDGER#grant#free"), delta: free, reason: "free", ref: "free", at: now }, condition: "attribute_not_exists(PK)" },
      {
        update: key(userId, "PROFILE"),
        set: "SET createdAt = if_not_exists(createdAt, :now), freeGranted = if_not_exists(freeGranted, :free)",
        values: { ":now": now, ":free": free },
      },
      ...(withDevice && device
        ? [
            {
              update: { PK: `DEVICE#${device}`, SK: `GRANTS#${new Date(now).toISOString().slice(0, 7)}` },
              set: "ADD n :one",
              condition: "attribute_not_exists(n) OR n <= :last",
              values: { ":one": 1, ":last": DEVICE_GRANTS - 1 },
            },
          ]
        : []),
    ]);
  let r = await make(freeMints(), true);
  // Only the device cap failed: this browser already funded its share, so the account starts empty.
  if (r && !r.ok && r.reasons[3] === CCF && r.reasons[0] !== CCF) r = await make(0, false);
  if (!r) return "error";
  if (r.ok) return "created";
  return r.reasons.includes(CCF) ? "exists" : "error";
}

/** When the next free refill is due: REFILL_DAYS after the last fresh mint (or after sign-up, if none yet). */
async function refillBase(userId: string): Promise<number | null> {
  const p = await ddbGet(pk(userId), "PROFILE");
  if (!p) return null;
  const base = Number(p.lastMintAt) || Number(p.createdAt);
  return Number.isFinite(base) && base > 0 ? base : null;
}

export async function nextRefillAt(userId: string): Promise<number | null> {
  const base = await refillBase(userId);
  return base === null ? null : base + refillDays() * DAY;
}

/**
 * The monthly refill, granted lazily (no cron): once due, an empty wallet goes back to 1. Write-once per cycle, so
 * missed months never stack and a refill can't be claimed twice.
 */
export async function grantRefill(userId: string, now = Date.now()): Promise<"granted" | "wait" | "none" | "error"> {
  const base = await refillBase(userId);
  if (base === null) return "none";
  if (now < base + refillDays() * DAY) return "wait";
  const r = await ddbTransact([
    { update: key(userId, "WALLET"), set: "SET credits = :one, v = v + :one", condition: "attribute_exists(PK) AND credits <= :zero", values: { ":one": 1, ":zero": 0 } },
    { put: { ...key(userId, `LEDGER#refill#${base}`), delta: 1, reason: "refill", ref: String(base), at: now }, condition: "attribute_not_exists(PK)" },
  ]);
  if (!r) return "error";
  return r.ok ? "granted" : "none";
}

export type Spend = "spent" | "dup" | "used" | "empty" | "error";

/**
 * Takes one credit for `runId`, on condition that credits >= 1. Idempotent per run id:
 * "dup" means this run id was already charged (and not refunded), so the caller may proceed without a second charge;
 * "used" means it was charged and refunded, so it can't be replayed for a free run.
 */
export async function spendCredit(userId: string, runId: string, device?: string | null): Promise<Spend> {
  if (!RUN_ID_RE.test(runId)) return "error";
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = Date.now();
    const r = await ddbTransact([
      { update: key(userId, "WALLET"), set: "SET credits = credits - :one, v = v + :one", condition: "credits >= :one", values: ONE },
      { put: { ...key(userId, `LEDGER#run#${runId}`), delta: -1, reason: "mint", ref: runId, at: now }, condition: "attribute_not_exists(PK)" },
      // The refill clock restarts at every fresh mint.
      { update: key(userId, "PROFILE"), set: "SET lastMintAt = :now", values: { ":now": now } },
    ]);
    if (!r) return "error";
    if (r.ok) return "spent";
    if (r.reasons[1] === CCF) return (await ddbGet(pk(userId), `LEDGER#refund#${runId}`)) ? "used" : "dup";
    if (r.reasons[0] !== CCF) return "error";
    // No credits, or no wallet yet: grant the free ones once (then the monthly refill, if due), then try again.
    const w = await ensureWallet(userId, device);
    if (w === "error") return "error";
    if (w === "exists") {
      const g = await grantRefill(userId, now);
      if (g === "error") return "error";
      if (g !== "granted") return "empty";
    }
  }
  return "empty";
}

/** How long a regret credit (docs/design/regret-burn.md) can wait before it lapses. */
export const REGRET_TTL_MS = 30 * DAY;

/**
 * Pays for a reading with the regret credit, if one is held and unexpired. Unlike spendCredit it does not restart the
 * refill clock: a regret neither delays nor brings forward the monthly card.
 */
export async function spendRegret(userId: string, runId: string, now = Date.now()): Promise<Spend> {
  if (!RUN_ID_RE.test(runId)) return "error";
  const r = await ddbTransact([
    { update: key(userId, "WALLET"), set: "SET regret = regret - :one, v = v + :one", condition: "regret >= :one AND regretExp >= :now", values: { ":one": 1, ":now": now } },
    { put: { ...key(userId, `LEDGER#run#${runId}`), delta: -1, reason: "regret", ref: runId, at: now }, condition: "attribute_not_exists(PK)" },
  ]);
  if (!r) return "error";
  if (r.ok) return "spent";
  if (r.reasons[1] === CCF) return (await ddbGet(pk(userId), `LEDGER#refund#${runId}`)) ? "used" : "dup";
  return r.reasons[0] === CCF ? "empty" : "error";
}

/** The regret credit held right now (and the picks it can't be spent on), or null. */
export async function heldRegret(userId: string, now = Date.now()): Promise<{ pick: string; tier: "common" | "rare" | "holo" | "secret" } | null> {
  const w = await ddbGet(pk(userId), "WALLET");
  if (!w || Number(w.regret) < 1 || Number(w.regretExp) < now) return null;
  const t = String(w.regretTier ?? "common");
  return { pick: String(w.regretPick ?? ""), tier: t === "rare" || t === "holo" || t === "secret" ? t : "common" };
}

/** Gives a failed regret-paid run its regret credit back (write-once per run id, like refundCredit). */
export async function refundRegret(userId: string, runId: string): Promise<"refunded" | "dup" | "none" | "error"> {
  if (!RUN_ID_RE.test(runId)) return "error";
  const r = await ddbTransact([
    { update: key(userId, "WALLET"), set: "SET regret = :one, v = v + :one", condition: "attribute_exists(PK)", values: ONE },
    { put: { ...key(userId, `LEDGER#refund#${runId}`), delta: 1, reason: "refund", ref: runId, at: Date.now() }, condition: "attribute_not_exists(PK)" },
    { check: key(userId, `LEDGER#run#${runId}`), condition: "attribute_exists(PK)" },
  ]);
  if (!r) return "error";
  if (r.ok) return "refunded";
  if (r.reasons[1] === CCF) return "dup";
  if (r.reasons[2] === CCF) return "none";
  return "error";
}

/** Gives back the credit a failed run took. Write-once per run id, and only when that run was actually charged. */
export async function refundCredit(userId: string, runId: string): Promise<"refunded" | "dup" | "none" | "error"> {
  if (!RUN_ID_RE.test(runId)) return "error";
  const r = await ddbTransact([
    { update: key(userId, "WALLET"), set: "SET v = v + :one ADD credits :one", condition: "attribute_exists(PK)", values: ONE },
    { put: { ...key(userId, `LEDGER#refund#${runId}`), delta: 1, reason: "refund", ref: runId, at: Date.now() }, condition: "attribute_not_exists(PK)" },
    { check: key(userId, `LEDGER#run#${runId}`), condition: "attribute_exists(PK)" },
  ]);
  if (!r) return "error";
  if (r.ok) return "refunded";
  if (r.reasons[1] === CCF) return "dup";
  if (r.reasons[2] === CCF) return "none";
  return "error";
}

/** Credits for the account page. Creates the wallet lazily, so a new account sees its free readings straight away. */
export async function wallet(userId: string, device?: string | null): Promise<{ credits: number; freeLeft: number; refillAt: number | null } | null> {
  let w = await ddbGet(pk(userId), "WALLET");
  if (!w) {
    if ((await ensureWallet(userId, device)) === "error") return null;
    w = await ddbGet(pk(userId), "WALLET");
    if (!w) return null;
  }
  let credits = Math.max(0, Number(w.credits) || 0);
  if (credits === 0 && (await grantRefill(userId)) === "granted") credits = 1;
  // A held regret credit is a card in hand too.
  if (Number(w.regret) >= 1 && Number(w.regretExp) >= Date.now()) credits += 1;
  const refillAt = credits === 0 ? await nextRefillAt(userId) : null;
  // No purchases yet, so every credit is a free one. Once the shop sells credits, track paid vs free on the wallet.
  return { credits, freeLeft: Math.min(credits, freeMints()), refillAt };
}
