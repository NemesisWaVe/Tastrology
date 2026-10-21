import { createHash } from "node:crypto";
import { SEASON, buildCard, cardCode } from "./card";
import { ddbGet, ddbPutIfAbsent } from "./ddb";
import { rollFor, rollOn } from "./roll";
import type { StyleResult } from "./types";

/**
 * Reading vs print. A reading is what Qloo and the LLM make of a set of loves: deterministic, expensive, cached and
 * shared by picks. A print is one mint of a reading by one account: its rarity roll, second-draw cap and print id.
 * Minting the same loves again re-uses the reading and makes a new print, so it is a new card with its own roll and
 * code (chasing a Holo of the same taste is the point of rarity). A retry of one mint keeps its run id, so it lands on
 * the identical print: same card, same code, charged once.
 */

export interface PrintOwner {
  userId: string;
  /** The client's x-run-id for this mint, unchanged across its retries. */
  runId: string;
  /** Paid by a regret: the print can't outrank this tier. */
  cap?: "common" | "rare" | "holo" | "secret";
  /** Which try at a free code this is (claimPrint): 0 for the first, so most prints never carry one. */
  salt?: number;
}

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 6 Crockford characters from the account and the run id. Same run, same print; any other run, another one. */
export const printId = (userId: string, runId: string, salt = 0) => {
  const h = createHash("sha256").update(`print|${userId}|${runId}${salt ? `|${salt}` : ""}`).digest();
  return Array.from(h.subarray(0, 6), (b) => B32[b & 31]).join("");
};

/** A reading as cached and shared: no account's roll, cap or print on it (older cache entries may still carry them). */
export function unstamped(r: StyleResult): StyleResult {
  const { roll: _roll, redraw: _redraw, print: _print, ...base } = r;
  return base;
}

/** One account's print of a reading, on a copy. Mock readings stay unprinted (they're never filed). */
export function stamp(base: StyleResult, m: PrintOwner): StyleResult {
  const r = unstamped(base);
  if (r.mode === "mock") return r;
  if (rollOn()) r.roll = rollFor(m.userId, m.runId, SEASON);
  if (m.cap) r.redraw = { cap: m.cap };
  r.print = printId(m.userId, m.runId, m.salt);
  return r;
}

const TRIES = 6;

/**
 * A print whose code is this mint's alone. The code is the taste serial plus 4 check characters, so two different
 * prints can hash to the same code (about 1 in a million per pair with the same loves; with many copies of a popular
 * taste that adds up). Without this, the second card's twin write is refused and its link opens the first person's card.
 * So the code is claimed (write-once, CODE#<code> CLAIM, owner = account|run) before anything is filed under it: the
 * same mint coming back finds its own claim, anyone else gets the next salt, i.e. another print id and code. A code
 * already held by a card filed before claims existed counts as taken. The roll is the run's and never changes.
 * If DynamoDB can't answer, the first print goes ahead, as before claims.
 */
export async function claimPrint(base: StyleResult, m: PrintOwner): Promise<StyleResult> {
  const me = `${m.userId}|${m.runId}`;
  let r = stamp(base, m);
  for (let salt = 0; salt < TRIES && r.print; salt++) {
    r = stamp(base, { ...m, salt });
    const code = cardCode(buildCard(r));
    const put = await ddbPutIfAbsent({ PK: `CODE#${code}`, SK: "CLAIM", owner: me, at: Date.now() });
    if (put === "error") return r;
    if (put === "exists") {
      if ((await ddbGet(`CODE#${code}`, "CLAIM").catch(() => null))?.owner === me) return r;
      continue;
    }
    const held = await ddbGet(`CARD#${code}`, "META").catch(() => null);
    if (!held || heldPrint(held.card) === r.print) return r;
  }
  return r;
}

const heldPrint = (json: unknown) => {
  try {
    return (JSON.parse(String(json)) as { print?: string }).print;
  } catch {
    return undefined;
  }
};
