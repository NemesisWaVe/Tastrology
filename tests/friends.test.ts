import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgent } from "@/lib/agent";
import { buildCard } from "@/lib/card";
import { putFighterMemory, toSheet } from "@/lib/fighters";
import { acceptBout, acceptFriend, addFriend, BET_ACCOUNT_AGE_MS, BET_FRIEND_AGE_MS, BOUTS_PER_DAY, BOUT_TTL_MS, winTake, closeBout, dropRequest, ensurePlayer, inboxCount, listBouts, listFriends, listRequests, lookupUser, openBout, setUsername, chargeRename, refundRename, nameFree, renameFee, RENAME_DUST, wipePlayer, lookupPlayer, indexCards, playerForCard, markSeen, alerts, removeFriend, setFighter, setProfile, audienceOf, type Player } from "@/lib/friends";
import { PERSONAS, personaRequest } from "@/lib/personas";
import { FakeDynamo } from "./fakeDynamo";
import { isoWeek, WEEKLY_DUST_CAP } from "@/lib/stardust";

let db: FakeDynamo;
const cards: string[] = [];
const names: string[] = [];

beforeAll(async () => {
  for (const p of PERSONAS.slice(0, 2)) {
    const r = await runAgent(personaRequest(p), () => {});
    const c = buildCard(r);
    const code = `100${cards.length}-ABCD`;
    putFighterMemory(code, toSheet(r));
    cards.push(code);
    names.push(c.archetype);
  }
}, 60_000);

beforeEach(() => {
  db = new FakeDynamo();
  vi.stubEnv("DDB_TABLE", "t");
  vi.stubEnv("DDB_ACCESS_KEY_ID", "AKIDEXAMPLE");
  vi.stubEnv("DDB_SECRET_ACCESS_KEY", "test-secret");
  vi.stubEnv("DDB_REGION", "us-east-1");
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const action = String((init.headers as Record<string, string>)["x-amz-target"]).split(".").pop()!;
    const { status, json } = db.handle(action, JSON.parse(String(init.body)));
    return new Response(JSON.stringify(json), { status });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const S = (s: string) => ({ S: s });
const N = (n: number) => ({ N: String(n) });
function own(uid: string, i: number) {
  db.items.set(`OWNER#${uid}|CARD#${cards[i]}`, { PK: S(`OWNER#${uid}`), SK: S(`CARD#${cards[i]}`), code: S(cards[i]), card: S(JSON.stringify({ archetype: names[i], rarity: "rare" })), rarityScore: N(50 + i), source: S("mint") });
}
const wallet = (uid: string, dust: number) => db.items.set(`USER#${uid}|WALLET`, { PK: S(`USER#${uid}`), SK: S("WALLET"), dust: N(dust), v: N(0) });
const dust = (uid: string) => Number(db.items.get(`USER#${uid}|WALLET`)?.dust?.N);

/** Two friends. `settled` ages the friendship and both accounts past the betting gate (BET_*_AGE_MS). */
async function pair(settled = true): Promise<[Player, Player]> {
  own("ann", 0);
  own("bo", 1);
  const a = (await ensurePlayer("ann"))!;
  const b = (await ensurePlayer("bo"))!;
  expect(await addFriend("ann", a, b.pc)).toBe("sent");
  expect(await acceptFriend("bo", b, a.pc)).toBe("added");
  if (settled) age(10 * 86_400_000);
  return [a, b];
}
/** Moves the friendship and both players' creation back by `ms`. */
function age(ms: number) {
  for (const [k, row] of db.items) if (/^USER#(ann|bo)\|(PLAYER|FRIEND#)/.test(k) && row.at) row.at = N(Number(row.at.N) - ms);
}
/** Forgets today's pair counter, as if the next bet were a different day (or pair). */
const nextDay = () => {
  for (const k of [...db.items.keys()]) if (k.includes("|BETDAY#")) db.items.delete(k);
};

describe("friends", () => {
  it("gives each account one stable code and its own card as fighter", async () => {
    own("ann", 0);
    const a = await ensurePlayer("ann");
    expect(a).toMatchObject({ card: cards[0], name: names[0] });
    expect(a!.pc).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    expect((await ensurePlayer("ann"))!.pc).toBe(a!.pc);
  });

  it("needs the other side to accept; asking back is the handshake", async () => {
    own("ann", 0);
    own("bo", 1);
    const a = (await ensurePlayer("ann"))!;
    const b = (await ensurePlayer("bo"))!;
    expect(await addFriend("ann", a, b.pc)).toBe("sent");
    expect(await addFriend("ann", a, b.pc)).toBe("pending");
    expect(await listFriends("ann")).toEqual([]);
    expect((await listRequests("bo"))!.incoming.map((r) => r.pc)).toEqual([a.pc]);
    expect((await listRequests("ann"))!.sent.map((r) => r.pc)).toEqual([b.pc]);
    expect(await dropRequest("bo", b, a.pc)).toBe(true);
    expect(await listRequests("ann")).toEqual({ incoming: [], sent: [] });
    await addFriend("ann", a, b.pc);
    expect(await addFriend("bo", b, a.pc)).toBe("added");
    expect((await listFriends("ann"))!.map((f) => f.pc)).toEqual([b.pc]);
    expect(await listRequests("bo")).toEqual({ incoming: [], sent: [] });
  });

  it("ticks the other side's change counter on every write that reaches them", async () => {
    const [a, b] = await pair();
    const before = (await inboxCount("bo"))!;
    expect(before).toBeGreaterThan(0);
    await openBout("ann", a, b.pc, 0);
    expect(await inboxCount("bo")).toBe(before + 1);
    const ann = (await inboxCount("ann"))!;
    await acceptBout("bo", b, (await listBouts("bo"))![0].id);
    expect(await inboxCount("ann")).toBe(ann + 1);
  });

  it("adds both sides on accept, no self-adds, and removes both sides", async () => {
    const [a, b] = await pair();
    expect(await addFriend("ann", a, b.pc)).toBe("exists");
    expect(await addFriend("ann", a, a.pc)).toBe("self");
    expect(await addFriend("ann", a, "ZZZZZZ")).toBe("unknown");
    expect((await listFriends("bo"))!.map((f) => f.pc)).toEqual([a.pc]);
    expect(await removeFriend("bo", b, a.pc)).toBe(true);
    expect(await listFriends("ann")).toEqual([]);
  });

  it("gives unique usernames, frees the old one, and shows the new one to friends", async () => {
    const [a, b] = await pair();
    expect(await setUsername("ann", a, "@Ann_K")).toMatchObject({ ok: true, me: { user: "ann_k" } });
    expect(await setUsername("bo", b, "ann_k")).toEqual({ ok: false, why: "taken" });
    expect(await setUsername("bo", b, "x")).toEqual({ ok: false, why: "bad" });
    expect(await setUsername("bo", b, "admin")).toEqual({ ok: false, why: "bad" });
    expect((await lookupUser("@ANN_K"))?.pc).toBe(a.pc);
    expect((await listFriends("bo"))![0].user).toBe("ann_k");
    await setUsername("ann", { ...a, user: "ann_k" }, "annie");
    expect(await lookupUser("ann_k")).toBeNull();
    expect((await setUsername("bo", b, "ann_k")).ok).toBe(true);
  });

  it("shows a friend's first card even when they minted it after you met", async () => {
    own("ann", 0);
    const a = (await ensurePlayer("ann"))!;
    const b = (await ensurePlayer("bo"))!; // no cards yet
    expect(b.card).toBe("");
    await addFriend("ann", a, b.pc);
    await acceptFriend("bo", b, a.pc);
    expect((await listFriends("ann"))![0].card).toBe("");
    own("bo", 1); // minted later, without ever opening Friends
    expect((await listFriends("ann"))![0]).toMatchObject({ card: cards[1], name: names[1] });
  });

  it("refreshes your fighter on friends' lists", async () => {
    const [a] = await pair();
    own("ann", 1);
    await setFighter("ann", a, cards[1]);
    expect((await listFriends("bo"))![0]).toMatchObject({ card: cards[1], name: names[1] });
    expect(await setFighter("ann", a, "9999-ZZZZ")).toBeNull();
  });
});

describe("accounts", () => {
  it("makes the first change free, then charges Stardust for each one", async () => {
    const [a] = await pair();
    wallet("ann", 60);
    expect(renameFee(a)).toBe(0);
    const named = { ...a, user: "ann" };
    expect(renameFee(named)).toBe(0);
    expect(await chargeRename("ann", 0)).toBe("ok");
    const once = (await ensurePlayer("ann"))!;
    expect(once.renames).toBe(1);
    expect(renameFee({ ...once, user: "ann" })).toBe(RENAME_DUST);
    expect(await chargeRename("ann", RENAME_DUST)).toBe("ok");
    expect(dust("ann")).toBe(10);
    expect(await chargeRename("ann", RENAME_DUST)).toBe("empty");
    expect((await ensurePlayer("ann"))!.renames).toBe(2);
  });

  it("stops two renames priced from the same count, and gives back a failed one", async () => {
    await pair();
    wallet("ann", 100);
    expect(await chargeRename("ann", 0, 0)).toBe("ok");
    expect(await chargeRename("ann", 0, 0)).toBe("raced");
    expect(await chargeRename("ann", RENAME_DUST, 1)).toBe("ok");
    expect(await chargeRename("ann", RENAME_DUST, 1)).toBe("raced");
    expect(dust("ann")).toBe(50);
    expect(await refundRename("ann", RENAME_DUST)).toBe(true);
    expect(dust("ann")).toBe(100);
    expect((await ensurePlayer("ann"))!.renames).toBe(1);
  });

  it("shows friends when you were last around, and what challenges wait for you", async () => {
    const [a, b] = await pair();
    expect((await listFriends("bo"))![0].seen).toBeUndefined();
    await markSeen("ann");
    expect((await listFriends("bo"))![0].seen).toBeGreaterThan(Date.now() - 5000);
    await openBout("ann", a, b.pc, 0);
    const al = (await alerts("bo"))!;
    expect(al.bouts).toHaveLength(1);
    expect(al.bouts[0].stake).toBe(0);
    expect((await alerts("ann"))!.bouts).toHaveLength(0);
  });

  it("leads a scanned card back to the player who minted it", async () => {
    const [a] = await pair();
    expect(await playerForCard(cards[0])).toBeNull();
    await indexCards("ann", a.pc);
    expect((await playerForCard(cards[0]))?.pc).toBe(a.pc);
    expect(await playerForCard("9999-ZZZZ")).toBeNull();
  });

  it("checks a name is free before Clerk is asked", async () => {
    const [a] = await pair();
    await setUsername("ann", a, "ann_k");
    expect(await nameFree("bo", "@ANN_K")).toBe("taken");
    expect(await nameFree("ann", "ann_k")).toBe("ok");
    expect(await nameFree("bo", "admin")).toBe("bad");
    expect(await nameFree("bo", "bo_b")).toBe("ok");
  });

  it("clears a closing account out of friends, requests and open fights, and frees its name and code", async () => {
    const [a, b] = await pair();
    own("cy", 0);
    const c = (await ensurePlayer("cy"))!;
    await addFriend("cy", c, a.pc);
    await setUsername("ann", a, "ann_k");
    wallet("bo", 50);
    await openBout("bo", b, a.pc, 25);
    expect(dust("bo")).toBe(25);
    expect(await wipePlayer("ann")).toBe(true);
    expect(dust("bo")).toBe(50);
    expect(await listFriends("bo")).toEqual([]);
    expect((await listRequests("cy"))!.sent).toEqual([]);
    expect(await lookupUser("ann_k")).toBeNull();
    expect(await lookupPlayer(a.pc)).toBeNull();
    expect((await listBouts("bo"))![0].status).toBe("declined");
  });

  it("leaves nothing of the account behind: deck, wallet and settings go too", async () => {
    await pair();
    wallet("ann", 5);
    expect(await wipePlayer("ann")).toBe(true);
    expect([...db.items.keys()].filter((k) => k.startsWith("USER#ann|") || k.startsWith("OWNER#ann|"))).toEqual([]);
  });

  it("records agreeing to the terms once, and keeps it off friends' lists", async () => {
    const [a, b] = await pair();
    expect(a.terms).toBeUndefined();
    expect(await setProfile("ann", { terms: 1000 })).toBe(true);
    expect(await setProfile("ann", { terms: 2000 })).toBe(true);
    expect(db.items.get("USER#ann|PLAYER")?.termsAt).toEqual(N(1000));
    expect((await ensurePlayer("ann"))!.terms).toBe(true);
    expect((await listFriends("bo"))![0]).not.toHaveProperty("terms");
    void b;
  });

  it("keeps gender private and shows friends the bio line", async () => {
    const [a] = await pair();
    expect(await setProfile("ann", { gender: "woman", bio: "My life my rules", tag: "My rules" })).toBe(true);
    expect(await audienceOf("ann")).toBe("woman");
    expect(await audienceOf("nobody")).toBe("");
    const seen = (await listFriends("bo"))!.find((f) => f.pc === a.pc)!;
    expect(seen.tag).toBe("My rules");
    expect(seen.gender).toBeUndefined();
    expect(await setProfile("bo", { gender: "" })).toBe(true);
    expect((await ensurePlayer("bo"))!.gender).toBe("");
  });
});

describe("stardust bouts", () => {
  it("escrows the stake, settles once, and moves dust to the winner", async () => {
    const [a, b] = await pair();
    wallet("ann", 100);
    wallet("bo", 100);
    expect(await openBout("ann", a, "NOPE00", 25)).toBe("friends-only");
    expect(await openBout("ann", a, b.pc, 7)).toBe("stake");
    expect(await openBout("ann", a, b.pc, 25)).toBe("open");
    expect(dust("ann")).toBe(75);
    const [bout] = (await listBouts("bo"))!;
    expect(bout).toMatchObject({ role: "in", pc: a.pc, stake: 25, status: "open" });
    expect(bout).not.toHaveProperty("a");
    const r = await acceptBout("bo", b, bout.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const want = { won: [75, 125], lost: [125, 75], tied: [100, 100] }[r.outcome!];
    expect([dust("ann"), dust("bo")]).toEqual(want);
    expect(await acceptBout("bo", b, bout.id)).toMatchObject({ ok: false, why: "gone" });
    expect((await listBouts("ann"))![0]).toMatchObject({ status: "done", a: cards[0], b: cards[1] });
  });

  it("refunds on decline, and the acceptor must hold the stake", async () => {
    const [a, b] = await pair();
    wallet("ann", 50);
    wallet("bo", 5);
    expect(await openBout("bo", b, a.pc, 10)).toBe("empty");
    await openBout("ann", a, b.pc, 50);
    expect(await openBout("ann", a, b.pc, 10)).toBe("already");
    const [bout] = (await listBouts("bo"))!;
    expect(await acceptBout("bo", b, bout.id)).toMatchObject({ ok: false, why: "empty" });
    expect(await closeBout("bo", bout.id)).toBe("closed");
    expect(dust("ann")).toBe(50);
    expect(await closeBout("ann", bout.id)).toBe("gone");
  });

  it("friendly fights need accepting, use each side's fighter, and raise friendship once a day", async () => {
    const [a, b] = await pair();
    expect(await openBout("ann", a, b.pc, 0)).toBe("open");
    const [bout] = (await listBouts("bo"))!;
    expect(bout).toMatchObject({ stake: 0, status: "open" });
    const r = await acceptBout("bo", b, bout.id);
    expect(r).toMatchObject({ ok: true, a: cards[0], b: cards[1] });
    await openBout("ann", a, b.pc, 0);
    await acceptBout("bo", b, (await listBouts("bo"))![0].id);
    expect((await listFriends("ann"))![0].days).toBe(1);
    expect((await listFriends("bo"))![0].days).toBe(1);
  });

  it("keeps one live challenge per pair, friendly or bet, from either side", async () => {
    const [a, b] = await pair();
    expect(await openBout("ann", a, b.pc, 0)).toBe("open");
    expect(await openBout("ann", a, b.pc, 0)).toBe("already");
    expect(await openBout("bo", b, a.pc, 0)).toBe("theirs");
    expect((await listBouts("bo"))!.filter((x) => x.status === "open")).toHaveLength(1);
    // once it's settled (or declined), a new one can go out
    const open = (await listBouts("bo"))!.find((x) => x.status === "open")!;
    await closeBout("bo", open.id);
    expect(await openBout("bo", b, a.pc, 0)).toBe("open");
    wallet("ann", 50);
    expect(await openBout("ann", a, b.pc, 10)).toBe("theirs");
  });

  it("lets challenges lapse after five minutes and hands a lapsed bet back on its own", async () => {
    const [a, b] = await pair();
    wallet("ann", 50);
    await openBout("ann", a, b.pc, 10);
    const [bout] = (await listBouts("bo"))!;
    const row = db.items.get(`USER#bo|${bout.id}`)!;
    row.at = N(Date.now() - BOUT_TTL_MS - 1);
    db.items.get(`USER#ann|${bout.id}`)!.at = N(Date.now() - BOUT_TTL_MS - 1);
    expect((await listBouts("bo"))![0].status).toBe("expired");
    expect((await listBouts("bo"))![0].ends).toBe(Number(row.at.N) + BOUT_TTL_MS);
    expect(await acceptBout("bo", b, bout.id)).toMatchObject({ ok: false, why: "lapsed" });
    expect(dust("ann")).toBe(40);
    expect((await listBouts("ann"))![0].status).toBe("expired");
    expect(dust("ann")).toBe(50);
    expect(await closeBout("ann", bout.id)).toBe("gone");
    expect(await openBout("ann", a, b.pc, 0)).toBe("open"); // a lapsed one doesn't block the next
  });

  it("lets only one of two challenges sent at the same moment through", async () => {
    const [a, b] = await pair();
    const got = await Promise.all([openBout("ann", a, b.pc, 0), openBout("ann", a, b.pc, 0), openBout("bo", b, a.pc, 0)]);
    expect(got.filter((x) => x === "open")).toHaveLength(1);
    expect((await listBouts("ann"))!.filter((x) => x.status === "open")).toHaveLength(1);
  });

  it("caps bouts per day", async () => {
    const [a, b] = await pair();
    wallet("ann", 500);
    for (let i = 0; i < 5; i++) {
      expect(await openBout("ann", a, b.pc, 10)).toBe("open");
      // one live challenge per pair: cancel it (stake back) before the next
      await closeBout("ann", (await listBouts("ann"))!.find((x) => x.status === "open")!.id);
      nextDay();
    }
    expect(await openBout("ann", a, b.pc, 10)).toBe("daily");
    expect(dust("ann")).toBe(500);
  });

  it("bets wait for a day-old friendship and accounts a few days old; friendly fights don't", async () => {
    const [a, b] = await pair(false);
    wallet("ann", 100);
    expect(await openBout("ann", a, b.pc, 10)).toBe("new-friend");
    age(BET_FRIEND_AGE_MS + 1000);
    expect(await openBout("ann", a, b.pc, 10)).toBe("new-account");
    age(BET_ACCOUNT_AGE_MS);
    expect(await openBout("ann", a, b.pc, 10)).toBe("open");
    expect(dust("ann")).toBe(90);
  });

  it("one Stardust bout per pair a day; a cancelled or declined bet gives it back", async () => {
    const [a, b] = await pair();
    wallet("ann", 100);
    wallet("bo", 100);
    expect(await openBout("ann", a, b.pc, 10)).toBe("open");
    await closeBout("ann", (await listBouts("ann"))!.find((x) => x.status === "open")!.id);
    expect(dust("ann")).toBe(100);
    // cancelled to switch opponent or by mistake: the pair can still bet today
    expect(await openBout("ann", a, b.pc, 10)).toBe("open");
    await closeBout("bo", (await listBouts("bo"))!.find((x) => x.status === "open")!.id);
    expect(await openBout("ann", a, b.pc, 25)).toBe("open");
    const bout = (await listBouts("bo"))!.find((x) => x.status === "open")!;
    expect((await acceptBout("bo", b, bout.id)).ok).toBe(true);
    // one fought: that's the pair's bet for today, from either side; friendly fights stay open
    expect(await openBout("ann", a, b.pc, 10)).toBe("pair-daily");
    expect(await openBout("bo", b, a.pc, 10)).toBe("pair-daily");
    expect(await openBout("ann", a, b.pc, 0)).toBe("open");
  });

  it("a win pays the other stake only up to the winner's weekly cap; the rest is burned", async () => {
    expect(winTake(50, 0)).toBe(50);
    expect(winTake(50, WEEKLY_DUST_CAP - 20)).toBe(20);
    expect(winTake(50, WEEKLY_DUST_CAP)).toBe(0);
    const [a, b] = await pair();
    wallet("ann", 100);
    wallet("bo", 100);
    // both already earned all but 10 this week
    const week = isoWeek(Date.now());
    for (const u of ["ann", "bo"]) db.items.set(`USER#${u}|DUSTWEEK#${week}`, { PK: S(`USER#${u}`), SK: S(`DUSTWEEK#${week}`), earned: N(WEEKLY_DUST_CAP - 10) });
    await openBout("ann", a, b.pc, 50);
    const [bout] = (await listBouts("bo"))!;
    const r = await acceptBout("bo", b, bout.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // winner: own stake back + 10; loser: -50; 40 leaves the economy
    const want = { won: [50, 110], lost: [110, 50], tied: [100, 100] }[r.outcome!];
    expect([dust("ann"), dust("bo")]).toEqual(want);
    if (r.outcome !== "tied") {
      const winner = r.outcome === "won" ? "bo" : "ann";
      expect(Number(db.items.get(`USER#${winner}|DUSTWEEK#${week}`)!.earned.N)).toBe(WEEKLY_DUST_CAP);
    }
  });

  it("accepting a bet counts toward your five a day", async () => {
    const [a, b] = await pair();
    wallet("ann", 100);
    wallet("bo", 100);
    const day = new Date().toISOString().slice(0, 10);
    db.items.set(`USER#bo|BOUTDAY#${day}`, { PK: S("USER#bo"), SK: S(`BOUTDAY#${day}`), n: N(BOUTS_PER_DAY) });
    await openBout("ann", a, b.pc, 10);
    const [bout] = (await listBouts("bo"))!;
    expect(await acceptBout("bo", b, bout.id)).toMatchObject({ ok: false, why: "daily" });
    expect(dust("bo")).toBe(100);
  });
});
