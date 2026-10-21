import { ENGINE_V } from "./battle";
import { upstash, upstashConfigured } from "./cache";
import { ddbConfigured, ddbDelete, ddbGet, ddbQuery } from "./ddb";
import { purgeFighter } from "./fighters";
import { purge, wipePlayer } from "./friends";
import { dropReceipt } from "./receipt";
import { s3Delete } from "./s3";
import { purgeTwin } from "./twins";

/**
 * Erases an account: the player side first (friends, requests, open bouts, name, player code, wallet, deck rows, via
 * wipePlayer), then every card the person minted, everywhere it lives. Runs for Close account and for a user deleted
 * in the Clerk dashboard (the user.deleted webhook), so both leave nothing behind.
 *
 * A card goes when its deck row says this person minted it (minted:1, or own:1 on a claimed device mint). Cards
 * they only collected are someone else's and stay. Per card: the twin (S3, DynamoDB META, Upstash), the whole
 * CARD#<code> partition (style, receipt, recasts, tombstone), the fighter sheet, the receipt, the pack pool entry,
 * the friend-code pointer, its passport stamps and the other side's stamp of it, and the stored fights.
 * Devices this account claimed are erased too (their anonymous deck and markers).
 * Everything is idempotent, so a webhook retry or a second close just finds less to delete.
 */
export async function wipeAccount(uid: string): Promise<boolean> {
  if (!ddbConfigured()) return true;
  // Read what we need from the account's own rows before wipePlayer purges them.
  const [deck, claims] = await Promise.all([rows(`OWNER#${uid}`, "CARD#", ["code", "minted", "own"]), rows(`USER#${uid}`, "CLAIM#", ["dev"])]);
  if (!deck || !claims) return false;
  const mine = deck.filter((r) => Number(r.minted) === 1 || Number(r.own) === 1).map((r) => String(r.code ?? "")).filter(Boolean);
  const devs = claims.map((r) => String(r.dev ?? "")).filter(Boolean);
  if (!(await wipePlayer(uid))) return false;

  const results: boolean[] = [];
  // a few cards at a time: each card is a dozen small calls
  for (let i = 0; i < mine.length; i += 5) results.push(...(await Promise.all(mine.slice(i, i + 5).map(wipeCard))));
  for (const dev of devs) results.push(await wipeDevice(dev, uid));
  return !results.includes(false);
}

async function rows(PK: string, prefix: string, attrs: string[]) {
  const out: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const q = await ddbQuery(PK, prefix, 100, cursor, attrs);
    if (!q) return null;
    out.push(...q.items);
    if (!(cursor = q.cursor)) break;
  }
  return out;
}

async function wipeCard(code: string): Promise<boolean> {
  const stamps = await rows(`STAMPS#${code}`, "VS#", ["code"]);
  if (!stamps) return false;
  const others = stamps.map((s) => String(s.code ?? "")).filter(Boolean);
  const fights = others.flatMap((o) => {
    const [x, y] = [code, o].sort();
    return [`battles/v1/${x}_${y}_${ENGINE_V}.json`, `battles/v1/${x}_${y}_${ENGINE_V}_r.json`];
  });
  await Promise.allSettled([
    purgeTwin(code),
    purgeFighter(code),
    dropReceipt(code),
    upstashConfigured() ? upstash([["DEL", `tm:drift:${code}`]]) : null,
    ...fights.map((k) => s3Delete(k)),
  ]);
  const del = await Promise.all([
    purge(`CARD#${code}`),
    purge(`STAMPS#${code}`),
    ddbDelete(`CARDPC#${code}`, "META").then((r) => r !== "error"),
    ...["common", "rare", "holo", "secret"].map((t) => ddbDelete(`POOL#${t}`, `CARD#${code}`).then((r) => r !== "error")),
    // the other card's passport keeps its tally, but not this card's name
    ...others.map((o) => ddbDelete(`STAMPS#${o}`, `VS#${code}`).then((r) => r !== "error")),
  ]);
  return !del.includes(false);
}

/** A device this account claimed: its anonymous deck, guest reading and claim marker. Only if the claim is still ours. */
async function wipeDevice(dev: string, uid: string): Promise<boolean> {
  const claim = await ddbGet(`DEVICE#${dev}`, "CLAIM");
  if (claim && claim.userId !== uid) return true;
  const out = await Promise.all([purge(`OWNER#${dev}`), purge(`DEVICE#${dev}`)]);
  return !out.includes(false);
}
