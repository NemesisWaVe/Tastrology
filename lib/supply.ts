import { upstash, upstashConfigured } from "./cache";
import { SECRET_SUPPLY } from "./odds";

/**
 * A fixed number of Secret Rares per edition (SECRET_SUPPLY, published on /odds), however many people mint. A mint
 * whose roll lands on Secret reserves the next slot before its code exists (the tier is part of the code), so the
 * number it gets ("037 / 100") is the one printed on it. Past the last slot, a Secret roll lands as a Holo.
 *
 *   tm:no:secret / tm:no:<ed>:secret   the edition's Secret counter (the same one lib/cardStyle numbers with, so the
 *                                      Secrets numbered before the cap count toward it and numbers never repeat)
 *   tm:sup:<ed>:<account>|<run>        this mint's slot, write-once (0 = the supply was gone): a retry of the mint
 *                                      gets the same answer and never takes a second slot
 */

/** `n` is the slot (1..of), or 0 when every slot was already taken. */
export interface Seal {
  no: number;
  of: number;
}

export class SealError extends Error {}

const counter = (edition: string) => (edition === "01" ? "tm:no:secret" : `tm:no:${edition}:secret`);
const slotKey = (edition: string, mint: string) => `tm:sup:${edition}:${mint}`;

// One atomic step in Redis: a mint that already has an answer gets it back; otherwise the next slot if any is left.
const RESERVE = `local had = redis.call('GET', KEYS[2])
if had then return tonumber(had) end
local n = tonumber(redis.call('GET', KEYS[1]) or '0')
if n >= tonumber(ARGV[1]) then redis.call('SET', KEYS[2], '0') return 0 end
n = redis.call('INCR', KEYS[1])
redis.call('SET', KEYS[2], n)
return n`;

/**
 * Reserves (or finds) this mint's Secret slot. `peek` only looks: null when the mint never reserved one (and always
 * null without Redis configured).
 * Throws SealError when the counter can't answer, so the mint fails and is refunded rather than printing a Secret the
 * cap can't vouch for, or quietly taking one away.
 */
export async function sealSecret(edition: string, mint: string, peek = false): Promise<Seal | null> {
  // No Redis at all (local dev, tests): nothing to count against, so the Secret stands unnumbered.
  if (!upstashConfigured()) return null;
  const of = SECRET_SUPPLY;
  const r = peek ? await upstash([["GET", slotKey(edition, mint)]]) : await upstash([["EVAL", RESERVE, 2, counter(edition), slotKey(edition, mint), of]]);
  if (!r) throw new SealError("secret supply unavailable");
  if (peek && r[0] == null) return null;
  const no = Number(r[0]);
  if (!Number.isFinite(no)) throw new SealError("secret supply unavailable");
  return { no, of };
}
