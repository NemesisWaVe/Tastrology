import { ddbQuery } from "./ddb";

/**
 * When the economy (Shop, Stardust, packs, the Atelier) shows itself to a player. A first visit is one promise,
 * one card, one share: the economy appears after the second card or the first fight (NOTES ★ North star, step 2).
 * Never a lock: /shop still opens by URL, and anyone who already holds Stardust keeps seeing it.
 */
export const OPEN_AT_CARDS = 2;

const known = new Set<string>();

/** Opened once, stays open (per instance; the next instance re-reads the same facts and agrees). */
export async function economyOpen(uid: string, dust: number | null | undefined, admin: boolean): Promise<boolean> {
  if (admin || (dust ?? 0) > 0 || known.has(uid)) return mark(uid);
  const [held, bouts] = await Promise.all([
    ddbQuery(`OWNER#${uid}`, "CARD#", OPEN_AT_CARDS, undefined, ["code"]),
    ddbQuery(`USER#${uid}`, "BOUT#", 1, undefined, ["status"]),
  ]);
  // Can't tell (table down): show it rather than hide a shop someone may already use.
  if (!held || !bouts) return true;
  return held.items.length >= OPEN_AT_CARDS || bouts.items.length > 0 ? mark(uid) : false;
}

function mark(uid: string): true {
  known.add(uid);
  return true;
}
