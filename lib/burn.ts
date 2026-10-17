import { RARITY_CUTS, type Rarity } from "./card";
import { ddbGet, ddbGetStatus, ddbQuery, ddbTransact, type Flat, type TxOp } from "./ddb";
import { REGRET_TTL_MS } from "./ledger";
import { purgeFighter } from "./fighters";
import { dustFor, dustOn, earnedThisWeek, isoWeek, WEEKLY_DUST_CAP, type Funding } from "./stardust";
import { dropReceipt } from "./receipt";
import { purgeTwin } from "./twins";

/**
 * Burning a card (docs/design/burn.md). Only the signed-in owner of a `minted:1` deck item can burn it.
 *   USER#<id>   BURN#<code>         tier, dust (first burn), n, firstAt, lastAt, lastDust   one per code, kept forever
 *   CARD#<code> TOMBSTONE           burnedAt, by, revived                                   the public link answers 410
 * One transaction removes the deck item, writes BURN# and the tombstone and, when dust is due, the weekly counter,
 * the wallet and LEDGER#burn#<code>. Dust is paid once per code per account, only when no one burned the code before,
 * only for a mint that spent a credit, and never past WEEKLY_DUST_CAP.
 */
export type DustReason = "off" | "uncharged" | "burned-before" | "cap";

export type BurnResult =
  | { status: "burned" | "dup"; code: string; tier: Rarity; dust: number; capped: boolean; reason?: DustReason; balance: number | null }
  | { status: "regretted"; code: string; tier: Rarity; kind: "credit" | "dust"; dust: number; regretsLeft: number; balance: number | null }
  | { status: "not-eligible"; why: RegretWhy }
  | { status: "not-owner" | "not-minted" | "error" };

/** Regret burns (docs/design/regret-burn.md): two per account, ever, on your newest own mint within 72 hours. */
export const REGRETS_MAX = 2;
/** Regret burns need credits on (there's nothing to give back without them). REGRET_BURN=0 switches them off. */
export const regretOn = () => dustOn() && process.env.REGRET_BURN !== "0";
export const REGRET_WINDOW_MS = 72 * 3600 * 1000;
/** The second regret pays this much Stardust; the first pays a regret credit (one new card). */
export const REGRET_DUST = 50;
export type RegretWhy = "used-up" | "too-old" | "not-newest" | "uncharged";

/** Whether a deck item can be regretted, given the account's other mints and how many regrets it has used. */
export function regretWhy(item: Flat, newestAddedAt: number, used: number, charged: boolean, now = Date.now()): RegretWhy | null {
  if (used >= REGRETS_MAX) return "used-up";
  if (!charged) return "uncharged";
  const at = Number(item.addedAt) || 0;
  if (now - at > REGRET_WINDOW_MS) return "too-old";
  if (at < newestAddedAt) return "not-newest";
  return null;
}
const REGRET_FUNDING = new Set(["free", "paid", "regret"]);

const CCF = "ConditionalCheckFailed";
const RARITIES: Rarity[] = ["common", "rare", "holo", "secret"];

/** The tier of a deck item: from its card JSON, else from its stored rarityScore. */
export function tierOf(item: Flat): Rarity {
  try {
    const r = (JSON.parse(String(item.card ?? "")) as { rarity?: unknown }).rarity;
    if (RARITIES.includes(r as Rarity)) return r as Rarity;
  } catch {}
  const s = Number(item.rarityScore) || 0;
  return s >= RARITY_CUTS.secret ? "secret" : s >= RARITY_CUTS.holo ? "holo" : s >= RARITY_CUTS.rare ? "rare" : "common";
}

const asFunding = (v: unknown): Funding | undefined => (v === "free" || v === "paid" || v === "dust" ? v : undefined);

/** Dust a burn of this deck item would earn before the weekly cap (the deck shows it on the confirm line). */
export function previewDust(item: Flat): number {
  if (!dustOn() || Number(item.minted) !== 1 || !item.runId) return 0;
  return dustFor(tierOf(item), asFunding(item.funding));
}

async function balance(userId: string): Promise<number | null> {
  if (!dustOn()) return null;
  const w = await ddbGet(`USER#${userId}`, "WALLET");
  return Math.max(0, Number(w?.dust) || 0);
}

function fromPrior(code: string, prior: Flat, bal: number | null): BurnResult {
  const tier = RARITIES.includes(prior.tier as Rarity) ? (prior.tier as Rarity) : "common";
  return { status: "dup", code, tier, dust: Number(prior.lastDust) || 0, capped: prior.lastCapped === 1, balance: bal };
}

export async function burnCard(userId: string, code: string, now = Date.now(), regret = false): Promise<BurnResult> {
  const U = `USER#${userId}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const own = await ddbGetStatus(`OWNER#${userId}`, `CARD#${code}`);
    if (own.status === "error" || own.status === "off") return { status: "error" };
    if (own.status === "missing") {
      // Already burned (a retry, or a second tab): answer with what that burn did. Otherwise it was never ours.
      const prior = await ddbGetStatus(U, `BURN#${code}`);
      if (prior.status === "found") return fromPrior(code, prior.value, await balance(userId));
      return prior.status === "missing" ? { status: "not-owner" } : { status: "error" };
    }
    const item = own.value;
    if (Number(item.minted) !== 1) return { status: "not-minted" };
    const tier = tierOf(item);

    const [prior, tomb] = await Promise.all([ddbGetStatus(U, `BURN#${code}`), ddbGetStatus(`CARD#${code}`, "TOMBSTONE")]);
    if (prior.status === "error" || tomb.status === "error") return { status: "error" };
    const burnedBefore = prior.status === "found" || tomb.status === "found";

    let reason: DustReason | undefined;
    let want = 0;
    // A regret pays a credit or REGRET_DUST instead of burn dust, never both, and skips the weekly cap.
    let regretOps: TxOp[] = [];
    let regretKind: "credit" | "dust" = "credit";
    let regretsLeft = 0;
    if (regret) {
      const funding = String(item.funding ?? "");
      const runId = String(item.runId ?? "");
      const [prof, mine] = await Promise.all([ddbGet(U, "PROFILE"), ddbQuery(`OWNER#${userId}`, "CARD#", 50, undefined, ["minted", "addedAt"])]);
      if (!mine) return { status: "error" };
      const charged = REGRET_FUNDING.has(funding) && Boolean(runId) && Boolean(await ddbGet(U, `LEDGER#run#${runId}`));
      const newest = Math.max(0, ...mine.items.filter((x) => Number(x.minted) === 1).map((x) => Number(x.addedAt) || 0));
      const used = Number(prof?.regretUsed) || 0;
      const why = regretWhy(item, newest, used, charged, now);
      if (why) return { status: "not-eligible", why };
      regretKind = used === 0 ? "credit" : "dust";
      regretsLeft = REGRETS_MAX - used - 1;
      regretOps = [
        used === 0
          ? { update: { PK: U, SK: "PROFILE" }, set: "ADD regretUsed :one", condition: "attribute_not_exists(regretUsed)", values: { ":one": 1 } }
          : { update: { PK: U, SK: "PROFILE" }, set: "ADD regretUsed :one", condition: "regretUsed = :n", values: { ":one": 1, ":n": used } },
        { put: { PK: U, SK: `REGRET#${code}`, n: used + 1, kind: regretKind, tier, at: now, pick: String(item.pick ?? "") }, condition: "attribute_not_exists(PK)" },
        regretKind === "credit"
          ? {
              update: { PK: U, SK: "WALLET" },
              set: "SET regret = :one, regretExp = :exp, regretPick = :pick",
              condition: "attribute_exists(PK)",
              values: { ":one": 1, ":exp": now + REGRET_TTL_MS, ":pick": String(item.pick ?? "") },
            }
          : { update: { PK: U, SK: "WALLET" }, set: "SET dustAt = :now ADD dust :d", condition: "attribute_exists(PK)", values: { ":now": now, ":d": REGRET_DUST } },
        { put: { PK: U, SK: `LEDGER#regret#${code}`, delta: regretKind === "credit" ? 1 : REGRET_DUST, unit: regretKind, reason: "regret", ref: code, at: now }, condition: "attribute_not_exists(PK)" },
      ];
    }
    if (regret) reason = "off";
    else if (!dustOn()) reason = "off";
    else if (burnedBefore) reason = "burned-before";
    else {
      const funding = asFunding(item.funding);
      const runId = String(item.runId ?? "");
      // The mint must have spent a credit, per the ledger. Admin, cached and dust-paid mints earn nothing.
      const charged = Boolean(runId) && (funding === "free" || funding === "paid") && Boolean(await ddbGet(U, `LEDGER#run#${runId}`));
      if (charged) want = dustFor(tier, funding);
      else reason = "uncharged";
    }
    let dust = want;
    if (want > 0) {
      const left = Math.max(0, WEEKLY_DUST_CAP - (await earnedThisWeek(userId, now)));
      dust = Math.min(want, left);
      if (dust < want) reason = "cap";
    }
    const capped = reason === "cap";

    const ops: TxOp[] = [{ delete: { PK: `OWNER#${userId}`, SK: `CARD#${code}` }, condition: "minted = :one", values: { ":one": 1 } }];
    ops.push(
      prior.status === "found"
        ? { update: { PK: U, SK: `BURN#${code}` }, set: "SET n = n + :one, lastAt = :now, lastDust = :d, lastCapped = :c", values: { ":one": 1, ":now": now, ":d": dust, ":c": capped ? 1 : 0 } }
        : {
            put: { PK: U, SK: `BURN#${code}`, code, tier, dust, n: 1, firstAt: now, lastAt: now, lastDust: dust, lastCapped: capped ? 1 : 0, runId: String(item.runId ?? ""), funding: String(item.funding ?? "") },
            condition: "attribute_not_exists(PK)",
          },
    );
    if (dust > 0) {
      const week = isoWeek(now);
      ops.push(
        {
          update: { PK: U, SK: `DUSTWEEK#${week}` },
          set: "SET #ttl = :ttl ADD earned :d",
          names: { "#ttl": "ttl" },
          condition: "attribute_not_exists(PK) OR earned <= :max",
          values: { ":d": dust, ":max": WEEKLY_DUST_CAP - dust, ":ttl": Math.floor(now / 1000) + 21 * 86_400 },
        },
        { update: { PK: U, SK: "WALLET" }, set: "SET dustAt = :now ADD dust :d", condition: "attribute_exists(PK)", values: { ":now": now, ":d": dust } },
        { put: { PK: U, SK: `LEDGER#burn#${code}`, delta: dust, unit: "dust", reason: "burn", ref: code, at: now }, condition: "attribute_not_exists(PK)" },
      );
    }
    ops.push(...regretOps);
    // The first burn of a code claims the tombstone (that's what makes the dust once-only across accounts too).
    ops.push(
      tomb.status === "found"
        ? { update: { PK: `CARD#${code}`, SK: "TOMBSTONE" }, set: "SET revived = :zero, burnedAt = :now", values: { ":zero": 0, ":now": now } }
        : { put: { PK: `CARD#${code}`, SK: "TOMBSTONE", burnedAt: now, by: "burn", revived: 0 }, condition: "attribute_not_exists(PK)" },
    );

    const r = await ddbTransact(ops);
    if (!r) return { status: "error" };
    if (!r.ok) {
      if (!r.reasons.includes(CCF)) return { status: "error" };
      continue; // someone moved first (another tab, another burner, the cap): read again and rebuild
    }
    await Promise.race([Promise.allSettled([purgeTwin(code), purgeFighter(code), dropReceipt(code)]), new Promise((res) => setTimeout(res, 3000))]);
    if (regret) return { status: "regretted", code, tier, kind: regretKind, dust: regretKind === "dust" ? REGRET_DUST : 0, regretsLeft, balance: await balance(userId) };
    return { status: "burned", code, tier, dust, capped, reason, balance: await balance(userId) };
  }
  return { status: "error" };
}
