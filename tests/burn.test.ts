import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { burnCard, tierOf } from "@/lib/burn";
import { cardCode, type CardData, type Rarity } from "@/lib/card";
import { ddbGet, ddbPutIfAbsent } from "@/lib/ddb";
import { heldRegret, spendCredit, spendRegret } from "@/lib/ledger";
import { DUST_RATES, dustFor, isoWeek, PAID_FLAT_DUST, READING_DUST, spendDust, WEEKLY_DUST_CAP } from "@/lib/stardust";
import { burnedAt, getTwinStatus, registerTwin } from "@/lib/twins";
import { GET as cardGET } from "@/app/api/card/route";
import { GET as battleGET } from "@/app/api/battle/route";
import { POST as burnPOST } from "@/app/api/deck/[code]/burn/route";
import { FakeDynamo, useFakeDynamo } from "./fakeDynamo";

let db: FakeDynamo;
let seq = 0;
const NOW = Date.UTC(2026, 9, 17, 12);

/** A fresh code per test: twins.ts memoizes tombstones per instance. */
const nextCode = () => `${String(1000 + ++seq).slice(-4)}-B${"CDEFGH"[seq % 6]}${"JKMNPQ"[seq % 6]}${"RSTVWX"[seq % 6]}`;

/** An own mint in `user`'s deck. `charged` spends a real credit first, as /api/agent does. */
async function mint(user: string, code: string, rarity: Rarity, opts: { charged?: boolean; funding?: "free" | "paid"; minted?: 0 | 1; addedAt?: number } = {}) {
  const runId = `run-${code}-${user}`.replace(/[^A-Za-z0-9_-]/g, "");
  if (opts.charged !== false) expect(await spendCredit(user, runId)).toBe("spent");
  await ddbPutIfAbsent({
    PK: `OWNER#${user}`,
    SK: `CARD#${code}`,
    code,
    card: JSON.stringify({ rarity }),
    rarityScore: 50,
    addedAt: opts.addedAt ?? 1,
    minted: opts.minted ?? 1,
    source: "mint",
    ...(opts.charged !== false ? { runId, funding: opts.funding ?? "free" } : {}),
  });
}
const dust = async (user: string) => Number((await ddbGet(`USER#${user}`, "WALLET"))?.dust) || 0;

beforeEach(() => {
  db = useFakeDynamo();
  vi.stubEnv("CREDITS_ON", "1");
  vi.stubEnv("FREE_MINTS", "10");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("rates", () => {
  it("every burn returns less than a reading costs (legal Rule 1)", () => {
    for (const v of Object.values(DUST_RATES)) expect(v).toBeLessThan(READING_DUST);
    expect(PAID_FLAT_DUST).toBeLessThan(READING_DUST);
  });
  it("paid mints burn flat, free mints by tier, dust-paid mints earn nothing", () => {
    expect(dustFor("secret", "paid")).toBe(PAID_FLAT_DUST);
    expect(dustFor("common", "paid")).toBe(PAID_FLAT_DUST);
    expect(dustFor("secret", "free")).toBe(60);
    expect(dustFor("rare", "free")).toBe(20);
    expect(dustFor("secret", "dust")).toBe(0);
    expect(dustFor("secret", undefined)).toBe(0);
  });
  it("ISO weeks", () => {
    expect(isoWeek(Date.UTC(2026, 9, 17))).toBe("2026-W42");
    expect(isoWeek(Date.UTC(2027, 0, 1))).toBe("2026-W53");
    expect(isoWeek(Date.UTC(2026, 0, 1))).toBe("2026-W01");
  });
  it("tier comes from the card JSON, else the score", () => {
    expect(tierOf({ card: JSON.stringify({ rarity: "holo" }) })).toBe("holo");
    expect(tierOf({ card: "nope", rarityScore: 80 })).toBe("secret");
  });
});

describe("burnCard", () => {
  it("is idempotent: a retry answers with the first burn and pays once", async () => {
    const code = nextCode();
    await mint("u1", code, "secret");
    const a = await burnCard("u1", code, NOW);
    expect(a).toMatchObject({ status: "burned", dust: 60, tier: "secret", capped: false, balance: 60 });
    const b = await burnCard("u1", code, NOW);
    expect(b).toMatchObject({ status: "dup", dust: 60, balance: 60 });
    expect(await dust("u1")).toBe(60);
    expect(await ddbGet("OWNER#u1", `CARD#${code}`)).toBeNull();
    expect(await ddbGet("USER#u1", `LEDGER#burn#${code}`)).toMatchObject({ delta: 60, unit: "dust" });
    expect(await ddbGet(`CARD#${code}`, "TOMBSTONE")).toMatchObject({ revived: 0 });
  });

  it("pays the flat rate for paid mints and the tier rate for free ones", async () => {
    const [c1, c2] = [nextCode(), nextCode()];
    await mint("u2", c1, "secret", { funding: "paid" });
    await mint("u2", c2, "rare", { funding: "free" });
    expect(await burnCard("u2", c1, NOW)).toMatchObject({ dust: PAID_FLAT_DUST });
    expect(await burnCard("u2", c2, NOW)).toMatchObject({ dust: 20 });
    expect(await dust("u2")).toBe(PAID_FLAT_DUST + 20);
  });

  it("caps dust at 150 a week, then burns for 0", async () => {
    const codes = [nextCode(), nextCode(), nextCode(), nextCode()];
    for (const c of codes) await mint("u3", c, "secret");
    const out = [];
    for (const c of codes) out.push(await burnCard("u3", c, NOW));
    expect(out.map((r) => ("dust" in r ? r.dust : -1))).toEqual([60, 60, 30, 0]);
    expect(out[2]).toMatchObject({ capped: true, reason: "cap" });
    expect(out[3]).toMatchObject({ status: "burned", reason: "cap" });
    expect(await dust("u3")).toBe(WEEKLY_DUST_CAP);
    expect(await ddbGet("USER#u3", `DUSTWEEK#${isoWeek(NOW)}`)).toMatchObject({ earned: WEEKLY_DUST_CAP });
    // Next week the cap resets.
    const c5 = nextCode();
    await mint("u3", c5, "common");
    expect(await burnCard("u3", c5, NOW + 7 * 86_400_000)).toMatchObject({ dust: 10 });
  });

  it("refuses anyone but the owner, and cards that weren't minted by them", async () => {
    const code = nextCode();
    await mint("owner", code, "holo");
    expect(await burnCard("stranger", code, NOW)).toEqual({ status: "not-owner" });
    const collected = nextCode();
    await mint("owner", collected, "holo", { charged: false, minted: 0 });
    expect(await burnCard("owner", collected, NOW)).toEqual({ status: "not-minted" });
    expect(await ddbGet("OWNER#owner", `CARD#${code}`)).not.toBeNull();
    expect(await ddbGet(`CARD#${code}`, "TOMBSTONE")).toBeNull();
  });

  it("pays nothing for a mint that spent no credit, or a code someone already burned", async () => {
    const code = nextCode();
    await mint("a", code, "secret", { charged: false });
    expect(await burnCard("a", code, NOW)).toMatchObject({ status: "burned", dust: 0, reason: "uncharged" });
    // Same loves, someone else's paid-for mint: the code was burned before, so it earns 0.
    await mint("b", code, "secret");
    expect(await burnCard("b", code, NOW)).toMatchObject({ status: "burned", dust: 0, reason: "burned-before" });
    // And the first burner re-minting and burning again earns 0 too.
    await mint("a", code, "secret");
    expect(await burnCard("a", code, NOW)).toMatchObject({ status: "burned", dust: 0, reason: "burned-before" });
    expect(await dust("b")).toBe(0);
  });

  it("with credits off, burning still works and earns nothing", async () => {
    vi.stubEnv("CREDITS_ON", "");
    const code = nextCode();
    await ddbPutIfAbsent({ PK: "OWNER#c", SK: `CARD#${code}`, code, card: JSON.stringify({ rarity: "secret" }), minted: 1, addedAt: 1 });
    expect(await burnCard("c", code, NOW)).toMatchObject({ status: "burned", dust: 0, reason: "off", balance: null });
    expect(await ddbGet(`CARD#${code}`, "TOMBSTONE")).not.toBeNull();
    expect(await ddbGet("USER#c", "WALLET")).toBeNull();
  });
});

describe("tombstones", () => {
  it("/api/card and /api/battle answer 410 for a burned code", async () => {
    const code = nextCode();
    await mint("t", code, "rare");
    await burnCard("t", code, NOW);
    const res = await cardGET(new Request(`http://x/api/card?code=${code}`));
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ burned: true });
    const b = await battleGET(new Request(`http://x/api/battle?a=${code}&b=0001-AAAA`));
    expect(b.status).toBe(410);
  });

  it("a fresh reading of the same loves revives the public link", async () => {
    const card = { serial: "0777", rarity: "holo", mrz: ["A", "B"], archetype: "Test", moves: [], rarityScore: 66 } as unknown as CardData;
    const code = cardCode(card);
    await mint("r", code, "holo");
    await burnCard("r", code, NOW);
    expect((await getTwinStatus(code)).status).toBe("burned");
    await registerTwin(card);
    expect(await burnedAt(code)).toBe(0);
    expect(await getTwinStatus(code)).toMatchObject({ status: "found" });
    expect(await ddbGet(`CARD#${code}`, "TOMBSTONE")).toMatchObject({ revived: 1 });
  });
});

describe("burn route", () => {
  it("doesn't exist without accounts", async () => {
    const res = await burnPOST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ code: "0001-AAAA" }) });
    expect(res.status).toBe(404);
  });
});

describe("spending dust", () => {
  it("a reading costs 100 dust, once per run id", async () => {
    const code = nextCode();
    await mint("s", code, "secret");
    await burnCard("s", code, NOW);
    expect(await spendDust("s", "run-dust-0001")).toBe("empty");
    db.handle("UpdateItem", { Key: { PK: { S: "USER#s" }, SK: { S: "WALLET" } }, UpdateExpression: "SET dust = :d", ExpressionAttributeValues: { ":d": { N: "130" } } });
    expect(await spendDust("s", "run-dust-0001")).toBe("spent");
    expect(await spendDust("s", "run-dust-0001")).toBe("dup");
    expect(await dust("s")).toBe(30);
  });
});

describe("regret burns", () => {
  const H = 3600 * 1000;

  it("first regret gives a card back, second gives 50 dust, third is refused", async () => {
    const u = "regretter";
    const [a, b, c] = [nextCode(), nextCode(), nextCode()];
    await mint(u, a, "common", { addedAt: NOW - H });
    const r1 = await burnCard(u, a, NOW, true);
    expect(r1).toMatchObject({ status: "regretted", kind: "credit", regretsLeft: 1 });
    expect(await heldRegret(u, NOW)).not.toBeNull();
    expect(await spendRegret(u, "run-regret-0001", NOW)).toBe("spent");
    expect(await heldRegret(u, NOW)).toBeNull();

    await mint(u, b, "rare", { addedAt: NOW - H });
    const before = await dust(u);
    expect(await burnCard(u, b, NOW, true)).toMatchObject({ status: "regretted", kind: "dust", dust: 50, regretsLeft: 0 });
    expect((await dust(u)) - before).toBe(50);

    await mint(u, c, "rare", { addedAt: NOW - H });
    expect(await burnCard(u, c, NOW, true)).toEqual({ status: "not-eligible", why: "used-up" });
  });

  it("only the newest card, only within 72 hours", async () => {
    const u = "regret-window";
    const [old, newer] = [nextCode(), nextCode()];
    await mint(u, old, "common", { addedAt: NOW - 2 * H });
    await mint(u, newer, "common", { addedAt: NOW - H });
    expect(await burnCard(u, old, NOW, true)).toEqual({ status: "not-eligible", why: "not-newest" });
    expect(await burnCard(u, newer, NOW + 80 * H, true)).toEqual({ status: "not-eligible", why: "too-old" });
  });

  it("an uncharged card can't be regretted", async () => {
    const u = "regret-free";
    const code = nextCode();
    await mint(u, code, "secret", { charged: false, addedAt: NOW - H });
    expect(await burnCard(u, code, NOW, true)).toEqual({ status: "not-eligible", why: "uncharged" });
  });
});
