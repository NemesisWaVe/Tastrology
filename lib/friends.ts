import { randomBytes, randomInt } from "node:crypto";
import { battle, type BattleResult } from "./battle";
import type { CardData } from "./card";
import { ddbDelete, ddbGet, ddbGetStatus, ddbPutIfAbsent, ddbQuery, ddbTransact, ddbUpdate, type Flat, type TxOp } from "./ddb";
import { fromSheet, getFighterStatus } from "./fighters";
import { recordBattle } from "./stamps";
import { blocked } from "./guard";
import { burnedAt } from "./twins";
import type { Audience } from "./types";
export { levelOf } from "./friendLevels";

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
/** A challenge is live: unanswered for five minutes, it lapses (both sides see the clock) and any stake goes back. */
export const BOUT_TTL_MS = 5 * 60 * 1000;
const DAY_MS = 86_400_000;
export const BOUT_SK = /^BOUT#[0-9a-z]{6,12}#[0-9A-Za-z_-]{8}$/;

const U = (uid: string) => `USER#${uid}`;
const CCF = "ConditionalCheckFailed";
const str = (v: unknown) => (typeof v === "string" ? v : "");

export interface Player {
  pc: string;
  /** Unique @username (lowercase a-z, 0-9, _): picked at Clerk sign-up and mirrored here, where friends look it up. */
  user?: string;
  /** Times the username was changed after the first pick: the first change is free, then each costs RENAME_DUST. */
  renames?: number;
  /** Profile, shown to you only: steers whose items your readings can include (lib/qloo.ts fitsAudience). */
  gender?: Audience;
  /** Your bio as typed, and the short line friends see when they hold your star. */
  bio?: string;
  tag?: string;
  /** Account photo (from Clerk) and how many cards the deck holds, both shown to friends. */
  img?: string;
  cards?: number;
  name: string;
  card: string;
  rarity: string;
}
export interface Friend extends Player {
  at: number;
  /** When they last had the site open (ms), from their own heartbeat; online = within ONLINE_MS. */
  seen?: number;
  /** Days you've fought each other (friendship level). */
  days?: number;
}
export interface Bout {
  id: string;
  role: "out" | "in";
  pc: string;
  name: string;
  user?: string;
  stake: number;
  status: "open" | "done" | "declined" | "cancelled" | "expired";
  at: number;
  /** When an open challenge lapses (ms). */
  ends: number;
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
  it && str(it.pc)
    ? {
        pc: str(it.pc),
        ...(str(it.user) ? { user: str(it.user) } : {}),
        ...(Number(it.renames) ? { renames: Number(it.renames) } : {}),
        // "" (rather not say) is kept, so an answered profile isn't asked again.
        ...(typeof it.gender === "string" && GENDERS.includes(it.gender as Audience) ? { gender: it.gender as Audience } : {}),
        ...(str(it.bio) ? { bio: str(it.bio) } : {}),
        ...(str(it.tag) ? { tag: str(it.tag) } : {}),
        ...(str(it.img) ? { img: str(it.img) } : {}),
        ...(it.cards !== undefined ? { cards: Number(it.cards) || 0 } : {}),
        name: str(it.name),
        card: str(it.card),
        rarity: str(it.rarity) || "common",
      }
    : null;

/** Your player profile, made on first use. Picks your rarest card as your fighter until you choose one. */
export async function ensurePlayer(uid: string): Promise<Player | null> {
  const [row, owned] = await Promise.all([ddbGet(U(uid), "PLAYER"), ownCards(uid)]);
  const have = toPlayer(row);
  const cards = owned ?? [];
  // The fighter must still be in the deck: a burned or retired card leaves a stale face (and a bout that can't
  // find its sheet). When the deck couldn't be read, trust what's stored rather than wiping it.
  if (have?.card && (owned === null || cards.some((c) => c.code === have.card))) return have;
  const best = [...cards].sort((x, y) => y.score - x.score)[0];
  const face = best ? { name: best.name, card: best.code, rarity: best.rarity } : { name: "", card: "", rarity: "common" };
  if (have) {
    if (best || have.card) await ddbUpdate(U(uid), "PLAYER", "SET #n = :n, card = :c, rarity = :r", { names: { "#n": "name" }, values: { ":n": face.name, ":c": face.card, ":r": face.rarity }, condition: "attribute_exists(pc)" });
    return { ...have, ...face };
  }
  for (let i = 0; i < 5; i++) {
    const pc = newCode();
    const claim = await ddbPutIfAbsent({ PK: `PLAYER#${pc}`, SK: "META", uid, at: Date.now() });
    if (claim === "error") return (console.warn(JSON.stringify({ evt: "player_fail", step: "claim" })), null);
    if (claim === "exists") continue;
    const put = await ddbPutIfAbsent({ PK: U(uid), SK: "PLAYER", pc, ...face, at: Date.now() });
    if (put === "error") return (console.warn(JSON.stringify({ evt: "player_fail", step: "put" })), null);
    if (put === "created") return { pc, ...face };
    // Lost a race with a parallel first visit: theirs stands, this code stays an orphan nobody can reach.
    const raced = toPlayer(await ddbGet(U(uid), "PLAYER"));
    if (raced) return raced;
    // A row with no code: a partial write (a rename or profile field) landed before the player was ever created,
    // and every visit since has failed. Give it this code, keeping whatever fields it already has.
    const healed = await ddbUpdate(U(uid), "PLAYER", "SET pc = :pc, #n = if_not_exists(#n, :n), card = if_not_exists(card, :c), rarity = if_not_exists(rarity, :r), #a = if_not_exists(#a, :a)", {
      names: { "#n": "name", "#a": "at" },
      values: { ":pc": pc, ":n": face.name, ":c": face.card, ":r": face.rarity, ":a": Date.now() },
      condition: "attribute_not_exists(pc)",
    });
    if (healed === "error") return (console.warn(JSON.stringify({ evt: "player_fail", step: "heal" })), null);
    console.warn(JSON.stringify({ evt: "player_heal", result: healed }));
    const after = await ddbGet(U(uid), "PLAYER");
    if (!toPlayer(after)) console.warn(JSON.stringify({ evt: "player_fail", step: "reread", keys: after ? Object.keys(after) : null }));
    return toPlayer(after);
  }
  console.warn(JSON.stringify({ evt: "player_fail", step: "codes" }));
  return null;
}

/**
 * Card → owner's player code (CARDPC#<code>), so a scanned or shared card leads to whoever minted it. Written
 * write-once from the owner's side whenever their friends data loads (at most every 10 minutes per instance).
 */
const indexedAt = new Map<string, number>();
export async function indexCards(uid: string, pc: string): Promise<void> {
  if ((indexedAt.get(uid) ?? 0) > Date.now()) return;
  indexedAt.set(uid, Date.now() + 10 * 60 * 1000);
  const [cards, held] = await Promise.all([ownCards(uid), ddbQuery(`OWNER#${uid}`, "CARD#", 200, undefined, ["code"])]);
  await Promise.allSettled([
    ...(cards ?? []).map((c) => ddbPutIfAbsent({ PK: `CARDPC#${c.code}`, SK: "META", pc, at: Date.now() })),
    // The deck size friends see, refreshed on the same beat.
    held ? ddbUpdate(U(uid), "PLAYER", "SET cards = :n", { values: { ":n": held.items.length }, condition: "attribute_exists(pc)" }) : null,
  ]);
}

/** Keeps the account photo friends see in step with Clerk (written only when it changed). */
export async function stampImage(uid: string, me: Player, img: string): Promise<void> {
  if (img === (me.img ?? "")) return;
  await ddbUpdate(U(uid), "PLAYER", "SET img = :i", { values: { ":i": img }, condition: "attribute_exists(pc)" });
}

/** Whoever minted a card, as a public player (username, code and fighter), or null. */
export async function playerForCard(code: string): Promise<(Player & { uid: string }) | null> {
  const pc = str((await ddbGet(`CARDPC#${code}`, "META"))?.pc);
  return pc ? lookupPlayer(pc) : null;
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
  // Presence and bio: one small read per friend, only when the list loads (not on every ping). Never their gender.
  const live = await Promise.all(page.items.map((it) => (str(it.uid) ? ddbGet(U(str(it.uid)), "PLAYER").catch(() => null) : null)));
  // The fighter on a friend row is a snapshot from when you met, and minting never touches it. Use their live
  // fighter, and for anyone still showing none, pick one from their deck now (a first mint lands on the next load).
  const face = await Promise.all(
    page.items.map(async (it, i) => {
      const p = live[i];
      if (str(p?.card)) return { name: str(p?.name), card: str(p?.card), rarity: str(p?.rarity) || "common" };
      if (!str(it.uid)) return null;
      const q = await ensurePlayer(str(it.uid)).catch(() => null);
      return q?.card ? { name: q.name, card: q.card, rarity: q.rarity } : null;
    }),
  );
  return page.items
    .map((it, i) => {
      const p = live[i];
      return {
        ...(toPlayer(it) as Player),
        ...(face[i] ?? {}),
        at: Number(it.at) || 0,
        days: Number(it.days) || 0,
        seen: Number(p?.seen) || undefined,
        ...(str(p?.bio) ? { bio: str(p?.bio) } : {}),
        ...(str(p?.tag) ? { tag: str(p?.tag) } : {}),
        ...(str(p?.img) ? { img: str(p?.img) } : {}),
        ...(p?.cards !== undefined ? { cards: Number(p?.cards) || 0 } : {}),
      };
    })
    .filter((f) => f.pc)
    .sort((x, y) => (y.days ?? 0) - (x.days ?? 0) || y.at - x.at);
}

/** One friendship day per pair per UTC day, on both rows. AND binds tighter than OR, so the row must exist either way. */
async function bumpFriendship(uid: string, pc: string, now = Date.now()) {
  const d = Math.floor(now / DAY_MS);
  await ddbUpdate(U(uid), `FRIEND#${pc}`, "SET lastDay = :d ADD days :one", {
    condition: "attribute_exists(pc) AND attribute_not_exists(lastDay) OR attribute_exists(pc) AND lastDay <= :y",
    values: { ":d": d, ":y": d - 1, ":one": 1 },
  });
}

/**
 * A per-player change counter: every write that lands on someone else's lists ticks theirs. An open friends page
 * polls only this (one small read) and reloads the full lists when it moves, so nobody has to refresh.
 */
async function touch(...uids: string[]) {
  await Promise.allSettled(uids.filter(Boolean).map((u) => ddbUpdate(U(u), "INBOX", "ADD n :one", { values: { ":one": 1 } })));
}

/* ------------------------------------------------------------ profile */

export const GENDERS: readonly Audience[] = ["woman", "man", "nonbinary", ""];

/** Saves the profile fields given (gender, bio and its tagline); the rest stay as they are. */
export async function setProfile(uid: string, p: { gender?: Audience; bio?: string; tag?: string }): Promise<boolean> {
  const sets: string[] = [];
  const values: Record<string, string> = {};
  if (p.gender !== undefined && GENDERS.includes(p.gender)) {
    sets.push("gender = :g");
    values[":g"] = p.gender;
  }
  if (p.bio !== undefined) {
    sets.push("bio = :b", "tag = :t");
    values[":b"] = p.bio;
    values[":t"] = p.tag ?? "";
  }
  if (!sets.length) return true;
  return (await ddbUpdate(U(uid), "PLAYER", `SET ${sets.join(", ")}`, { values, condition: "attribute_exists(pc)" })) === "updated";
}

/** The audience a reading is made for (lib/qloo.ts): "" when unknown, which keeps out women-only items. */
export async function audienceOf(uid: string): Promise<Audience> {
  const g = str((await ddbGet(U(uid), "PLAYER").catch(() => null))?.gender);
  return GENDERS.includes(g as Audience) ? (g as Audience) : "";
}

/** Presence heartbeat: stamps PLAYER.seen at most once a minute per account per instance (one write). */
export const ONLINE_MS = 2.5 * 60 * 1000;
const beatAt = new Map<string, number>();
export async function markSeen(uid: string): Promise<void> {
  const now = Date.now();
  if ((beatAt.get(uid) ?? 0) > now - 60_000) return;
  beatAt.set(uid, now);
  await ddbUpdate(U(uid), "PLAYER", "SET seen = :t", { values: { ":t": now }, condition: "attribute_exists(pc)" });
}

/** What needs you, for the site-wide alert: open challenges sent to you and friend requests. */
export async function alerts(uid: string): Promise<{ bouts: { id: string; who: string; stake: number; ends: number }[]; requests: number } | null> {
  const [b, r] = await Promise.all([ddbQuery(U(uid), "BOUT#", 15, undefined, undefined, true), ddbQuery(U(uid), "REQ#", 50, undefined, ["pc"])]);
  if (!b || !r) return null;
  // The bar checks on every page, so a lapsed bet you put up comes back here too, not only on the friends page.
  const due = b.items.filter((it) => it.role === "out" && (Number(it.stake) || 0) > 0 && lapsed(it));
  if (due.length) await Promise.allSettled(due.map((it) => closeBout(uid, str(it.SK), "expired")));
  const open = b.items.map(toBout).filter((x) => x.role === "in" && x.status === "open");
  return { bouts: open.map((x) => ({ id: x.id, who: x.user ? `@${x.user}` : x.name || x.pc, stake: x.stake, ends: x.ends })), requests: r.items.length };
}

export async function inboxCount(uid: string): Promise<number | null> {
  const r = await ddbGetStatus(U(uid), "INBOX", 1500);
  return r.status === "found" ? Number(r.value.n) || 0 : r.status === "missing" ? 0 : null;
}

const edge = (p: Player & { uid: string }, at: number) => ({ uid: p.uid, pc: p.pc, ...(p.user ? { user: p.user } : {}), name: p.name, card: p.card, rarity: p.rarity, at });

/* ------------------------------------------------------------ usernames */

export const USERNAME = /^[a-z0-9_]{3,20}$/;
const RESERVED = new Set(["admin", "tastrology", "support", "help", "official", "mod", "moderator", "staff", "qloo", "root", "system"]);
export const normUser = (raw: string) => raw.trim().replace(/^@/, "").toLowerCase();

export const FREE_RENAMES = 1;
export const RENAME_DUST = 50;
/** What changing your username costs now: the first pick and the first change are free. */
export const renameFee = (me: Player) => (me.user && (me.renames ?? 0) >= FREE_RENAMES ? RENAME_DUST : 0);

/** Whether a username can be yours: well formed, not reserved, and not held by another account. */
export async function nameFree(uid: string, raw: string): Promise<"ok" | "bad" | "taken" | "error"> {
  const u = normUser(raw);
  if (!USERNAME.test(u) || RESERVED.has(u) || blocked(u.replace(/_/g, " "))) return "bad";
  const st = await ddbGetStatus(`NAME#${u}`, "META");
  if (st.status === "error") return "error";
  const owner = st.status === "found" ? str(st.value.uid) : "";
  return owner && owner !== uid ? "taken" : "ok";
}

/**
 * Counts a change and takes its fee in one transaction (the fee is 0 for the free change). With `had` (the count the
 * fee was priced from), a parallel rename that already moved the count fails this one as "raced".
 */
export async function chargeRename(uid: string, fee: number, had?: number): Promise<"ok" | "empty" | "raced" | "error"> {
  const now = Date.now();
  const count: TxOp =
    had === undefined
      ? { update: { PK: U(uid), SK: "PLAYER" }, set: "ADD renames :one", values: { ":one": 1 } }
      : { update: { PK: U(uid), SK: "PLAYER" }, set: "ADD renames :one", condition: had ? "renames = :had" : "attribute_not_exists(renames) OR renames = :had", values: { ":one": 1, ":had": had } };
  const ops: TxOp[] = fee
    ? [
        { update: { PK: U(uid), SK: "WALLET" }, set: "SET dust = dust - :f, v = v + :one", condition: "dust >= :f", values: { ":f": fee, ":one": 1 } },
        { put: { PK: U(uid), SK: `LEDGER#dust#rename#${now.toString(36)}`, delta: -fee, unit: "dust", reason: "rename", at: now }, condition: "attribute_not_exists(PK)" },
        count,
      ]
    : [count];
  const r = await ddbTransact(ops);
  if (!r) return "error";
  if (r.ok) return "ok";
  if (r.reasons[fee ? 2 : 0] === CCF) return "raced";
  return r.reasons[0] === CCF ? "empty" : "error";
}

/** Undoes a charged rename whose name change then failed: the count and any fee go back. */
export async function refundRename(uid: string, fee: number): Promise<boolean> {
  const now = Date.now();
  const ops: TxOp[] = [{ update: { PK: U(uid), SK: "PLAYER" }, set: "ADD renames :m", values: { ":m": -1 } }];
  if (fee)
    ops.push(
      { update: { PK: U(uid), SK: "WALLET" }, set: "SET v = v + :one ADD dust :f", condition: "attribute_exists(PK)", values: { ":f": fee, ":one": 1 } },
      { put: { PK: U(uid), SK: `LEDGER#dustback#rename#${now.toString(36)}`, delta: fee, unit: "dust", reason: "rename-undo", at: now }, condition: "attribute_not_exists(PK)" },
    );
  return Boolean((await ddbTransact(ops))?.ok);
}

/** The account behind an @username, for adding by name. */
export async function lookupUser(raw: string): Promise<(Player & { uid: string }) | null> {
  const u = normUser(raw);
  if (!USERNAME.test(u)) return null;
  const uid = str((await ddbGet(`NAME#${u}`, "META"))?.uid);
  if (!uid) return null;
  const p = toPlayer(await ddbGet(U(uid), "PLAYER"));
  return p ? { ...p, uid } : null;
}

/**
 * Claims a unique @username (NAME#<u> is write-once per owner), frees the old one, and refreshes your snapshot on
 * every friend's list. Requests and old bouts keep the name they were sent with.
 */
export async function setUsername(uid: string, me: Player, raw: string): Promise<{ ok: true; me: Player } | { ok: false; why: "bad" | "taken" | "error" }> {
  const u = normUser(raw);
  if (!USERNAME.test(u) || RESERVED.has(u) || blocked(u.replace(/_/g, " "))) return { ok: false, why: "bad" };
  if (u === me.user) return { ok: true, me };
  const claim = await ddbPutIfAbsent({ PK: `NAME#${u}`, SK: "META", uid, at: Date.now() });
  if (claim === "error") return { ok: false, why: "error" };
  if (claim === "exists" && str((await ddbGet(`NAME#${u}`, "META"))?.uid) !== uid) return { ok: false, why: "taken" };
  if ((await ddbUpdate(U(uid), "PLAYER", "SET #u = :u", { names: { "#u": "user" }, values: { ":u": u } })) !== "updated") return { ok: false, why: "error" };
  const friends = await ddbQuery(U(uid), "FRIEND#", FRIENDS_MAX, undefined, ["uid"]);
  await Promise.allSettled([
    me.user ? ddbDelete(`NAME#${me.user}`, "META", { condition: "uid = :me", values: { ":me": uid } }) : null,
    ...(friends?.items ?? []).map((f) => ddbUpdate(U(str(f.uid)), `FRIEND#${me.pc}`, "SET #u = :u", { names: { "#u": "user" }, values: { ":u": u }, condition: "attribute_exists(PK)" })),
  ]);
  await touch(...(friends?.items ?? []).map((f) => str(f.uid)));
  return { ok: true, me: { ...me, user: u } };
}

export interface Requests {
  /** People asking to be your friend. */
  incoming: Friend[];
  /** Requests you sent that are still waiting. */
  sent: Friend[];
}

export async function listRequests(uid: string): Promise<Requests | null> {
  const [i, s] = await Promise.all([ddbQuery(U(uid), "REQ#", 50), ddbQuery(U(uid), "SENT#", 50)]);
  if (!i || !s) return null;
  const rows = (xs: Flat[]) => xs.map((it) => ({ ...(toPlayer(it) as Player), at: Number(it.at) || 0 })).filter((f) => f.pc).sort((x, y) => y.at - x.at);
  return { incoming: rows(i.items), sent: rows(s.items) };
}

/**
 * Asks to be friends: a REQ# row on their side, a SENT# row on yours. Friends only once they accept.
 * If they had already asked you, asking back is the handshake and makes you friends at once.
 */
export async function addFriend(uid: string, me: Player, pc: string): Promise<"added" | "sent" | "pending" | "exists" | "self" | "unknown" | "full" | "error"> {
  if (pc === me.pc) return "self";
  const them = await lookupPlayer(pc);
  if (!them) return "unknown";
  if (them.uid === uid) return "self";
  const [already, asked] = await Promise.all([ddbGet(U(uid), `FRIEND#${pc}`), ddbGet(U(uid), `REQ#${pc}`)]);
  if (already) return "exists";
  if (asked) return acceptFriend(uid, me, pc);
  const now = Date.now();
  const r = await ddbTransact([
    { put: { PK: U(them.uid), SK: `REQ#${me.pc}`, ...edge({ ...me, uid }, now) }, condition: "attribute_not_exists(PK)" },
    { put: { PK: U(uid), SK: `SENT#${pc}`, ...edge(them, now) }, condition: "attribute_not_exists(PK)" },
  ]);
  if (!r) return "error";
  if (r.ok) {
    await touch(them.uid);
    return "sent";
  }
  return r.reasons.includes(CCF) ? "pending" : "error";
}

/** Accepting a request writes both friend rows and clears the request pair, in one transaction. */
export async function acceptFriend(uid: string, me: Player, pc: string): Promise<"added" | "exists" | "unknown" | "full" | "error"> {
  const req = await ddbGet(U(uid), `REQ#${pc}`);
  if (!req) return (await ddbGet(U(uid), `FRIEND#${pc}`)) ? "exists" : "unknown";
  const them = await lookupPlayer(pc);
  if (!them) return "unknown";
  const mine = await ddbQuery(U(uid), "FRIEND#", FRIENDS_MAX, undefined, ["pc"]);
  if (!mine) return "error";
  if (mine.items.length >= FRIENDS_MAX) return "full";
  const now = Date.now();
  const r = await ddbTransact([
    { put: { PK: U(uid), SK: `FRIEND#${pc}`, ...edge(them, now) }, condition: "attribute_not_exists(PK)" },
    { put: { PK: U(them.uid), SK: `FRIEND#${me.pc}`, ...edge({ ...me, uid }, now) }, condition: "attribute_not_exists(PK)" },
    { delete: { PK: U(uid), SK: `REQ#${pc}` } },
    { delete: { PK: U(them.uid), SK: `SENT#${me.pc}` } },
  ]);
  if (!r) return "error";
  if (r.ok) {
    await touch(them.uid);
    return "added";
  }
  return r.reasons.includes(CCF) ? "exists" : "error";
}

/** Declines an incoming request or withdraws one you sent. */
export async function dropRequest(uid: string, me: Player, pc: string): Promise<boolean> {
  const [inc, out] = await Promise.all([ddbGet(U(uid), `REQ#${pc}`), ddbGet(U(uid), `SENT#${pc}`)]);
  const ops: Promise<string>[] = [];
  if (inc) ops.push(ddbDelete(U(uid), `REQ#${pc}`), ddbDelete(U(str(inc.uid)), `SENT#${me.pc}`));
  if (out) ops.push(ddbDelete(U(uid), `SENT#${pc}`), ddbDelete(U(str(out.uid)), `REQ#${me.pc}`));
  const ok = !(await Promise.all(ops)).includes("error");
  await touch(str(inc?.uid), str(out?.uid));
  return ok;
}

export async function removeFriend(uid: string, me: Player, pc: string): Promise<boolean> {
  const f = await ddbGet(U(uid), `FRIEND#${pc}`);
  if (!f) return true;
  const other = str(f.uid);
  const [a, b] = await Promise.all([ddbDelete(U(uid), `FRIEND#${pc}`), other ? ddbDelete(U(other), `FRIEND#${me.pc}`) : "deleted"]);
  await touch(other);
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

/* ------------------------------------------------------------ bouts: friendly (stake 0) or Stardust */

const lapsed = (it: Flat, now = Date.now()) => it.status === "open" && (Number(it.at) || 0) < now - BOUT_TTL_MS;

const toBout = (it: Flat): Bout => ({
  id: str(it.SK),
  role: it.role === "in" ? "in" : "out",
  pc: str(it.pc),
  name: str(it.name),
  ...(str(it.user) ? { user: str(it.user) } : {}),
  stake: Number(it.stake) || 0,
  status: lapsed(it) ? "expired" : ((str(it.status) || "open") as Bout["status"]),
  at: Number(it.at) || 0,
  ends: (Number(it.at) || 0) + BOUT_TTL_MS,
  ...(it.a ? { a: str(it.a), b: str(it.b), outcome: str(it.outcome) as Bout["outcome"] } : {}),
});

/**
 * The pair's live-challenge lock (PAIR#<uid>#<uid>, sorted): claimed in the same transaction that opens a bout, so
 * two taps landing together (two tabs, two phones) can't both open one. It frees itself once BOUT_TTL_MS passes, and
 * a settled bout frees it straight away, but only if it's still that bout's (a late tidy-up never frees a newer one).
 */
const pairKey = (x: string, y: string) => `PAIR#${[x, y].sort().join("#")}`;
const claimPair = (x: string, y: string, sk: string, now: number): TxOp => ({
  put: { PK: pairKey(x, y), SK: "LIVE", bout: sk, at: now },
  condition: "attribute_not_exists(PK) OR #a < :old",
  names: { "#a": "at" },
  values: { ":old": now - BOUT_TTL_MS },
});
async function freePair(x: string, y: string, sk: string) {
  await ddbUpdate(pairKey(x, y), "LIVE", "SET #a = :z", { names: { "#a": "at" }, values: { ":z": 0, ":sk": sk }, condition: "bout = :sk" }).catch(() => {});
}

/** How many recent bouts a list shows (and how far back the one-friendly-at-a-time check looks). */
const BOUTS_SEEN = 50;

export async function listBouts(uid: string): Promise<Bout[] | null> {
  const page = await ddbQuery(U(uid), "BOUT#", BOUTS_SEEN, undefined, undefined, true);
  if (!page) return null;
  // A lapsed bet you put up comes back to you on its own, the next time your list loads.
  const due = page.items.filter((it) => it.role === "out" && (Number(it.stake) || 0) > 0 && lapsed(it));
  if (due.length) await Promise.allSettled(due.map((it) => closeBout(uid, str(it.SK), "expired")));
  return page.items.map(toBout);
}

/**
 * Opens a bout: a challenge on both lists that the friend has to accept before anything is fought.
 * Stardust bouts also take the stake from you now (escrow) and count toward the daily cap.
 */
export async function openBout(uid: string, me: Player, pc: string, stake: number): Promise<"open" | "friends-only" | "stake" | "empty" | "daily" | "already" | "theirs" | "error"> {
  if (stake !== 0 && !(STAKES as readonly number[]).includes(stake)) return "stake";
  const f = await ddbGet(U(uid), `FRIEND#${pc}`);
  const other = str(f?.uid);
  if (!other) return "friends-only";
  const now = Date.now();
  // One live challenge per pair, friendly or bet, from either side: repeat taps would otherwise stack copies on
  // their list and push older challenges out of the recent window.
  const recent = await ddbQuery(U(uid), "BOUT#", BOUTS_SEEN, undefined, ["pc", "role", "status", "at"], true);
  const waiting = recent?.items.find((it) => str(it.pc) === pc && it.status === "open" && !lapsed(it, now));
  if (waiting) return waiting.role === "in" ? "theirs" : "already";
  const SK = `BOUT#${now.toString(36)}#${randomBytes(6).toString("base64url")}`;
  const day = new Date(now).toISOString().slice(0, 10);
  const base = { stake, status: "open", at: now };
  const rows: TxOp[] = [
    { put: { PK: U(uid), SK, role: "out", uid: other, pc, name: str(f?.name), user: str(f?.user), ...base } },
    { put: { PK: U(other), SK, role: "in", uid, pc: me.pc, name: me.name, user: me.user ?? "", ...base } },
    claimPair(uid, other, SK, now),
  ];
  const LOCK = rows.length - 1;
  if (!stake) {
    const r = await ddbTransact(rows);
    if (r?.ok) await touch(other);
    return !r ? "error" : r.ok ? "open" : r.reasons[LOCK] === CCF ? "already" : "error";
  }
  const r = await ddbTransact([
    { update: { PK: U(uid), SK: "WALLET" }, set: "SET dust = dust - :s, v = v + :one", condition: "dust >= :s", values: { ":s": stake, ":one": 1 } },
    { put: { PK: U(uid), SK: `LEDGER#dust#bout#${SK}`, delta: -stake, unit: "dust", reason: "bout", ref: SK, at: now }, condition: "attribute_not_exists(PK)" },
    { update: { PK: U(uid), SK: `BOUTDAY#${day}` }, set: "ADD n :one", condition: "attribute_not_exists(n) OR n <= :last", values: { ":one": 1, ":last": BOUTS_PER_DAY - 1 } },
    ...rows,
  ]);
  if (!r) return "error";
  if (r.ok) {
    await touch(other);
    return "open";
  }
  if (r.reasons[0] === CCF) return "empty";
  if (r.reasons[2] === CCF) return "daily";
  if (r.reasons[3 + LOCK] === CCF) return "already";
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

/** Each side's chosen fighter, for friendly bouts. */
async function fighterOf(uid: string): Promise<string | null> {
  const card = str((await ddbGet(U(uid), "PLAYER"))?.card);
  if (!card) return draw(uid);
  // the chosen fighter may have been burned since it was picked: fall back to a live card from the deck
  const [gone, f] = await Promise.all([burnedAt(card), getFighterStatus(card)]);
  if (!gone && f.sheet) return card;
  const p = await ensurePlayer(uid);
  return p?.card && p.card !== card ? p.card : draw(uid);
}

/**
 * The friend answers. Friendly: both chosen fighters meet. Stardust: the friend matches the stake, one card is drawn
 * from each deck, and the winner takes both stakes (a tie refunds).
 */
export async function acceptBout(uid: string, me: Player, sk: string): Promise<{ ok: true; result: BattleResult; a: string; b: string; outcome: Bout["outcome"] } | { ok: false; why: "gone" | "lapsed" | "empty" | "no-cards" | "error" }> {
  const mine = await ddbGet(U(uid), sk);
  if (!mine || mine.role !== "in" || mine.status !== "open") return { ok: false, why: "gone" };
  if (lapsed(mine)) return { ok: false, why: "lapsed" };
  const challenger = str(mine.uid);
  const stake = Number(mine.stake) || 0;
  const pick = stake ? draw : fighterOf;
  const [a, b] = await Promise.all([pick(challenger), pick(uid)]);
  if (!a || !b) return { ok: false, why: "no-cards" };
  const [fa, fb] = await Promise.all([getFighterStatus(a), getFighterStatus(b)]);
  if (!fa.sheet || !fb.sheet) return { ok: false, why: fa.status === "error" || fb.status === "error" ? "error" : "no-cards" };
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
  const ops: TxOp[] = [settle(challenger, side("a")), settle(uid, side("b"))];
  if (stake) ops.push({ update: { PK: U(uid), SK: "WALLET" }, set: "SET dust = dust + :d, v = v + :one", condition: "dust >= :s", values: { ":d": bDelta, ":s": stake, ":one": 1 } });
  if (bDelta) ops.push({ put: { PK: U(uid), SK: `LEDGER#dust#bout#${sk}`, delta: bDelta, unit: "dust", reason: "bout", ref: sk, at: now }, condition: "attribute_not_exists(PK)" });
  if (aGets) {
    ops.push({ update: { PK: U(challenger), SK: "WALLET" }, set: "SET v = v + :one ADD dust :d", condition: "attribute_exists(PK)", values: { ":d": aGets, ":one": 1 } });
    ops.push({ put: { PK: U(challenger), SK: `LEDGER#dustback#bout#${sk}`, delta: aGets, unit: "dust", reason: "bout", ref: sk, at: now }, condition: "attribute_not_exists(PK)" });
  }
  const r = await ddbTransact(ops);
  if (!r) return { ok: false, why: "error" };
  if (!r.ok) return { ok: false, why: r.reasons[0] === CCF || r.reasons[1] === CCF ? "gone" : r.reasons[2] === CCF ? "empty" : "error" };
  await Promise.allSettled([recordBattle(a, b, result), bumpFriendship(uid, str(mine.pc), now), bumpFriendship(challenger, me.pc, now), touch(challenger), freePair(uid, challenger, sk)]);
  return { ok: true, result, a, b, outcome: side("b") };
}

/** Declined by the friend or cancelled by the challenger: any stake goes back to the challenger. */
export async function closeBout(uid: string, sk: string, as?: "expired"): Promise<"closed" | "gone" | "error"> {
  const mine = await ddbGet(U(uid), sk);
  if (!mine || mine.status !== "open") return "gone";
  const other = str(mine.uid);
  const challenger = mine.role === "out" ? uid : other;
  const stake = Number(mine.stake) || 0;
  const status = as ?? (mine.role === "out" ? "cancelled" : "declined");
  const now = Date.now();
  const close = (who: string): TxOp => ({
    update: { PK: U(who), SK: sk },
    set: "SET #s = :x, settledAt = :now",
    condition: "#s = :open",
    names: { "#s": "status" },
    values: { ":x": status, ":open": "open", ":now": now },
  });
  const refund: TxOp[] = stake
    ? [
        { update: { PK: U(challenger), SK: "WALLET" }, set: "SET v = v + :one ADD dust :s", condition: "attribute_exists(PK)", values: { ":s": stake, ":one": 1 } },
        { put: { PK: U(challenger), SK: `LEDGER#dustback#bout#${sk}`, delta: stake, unit: "dust", reason: status, ref: sk, at: now }, condition: "attribute_not_exists(PK)" },
      ]
    : [];
  const r = await ddbTransact([close(uid), close(other), ...refund]);
  if (!r) return "error";
  if (r.ok) {
    await Promise.allSettled([touch(other), freePair(uid, other, sk)]);
    return "closed";
  }
  return r.reasons[0] === CCF || r.reasons[1] === CCF ? "gone" : "error";
}

/* ------------------------------------------------------------ leaving */

/**
 * Takes a player out of everyone's world before the account is deleted: open bouts are closed (stakes go back to
 * whoever put them up), requests and friendships are dropped on both sides, and the username and player code are freed.
 * Cards stay where they are: a shared card page carries no account details.
 */
export async function wipePlayer(uid: string): Promise<boolean> {
  const me = toPlayer(await ddbGet(U(uid), "PLAYER"));
  if (!me) return !(await Promise.all([purge(U(uid)), purge(`OWNER#${uid}`)])).includes(false);
  const [bouts, reqs, sent, friends] = await Promise.all([
    ddbQuery(U(uid), "BOUT#", 200, undefined, ["SK", "status"]),
    ddbQuery(U(uid), "REQ#", 50, undefined, ["pc"]),
    ddbQuery(U(uid), "SENT#", 50, undefined, ["pc"]),
    ddbQuery(U(uid), "FRIEND#", FRIENDS_MAX, undefined, ["pc"]),
  ]);
  if (!bouts || !reqs || !sent || !friends) return false;
  const res = await Promise.all([
    ...bouts.items.filter((b) => b.status === "open").map((b) => closeBout(uid, str(b.SK)).then((r) => r !== "error")),
    ...[...reqs.items, ...sent.items].map((r) => dropRequest(uid, me, str(r.pc))),
    ...friends.items.map((f) => removeFriend(uid, me, str(f.pc))),
  ]);
  const del = await Promise.all([
    me.user ? ddbDelete(`NAME#${me.user}`, "META", { condition: "uid = :me", values: { ":me": uid } }) : "deleted",
    ddbDelete(`PLAYER#${me.pc}`, "META"),
    ddbDelete(U(uid), "PLAYER"),
  ]);
  if (res.includes(false) || del.includes("error")) return false;
  // Then everything else the account held: deck rows, wallet, credits, ledger, settings.
  const purged = await Promise.all([purge(U(uid)), purge(`OWNER#${uid}`)]);
  return !purged.includes(false);
}

/** Deletes every row in a partition (sort keys all start with a capital letter or digit). Rare, so plain deletes. */
export async function purge(PK: string): Promise<boolean> {
  for (const lead of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") {
    for (let page = 0; page < 20; page++) {
      const q = await ddbQuery(PK, lead, 100, undefined, ["SK"]);
      if (!q) return false;
      if (!q.items.length) break;
      const out = await Promise.all(q.items.map((it) => ddbDelete(PK, str(it.SK))));
      if (out.includes("error")) return false;
      if (!q.cursor) break;
    }
  }
  return true;
}
