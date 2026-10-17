import { ddbConfigured, ddbGet, ddbTransact } from "./ddb";

/**
 * Reading credits (DynamoDB). Off unless CREDITS_ON=1 and the table is configured, so the demo never changes.
 *   USER#<id>  PROFILE                 createdAt, freeGranted
 *   USER#<id>  WALLET                  credits, v
 *   USER#<id>  LEDGER#grant#free       the lazy FREE_MINTS grant (write-once)
 *   USER#<id>  LEDGER#run#<runId>      one spend per run id (write-once, so a retried request never charges twice)
 *   USER#<id>  LEDGER#refund#<runId>   one refund per run id, only if that run was charged
 * Ledger keys carry no timestamp on purpose: the key is the idempotency check. Each entry stores `at` for ordering.
 */
export const creditsOn = () => process.env.CREDITS_ON === "1" && ddbConfigured();

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

/** Creates the wallet with FREE_MINTS on first use (and the PROFILE if it isn't there yet). Safe to call repeatedly. */
export async function ensureWallet(userId: string): Promise<"created" | "exists" | "error"> {
  const free = freeMints();
  const now = Date.now();
  const r = await ddbTransact([
    { put: { ...key(userId, "WALLET"), credits: free, v: 0 }, condition: "attribute_not_exists(PK)" },
    { put: { ...key(userId, "LEDGER#grant#free"), delta: free, reason: "free", ref: "free", at: now }, condition: "attribute_not_exists(PK)" },
    {
      update: key(userId, "PROFILE"),
      set: "SET createdAt = if_not_exists(createdAt, :now), freeGranted = if_not_exists(freeGranted, :free)",
      values: { ":now": now, ":free": free },
    },
  ]);
  if (!r) return "error";
  if (r.ok) return "created";
  return r.reasons.includes(CCF) ? "exists" : "error";
}

export type Spend = "spent" | "dup" | "used" | "empty" | "error";

/**
 * Takes one credit for `runId`, on condition that credits >= 1. Idempotent per run id:
 * "dup" means this run id was already charged (and not refunded), so the caller may proceed without a second charge;
 * "used" means it was charged and refunded, so it can't be replayed for a free run.
 */
export async function spendCredit(userId: string, runId: string): Promise<Spend> {
  if (!RUN_ID_RE.test(runId)) return "error";
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await ddbTransact([
      { update: key(userId, "WALLET"), set: "SET credits = credits - :one, v = v + :one", condition: "credits >= :one", values: ONE },
      { put: { ...key(userId, `LEDGER#run#${runId}`), delta: -1, reason: "mint", ref: runId, at: Date.now() }, condition: "attribute_not_exists(PK)" },
    ]);
    if (!r) return "error";
    if (r.ok) return "spent";
    if (r.reasons[1] === CCF) return (await ddbGet(pk(userId), `LEDGER#refund#${runId}`)) ? "used" : "dup";
    if (r.reasons[0] !== CCF) return "error";
    // No credits, or no wallet yet: grant the free ones once, then try again.
    if (attempt > 0) return "empty";
    const w = await ensureWallet(userId);
    if (w === "error") return "error";
    if (w === "exists") return "empty";
  }
  return "empty";
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
export async function wallet(userId: string): Promise<{ credits: number; freeLeft: number } | null> {
  let w = await ddbGet(pk(userId), "WALLET");
  if (!w) {
    if ((await ensureWallet(userId)) === "error") return null;
    w = await ddbGet(pk(userId), "WALLET");
    if (!w) return null;
  }
  const credits = Math.max(0, Number(w.credits) || 0);
  // No purchases yet, so every credit is a free one. Once the shop sells credits, track paid vs free on the wallet.
  return { credits, freeLeft: Math.min(credits, freeMints()) };
}
