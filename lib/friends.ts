import { randomBytes, randomInt } from "node:crypto";
import { battle, type BattleResult } from "./battle";
import type { CardData } from "./card";
import { ddbDelete, ddbGet, ddbPutIfAbsent, ddbQuery, ddbTransact, ddbUpdate, type Flat, type TxOp } from "./ddb";
import { fromSheet, getFighterStatus } from "./fighters";
import { recordBattle } from "./stamps";
import { burnedAt } from "./twins";

/**
 * Friends and friend bouts. One hop only: no friends-of-friends, no feed, no search.
 *   PLAYER#<pc>  META               uid                          public player code → account (write-once)
 *   USER#<uid>   PLAYER             pc, name, card, rarity       your code and the card you fight with
 *   USER#<uid>   FRIEND#<pc>        uid, pc, name, card, rarity  one row per side, a snapshot of the friend's fighter
 *   USER#<uid>   BOUT#<t36>#<id>    a copy on each side: role, pc, name, stake, status, cards, outcome
 *   USER#<uid>   BOUTDAY#<date>     n                            Stardust bouts opened today (anti-farming cap)
 * The friends page is three reads (PLAYER, FRIEND#, BOUT#). Adding a friend is one transaction; a bout is one to open, one to settle.
 * Stardust bouts draw one random card from each deck when they settle, so neither side can preview the result on /vs.
 */

export const PLAYER_CODE = /^[0-9A-HJKMNP-TV-Z]{6}$/;
const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const FRIENDS_MAX = 200;
export const STAKES = [10, 25, 50] as const;
export const BOUTS_PER_DAY = 5;
export const BOUT_SK = /^BOUT#[0-9a-z]{6,12}#[0-9A-Za-z]{8}$/;

const U = (uid: string) => `USER#${uid}`;
const CCF = "ConditionalCheckFailed";
const str = (v: unknown) => (typeof v === "string" ? v : "");

export interface Player {
  pc: string;
  name: string;
  card: string;
  rarity: string;
}
export interface Friend extends Player {
  at: number;
}
export interface Bout {
  id: string;
  role: "out" | "in";
  pc: string;
  name: string;
  stake: number;
  status: "open" | "done" | "declined" | "cancelled";
  at: number;
  /** Settled bouts: the drawn cards (a = challenger) and how it went for you. */
  a?: string;
  b?: string;
  outcome?: "won" | "lost" | "tied";
}

function newCode(): string {
  const b = randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHA[b[i] & 31];
  return s;
}

type DeckCard = { code: string; name: string; rarity: string; score: number };

/** Your own cards (minted or claimed from this device; collected cards are other people's). */
async function ownCards(uid: string): Promise<DeckCard[] | null> {
  const page = await ddbQuery(`OWNER#${uid}`, "CARD#", 200, undefined, ["code", "card", "rarityScore", "source"]);
  if (!page) return null;
  const out: DeckCard[] = [];
  for (const it of page.items) {
    if (it.source === "collect") continue;
    let c: Partial<CardData> = {};
    try {
      c = JSON.parse(str(it.card)) as CardData;
    } catch {}
    out.push({ code: str(it.code), name: c.archetype ?? "Unnamed card", rarity: c.rarity ?? "common", score: Number(it.rarityScore) || 0 });
  }
  return out.filter((c) => c.code);
}

const toPlayer = (it: Flat | null): Player | null =>
  it && str(it.pc) ? { pc: str(it.pc), name: str(it.name), card: str(it.card), rarity: str(it.rarity) || "common" } : null;

/** Your player profile, made on first use. Picks your rarest card as your fighter until you choose one. */
export async function ensurePlayer(uid: string): Promise<Player | null> {
  const have = toPlayer(await ddbGet(U(uid), "PLAYER"));
  if (have?.card) return have;
  const cards = (await ownCards(uid)) ?? [];
  const best = [...cards].sort((x, y) => y.score - x.score)[0];
  const face = best ? { name: best.name, card: best.code, rarity: best.rarity } : { name: "", card: "", rarity: "common" };
  if (have) {
    if (best) await ddbUpdate(U(uid), "PLAYER", "SET #n = :n, card = :c, rarity = :r", { names: { "#n": "name" }, values: { ":n": face.name, ":c": face.card, ":r": face.rarity } });
    return { ...have, ...face };
  }
  for (let i = 0; i < 5; i++) {
    const pc = newCode();
    const claim = await ddbPutIfAbsent({ PK: `PLAYER#${pc}`, SK: "META", uid, at: Date.now() });
    if (claim === "error") return null;
    if (claim === "exists") continue;
    const put = await ddbPutIfAbsent({ PK: U(uid), SK: "PLAYER", pc, ...face, at: Date.now() });
    if (put === "error") return null;
    // Lost a race with a parallel first visit: theirs stands, this code stays an orphan nobody can reach.
    return put === "created" ? { pc, ...face } : toPlayer(await ddbGet(U(uid), "PLAYER"));
  }
  return null;
}

/** The public face of a player code (invite pages): name and fighter card, never the account. */
export async function lookupPlayer(pc: string): Promise<(Player & { uid: string }) | null> {
  if (!PLAYER_CODE.test(pc)) return null;
  const meta = await ddbGet(`PLAYER#${pc}`, "META");
  const uid = str(meta?.uid);
  if (!uid) return null;
  const p = toPlayer(await ddbGet(U(uid), "PLAYER"));
  return p ? { ...p, uid } : null;
}

export async function listFriends(uid: string): Promise<Friend[] | null> {
  const page = await ddbQuery(U(uid), "FRIEND#", FRIENDS_MAX);
  if (!page) return null;
  return page.items
    .map((it) => ({ ...(toPlayer(it) as Player), at: Number(it.at) || 0 }))
    .filter((f) => f.pc)
    .sort((x, y) => y.at - x.at);
}

const edge = (p: Player & { uid: string }, at: number) => ({ uid: p.uid, pc: p.pc, name: p.name, card: p.card, rarity: p.rarity, at });

/** Adds both sides at once. Having someone's code (they shared it) is the consent; either side can remove it. */
export async function addFriend(uid: string, me: Player, pc: string): Promise<"added" | "exists" | "self" | "unknown" | "full" | "error"> {
  if (pc === me.pc) return "self";
  const them = await lookupPlayer(pc);
  if (!them) return "unknown";
  if (them.uid === uid) return "self";
  const mine = await ddbQuery(U(uid), "FRIEND#", FRIENDS_MAX, undefined, ["pc"]);
  if (!mine) return "error";
  if (mine.items.length >= FRIENDS_MAX) return "full";
  const now = Date.now();
  const r = await ddbTransact([
    { put: { PK: U(uid), SK: `FRIEND#${pc}`, ...edge(them, now) }, condition: "attribute_not_exists(PK)" },
    { put: { PK: U(them.uid), SK: `FRIEND#${me.pc}`, ...edge({ ...me, uid }, now) }, condition: "attribute_not_exists(PK)" },
  ]);
  if (!r) return "error";
  if (r.ok) return "added";
  return r.reasons.includes(CCF) ? "exists" : "error";
}

export async function removeFriend(uid: string, me: Player, pc: string): Promise<boolean> {
  const f = await ddbGet(U(uid), `FRIEND#${pc}`);
  if (!f) return true;
  const other = str(f.uid);
  const [a, b] = await Promise.all([ddbDelete(U(uid), `FRIEND#${pc}`), other ? ddbDelete(U(other), `FRIEND#${me.pc}`) : "deleted"]);
  return a !== "error" && b !== "error";
}

/** Sets the card you fight with, then refreshes your snapshot on every friend's list (fan-out on write, at most FRIENDS_MAX). */
export async function setFighter(uid: string, me: Player, code: string): Promise<Player | null> {
  const cards = await ownCards(uid);
  const c = cards?.find((x) => x.code === code);
  if (!c) return null;
  const vals = { ":n": c.name, ":c": c.code, ":r": c.rarity };
  const set = "SET #n = :n, card = :c, rarity = :r";
  if ((await ddbUpdate(U(uid), "PLAYER", set, { names: { "#n": "name" }, values: vals })) !== "updated") return null;
  const friends = await ddbQuery(U(uid), "FRIEND#", FRIENDS_MAX, undefined, ["uid"]);
  await Promise.allSettled(
    (friends?.items ?? []).map((f) => ddbUpdate(U(str(f.uid)), `FRIEND#${me.pc}`, set, { names: { "#n": "name" }, values: vals, condition: "attribute_exists(PK)" })),
  );
  return { ...me, name: c.name, card: c.code, rarity: c.rarity };
}

/* ------------------------------------------------------------ Stardust bouts */

const toBout = (it: Flat): Bout => ({
  id: str(it.SK),
  role: it.role === "in" ? "in" : "out",
  pc: str(it.pc),
  name: str(it.name),
  stake: Number(it.stake) || 0,
  status: (str(it.status) || "open") as Bout["status"],
  at: Number(it.at) || 0,
  ...(it.a ? { a: str(it.a), b: str(it.b), outcome: str(it.outcome) as Bout["outcome"] } : {}),
});

export async function listBouts(uid: string): Promise<Bout[] | null> {
  const page = await ddbQuery(U(uid), "BOUT#", 30, undefined, undefined, true);
  return page ? page.items.map(toBout) : null;
}

/** Opens a bout: takes the stake from you now (escrow), and puts the challenge on both lists. */
export async function openBout(uid: string, me: Player, pc: string, stake: number): Promise<"open" | "friends-only" | "stake" | "empty" | "daily" | "error"> {
  if (!(STAKES as readonly number[]).includes(stake)) return "stake";
  const f = await ddbGet(U(uid), `FRIEND#${pc}`);
  const other = str(f?.uid);
  if (!other) return "friends-only";
  const now = Date.now();
  const SK = `BOUT#${now.toString(36)}#${randomBytes(6).toString("base64url")}`;
  const day = new Date(now).toISOString().slice(0, 10);
  const base = { stake, status: "open", at: now };
  const r = await ddbTransact([
    { update: { PK: U(uid), SK: "WALLET" }, set: "SET dust = dust - :s, v = v + :one", condition: "dust >= :s", values: { ":s": stake, ":one": 1 } },
    { put: { PK: U(uid), SK: `LEDGER#dust#bout#${SK}`, delta: -stake, unit: "dust", reason: "bout", ref: SK, at: now }, condition: "attribute_not_exists(PK)" },
    { update: { PK: U(uid), SK: `BOUTDAY#${day}` }, set: "ADD n :one", condition: "attribute_not_exists(n) OR n <= :last", values: { ":one": 1, ":last": BOUTS_PER_DAY - 1 } },
    { put: { PK: U(uid), SK, role: "out", uid: other, pc, name: str(f?.name), ...base } },
    { put: { PK: U(other), SK, role: "in", uid, pc: me.pc, name: me.name, ...base } },
  ]);
  if (!r) return "error";
  if (r.ok) return "open";
  if (r.reasons[0] === CCF) return "empty";
  if (r.reasons[2] === CCF) return "daily";
  return "error";
}

/** One card at random from a deck that can still fight (burned or sheet-less cards are skipped). */
async function draw(uid: string): Promise<string | null> {
  const cards = await ownCards(uid);
  if (!cards?.length) return null;
  const pool = [...cards];
  for (let i = 0; i < 4 && pool.length; i++) {
    const [c] = pool.splice(randomInt(pool.length), 1);
    const [gone, f] = await Promise.all([burnedAt(c.code), getFighterStatus(c.code)]);
    if (!gone && f.sheet) return c.code;
  }
  return null;
}

/** The friend answers: matches the stake, one card is drawn from each deck, and the winner takes both stakes (a tie refunds). */
export async function acceptBout(uid: string, sk: string): Promise<{ ok: true; result: BattleResult; a: string; b: string; outcome: Bout["outcome"] } | { ok: false; why: "gone" | "empty" | "no-cards" | "error" }> {
  const mine = await ddbGet(U(uid), sk);
  if (!mine || mine.role !== "in" || mine.status !== "open") return { ok: false, why: "gone" };
  const challenger = str(mine.uid);
  const stake = Number(mine.stake) || 0;
  const [a, b] = await Promise.all([draw(challenger), draw(uid)]);
  if (!a || !b) return { ok: false, why: "no-cards" };
  const [fa, fb] = await Promise.all([getFighterStatus(a), getFighterStatus(b)]);
  if (!fa.sheet || !fb.sheet) return { ok: false, why: "error" };
  const result = battle(fromSheet(fa.sheet), fromSheet(fb.sheet));
  const w = result.winner;
  const now = Date.now();
  const side = (s: "a" | "b") => (w === "tie" ? "tied" : w === s ? "won" : "lost");
  // Challenger already paid in. Acceptor must hold the stake either way, so a bout is never free to accept.
  const aGets = w === "a" ? 2 * stake : w === "tie" ? stake : 0;
  const bDelta = w === "a" ? -stake : w === "b" ? stake : 0;
  const settle = (who: string, outcome: string): TxOp => ({
    update: { PK: U(who), SK: sk },
    set: "SET #s = :done, #a = :a, #b = :b, #o = :o, settledAt = :now",
    condition: "#s = :open",
    names: { "#s": "status", "#a": "a", "#b": "b", "#o": "outcome" },
    values: { ":done": "done", ":open": "open", ":a": a, ":b": b, ":o": outcome, ":now": now },
  });
  const ops: TxOp[] = [
    settle(challenger, side("a")),
    settle(uid, side("b")),
    { update: { PK: U(uid), SK: "WALLET" }, set: "SET dust = dust + :d, v = v + :one", condition: "dust >= :s", values: { ":d": bDelta, ":s": stake, ":one": 1 } },
  ];
  if (bDelta) ops.push({ put: { PK: U(uid), SK: `LEDGER#dust#bout#${sk}`, delta: bDelta, unit: "dust", reason: "bout", ref: sk, at: now }, condition: "attribute_not_exists(PK)" });
  if (aGets) {
    ops.push({ update: { PK: U(challenger), SK: "WALLET" }, set: "SET v = v + :one ADD dust :d", condition: "attribute_exists(PK)", values: { ":d": aGets, ":one": 1 } });
    ops.push({ put: { PK: U(challenger), SK: `LEDGER#dustback#bout#${sk}`, delta: aGets, unit: "dust", reason: "bout", ref: sk, at: now }, condition: "attribute_not_exists(PK)" });
  }
  const r = await ddbTransact(ops);
  if (!r) return { ok: false, why: "error" };
  if (!r.ok) return { ok: false, why: r.reasons[0] === CCF || r.reasons[1] === CCF ? "gone" : r.reasons[2] === CCF ? "empty" : "error" };
  await recordBattle(a, b, result).catch(() => {});
  return { ok: true, result, a, b, outcome: side("b") };
}

/** Declined by the friend or cancelled by the challenger: the stake goes back to the challenger. */
export async function closeBout(uid: string, sk: string): Promise<"closed" | "gone" | "error"> {
  const mine = await ddbGet(U(uid), sk);
  if (!mine || mine.status !== "open") return "gone";
  const other = str(mine.uid);
  const challenger = mine.role === "out" ? uid : other;
  const stake = Number(mine.stake) || 0;
  const status = mine.role === "out" ? "cancelled" : "declined";
  const now = Date.now();
  const close = (who: string): TxOp => ({
    update: { PK: U(who), SK: sk },
    set: "SET #s = :x, settledAt = :now",
    condition: "#s = :open",
    names: { "#s": "status" },
    values: { ":x": status, ":open": "open", ":now": now },
  });
  const r = await ddbTransact([
    close(uid),
    close(other),
    { update: { PK: U(challenger), SK: "WALLET" }, set: "SET v = v + :one ADD dust :s", condition: "attribute_exists(PK)", values: { ":s": stake, ":one": 1 } },
    { put: { PK: U(challenger), SK: `LEDGER#dustback#bout#${sk}`, delta: stake, unit: "dust", reason: status, ref: sk, at: now }, condition: "attribute_not_exists(PK)" },
  ]);
  if (!r) return "error";
  if (r.ok) return "closed";
  return r.reasons[0] === CCF || r.reasons[1] === CCF ? "gone" : "error";
}
