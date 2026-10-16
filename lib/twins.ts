import { sharedCache, upstash, upstashConfigured } from "./cache";
import { cardCode, type CardData } from "./card";
import { s3Get, s3PutIfAbsent } from "./s3";

/**
 * Digital twins of minted cards, keyed by verify code. Only the server writes them (end of a live run),
 * so a code can't be forged or squatted. Stores the rendered card only: no raw Qloo responses, no IP.
 */
const TTL_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 60_000;
const WAIT_MS = 3000;
const mem = sharedCache<string>("twins", 2000);
const rkey = (code: string) => `tm:twin:${code}`;
export const TWIN_CODE = /^\d{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

/** Stores the card under its code (memory, S3 write-once, Upstash NX) and returns the code. Never throws; waits ≤ ~3s. */
export async function registerTwin(card: CardData): Promise<string> {
  const code = cardCode(card);
  try {
    const json = JSON.stringify(card);
    if (json.length > MAX_BYTES) return code;
    mem.set(code, json, TTL_MS);
    const writes = Promise.allSettled([
      s3PutIfAbsent(`twins/v1/${code}.json`, json),
      upstashConfigured() ? upstash([["SET", rkey(code), json, "PX", TTL_MS, "NX"]]) : null,
    ]);
    await Promise.race([writes, new Promise((r) => setTimeout(r, WAIT_MS))]);
  } catch {}
  return code;
}

/** Memory, then S3, then Upstash. Only returns a card whose own fields hash to `code`. */
export async function getTwin(code: string): Promise<CardData | null> {
  if (!TWIN_CODE.test(code)) return null;
  const parse = (raw: string | null | undefined): CardData | null => {
    if (!raw) return null;
    try {
      const c = JSON.parse(raw) as CardData;
      return cardCode(c) === code ? c : null;
    } catch {
      return null;
    }
  };
  const hit = parse(mem.get(code));
  if (hit) return hit;
  const fromS3 = parse(await s3Get(`twins/v1/${code}.json`));
  const found =
    fromS3 ?? parse(upstashConfigured() ? (((await upstash([["GET", rkey(code)]])) ?? [])[0] as string | null) : null);
  if (found) mem.set(code, JSON.stringify(found), TTL_MS);
  return found;
}
