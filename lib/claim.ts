import { ddbGet, ddbPutIfAbsent, ddbQuery } from "./ddb";

export const CLAIM_MAX = 100;

export type ClaimResult =
  | { ok: true; moved: number; complete: boolean }
  | { ok: false; reason: "other-account" | "error" };

/**
 * Moves a device's anonymous deck into an account, once.
 * 1. DEVICE#<dev>/CLAIM is write-once: a device belongs to the first account that claims it (a shared computer can't feed a second account).
 *    The same account may re-run the claim, so a half-finished copy can be retried.
 * 2. Every OWNER#<dev> card is copied write-once to OWNER#<userId> with minted:0, source:"claim" (the device never proved who minted it).
 * The device items stay where they are (retry window); `complete` says whether every copy landed, so the caller knows it may clear tm_d.
 * USER#<userId>/CLAIM#<dev> and `own: 1` on cards minted on that device let closing the account find and erase them (lib/wipe.ts).
 */
export async function claimDevice(userId: string, dev: string): Promise<ClaimResult> {
  const put = await ddbPutIfAbsent({ PK: `DEVICE#${dev}`, SK: "CLAIM", userId, at: Date.now() });
  if (put === "error") return { ok: false, reason: "error" };
  if (put === "exists") {
    const prior = await ddbGet(`DEVICE#${dev}`, "CLAIM");
    if (!prior) return { ok: false, reason: "error" };
    if (prior.userId !== userId) return { ok: false, reason: "other-account" };
  }
  if ((await ddbPutIfAbsent({ PK: `USER#${userId}`, SK: `CLAIM#${dev}`, dev, at: Date.now() })) === "error") return { ok: false, reason: "error" };
  const page = await ddbQuery(`OWNER#${dev}`, "CARD#", CLAIM_MAX);
  if (!page) return { ok: false, reason: "error" };
  let moved = 0;
  let complete = true;
  const guest = await ddbGet(`DEVICE#${dev}`, "READING");
  for (const it of page.items) {
    const code = String(it.code ?? "");
    if (!code) continue;
    const out = await ddbPutIfAbsent({
      PK: `OWNER#${userId}`,
      SK: `CARD#${code}`,
      code,
      card: String(it.card ?? ""),
      rarityScore: Number(it.rarityScore) || 0,
      addedAt: Number(it.addedAt) || Date.now(),
      minted: guest?.code === code && it.source === "guest" ? 1 : 0,
      source: guest?.code === code && it.source === "guest" ? "guest" : "claim",
      // minted on this device (not collected there): it goes when the account is closed
      ...(Number(it.minted) === 1 ? { own: 1 } : {}),
    });
    if (out === "created") moved++;
    else if (out === "error") complete = false;
  }
  return { ok: true, moved, complete };
}
