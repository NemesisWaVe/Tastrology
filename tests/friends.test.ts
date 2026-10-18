import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgent } from "@/lib/agent";
import { buildCard } from "@/lib/card";
import { putFighterMemory, toSheet } from "@/lib/fighters";
import { acceptBout, acceptFriend, addFriend, BOUT_TTL_MS, closeBout, dropRequest, ensurePlayer, inboxCount, listBouts, listFriends, listRequests, openBout, removeFriend, setFighter, type Player } from "@/lib/friends";
import { PERSONAS, personaRequest } from "@/lib/personas";
import { FakeDynamo } from "./fakeDynamo";

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

async function pair(): Promise<[Player, Player]> {
  own("ann", 0);
  own("bo", 1);
  const a = (await ensurePlayer("ann"))!;
  const b = (await ensurePlayer("bo"))!;
  expect(await addFriend("ann", a, b.pc)).toBe("sent");
  expect(await acceptFriend("bo", b, a.pc)).toBe("added");
  return [a, b];
}

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

  it("refreshes your fighter on friends' lists", async () => {
    const [a] = await pair();
    own("ann", 1);
    await setFighter("ann", a, cards[1]);
    expect((await listFriends("bo"))![0]).toMatchObject({ card: cards[1], name: names[1] });
    expect(await setFighter("ann", a, "9999-ZZZZ")).toBeNull();
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
    await openBout("ann", a, b.pc, 50);
    expect(await openBout("ann", a, b.pc, 10)).toBe("empty");
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

  it("lets challenges lapse after three days", async () => {
    const [a, b] = await pair();
    wallet("ann", 50);
    await openBout("ann", a, b.pc, 10);
    const [bout] = (await listBouts("bo"))!;
    const row = db.items.get(`USER#bo|${bout.id}`)!;
    row.at = N(Date.now() - BOUT_TTL_MS - 1);
    db.items.get(`USER#ann|${bout.id}`)!.at = N(Date.now() - BOUT_TTL_MS - 1);
    expect((await listBouts("bo"))![0].status).toBe("expired");
    expect(await acceptBout("bo", b, bout.id)).toMatchObject({ ok: false, why: "gone" });
    expect(await closeBout("ann", bout.id)).toBe("closed");
    expect(dust("ann")).toBe(50);
  });

  it("caps bouts per day", async () => {
    const [a, b] = await pair();
    wallet("ann", 500);
    for (let i = 0; i < 5; i++) expect(await openBout("ann", a, b.pc, 10)).toBe("open");
    expect(await openBout("ann", a, b.pc, 10)).toBe("daily");
    expect(dust("ann")).toBe(450);
  });
});
