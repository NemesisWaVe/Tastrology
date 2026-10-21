import { createHash } from "node:crypto";
import { SEASON } from "./card";
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
}

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 6 Crockford characters from the account and the run id. Same run, same print; any other run, another one. */
export const printId = (userId: string, runId: string) => {
  const h = createHash("sha256").update(`print|${userId}|${runId}`).digest();
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
  r.print = printId(m.userId, m.runId);
  return r;
}
