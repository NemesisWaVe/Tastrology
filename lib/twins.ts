import { sharedCache, upstash, upstashConfigured, upstashGetStatus } from "./cache";
import { cardCode, type CardData } from "./card";
import { ddbDelete, ddbGetStatus, ddbPutIfAbsent, ddbUpdate } from "./ddb";
import type { Lookup } from "./lookup";
import { s3Delete, s3GetStatus, s3PutIfAbsent } from "./s3";

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

/* ------------------------------------------------------------ tombstones (docs/design/burn.md) */

/**
 * CARD#<code>/TOMBSTONE {burnedAt, by, revived}: written when an owner burns the card. While `revived` isn't 1,
 * every public lookup of the code answers "burned" (the share page shows a 410). A later fresh reading of the same
 * loves (anyone's) revives it: registerTwin sets revived=1. The item itself stays, so a re-minted code never earns dust twice.
 * Each instance remembers the answer for a minute; the burning instance forgets it at once.
 */
const tombs = sharedCache<number>("tombs", 4000); // burnedAt, or 0 when not burned
const TOMB_MEMO_MS = 60_000;

/** When the code was burned (ms), 0 if it isn't, or null when the table couldn't answer (callers fail open). */
export async function burnedAt(code: string): Promise<number | null> {
  const hit = tombs.get(code);
  if (hit !== undefined) return hit;
  const r = await ddbGetStatus(`CARD#${code}`, "TOMBSTONE", 1500);
  if (r.status === "error") return null;
  const at = r.status === "found" && Number(r.value.revived) !== 1 ? Number(r.value.burnedAt) || 1 : 0;
  tombs.set(code, at, TOMB_MEMO_MS);
  return at;
}

/** Drops this instance's copies of a twin (after a burn), so the next lookup goes to storage. */
export function forgetTwin(code: string): void {
  mem.delete(code);
  tombs.delete(code);
}

/** After a burn: deletes the stored copies (S3, DynamoDB META, Upstash). Best effort; the tombstone already hides the card. */
export async function purgeTwin(code: string): Promise<void> {
  forgetTwin(code);
  await Promise.allSettled([
    s3Delete(`twins/v1/${code}.json`),
    ddbDelete(`CARD#${code}`, "META"),
    upstashConfigured() ? upstash([["DEL", rkey(code)]]) : null,
  ]);
}

/** A fresh reading produced this code again: lift a burn's tombstone so the new owner's link works. */
async function reviveIfBurned(code: string): Promise<void> {
  const r = await ddbGetStatus(`CARD#${code}`, "TOMBSTONE");
  if (r.status === "found" && Number(r.value.revived) !== 1) await ddbUpdate(`CARD#${code}`, "TOMBSTONE", "SET revived = :one, revivedAt = :now", { values: { ":one": 1, ":now": Date.now() } });
  tombs.delete(code);
}

/** Stores the card under its code (memory, S3 and DynamoDB write-once, Upstash NX) and returns the code. Never throws; waits ≤ ~3s. */
export async function registerTwin(card: CardData): Promise<string> {
  const code = cardCode(card);
  try {
    const json = JSON.stringify(card);
    if (json.length > MAX_BYTES) return code;
    mem.set(code, json, TTL_MS);
    const writes = Promise.allSettled([
      s3PutIfAbsent(`twins/v1/${code}.json`, json),
      ddbPutIfAbsent({ PK: `CARD#${code}`, SK: "META", card: json, rarityScore: card.rarityScore, createdAt: Date.now() }),
      upstashConfigured() ? upstash([["SET", rkey(code), json, "PX", TTL_MS, "NX"]]) : null,
      reviveIfBurned(code),
    ]);
    await Promise.race([writes, new Promise((r) => setTimeout(r, WAIT_MS))]);
  } catch {}
  return code;
}

export type TwinLookup = { status: "found"; card: CardData } | { status: "missing" | "error"; card: null } | { status: "burned"; card: null; at: number };

/**
 * Tombstone first (a burned code answers "burned"), then memory, S3, DynamoDB, Upstash. Only returns a card whose own fields hash to `code`.
 * "error" means nothing was found and at least one backend couldn't answer, so the code may still exist:
 * callers must not cache that as a 404.
 */
export async function getTwinStatus(code: string): Promise<TwinLookup> {
  if (!TWIN_CODE.test(code)) return { status: "missing", card: null };
  const at = await burnedAt(code);
  if (at) return { status: "burned", card: null, at };
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
  if (hit) return { status: "found", card: hit };
  const seen: Lookup<unknown>["status"][] = [];
  const sources: (() => Promise<string | null>)[] = [
    async () => {
      const r = await s3GetStatus(`twins/v1/${code}.json`);
      seen.push(r.status);
      return r.status === "found" ? r.value : null;
    },
    async () => {
      const r = await ddbGetStatus(`CARD#${code}`, "META");
      seen.push(r.status);
      return r.status === "found" && typeof r.value.card === "string" ? r.value.card : null;
    },
    async () => {
      const r = await upstashGetStatus(rkey(code));
      seen.push(r.status);
      return r.status === "found" ? r.value : null;
    },
  ];
  for (const read of sources) {
    const found = parse(await read());
    if (found) {
      mem.set(code, JSON.stringify(found), TTL_MS);
      return { status: "found", card: found };
    }
  }
  return { status: seen.includes("error") ? "error" : "missing", card: null };
}

/** The card for `code`, or null (missing, burned or unreachable). */
export async function getTwin(code: string): Promise<CardData | null> {
  return (await getTwinStatus(code)).card;
}
