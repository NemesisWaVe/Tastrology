import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/qloo", async (orig) => ({
  ...(await orig<typeof import("@/lib/qloo")>()),
  insights: vi.fn(async () => [{ id: "b1", name: "Fjällräven", kind: "brand", tags: [], affinity: 0.8 }]),
}));

import { ddbGet, ddbPutIfAbsent, ddbUpdate } from "@/lib/ddb";
import { DIVIDEND_MAX, dividendFor, payDividend } from "@/lib/dividend";
import { insights } from "@/lib/qloo";
import { buyLiving, LIVING_DUST, RECAST_DUST, recastCard, recastsOf, seasonOf } from "@/lib/recast";
import { getStyle } from "@/lib/cardStyle";
import { DUST_RATES, READING_DUST } from "@/lib/stardust";
import { useFakeDynamo } from "./fakeDynamo";

const NOW = Date.UTC(2026, 9, 18, 12);
const U = "u1";

async function own(code: string, rarity: string, minted = 1) {
  await ddbPutIfAbsent({ PK: `OWNER#${U}`, SK: `CARD#${code}`, code, card: JSON.stringify({ rarity }), rarityScore: 50, minted, addedAt: 1 });
}
const wallet = (dust: number) => ddbPutIfAbsent({ PK: `USER#${U}`, SK: "WALLET", credits: 0, dust, v: 0 });
const dust = async () => Number((await ddbGet(`USER#${U}`, "WALLET"))?.dust) || 0;
const receipt = (code: string) =>
  ddbPutIfAbsent({ PK: `CARD#${code}`, SK: "RECEIPT", at: 1, json: JSON.stringify({ v: 1, at: 1, lite: { at: 1, lite: true, loves: [{ id: "L1", name: "Radiohead", kind: "Music" }], brands: [], voids: [] } }) });

beforeEach(() => {
  useFakeDynamo();
  vi.stubEnv("CREDITS_ON", "1");
});
afterEach(() => vi.unstubAllEnvs());

describe("rates", () => {
  it("climb steeply but stay under a reading", () => {
    expect(DUST_RATES.secret).toBeGreaterThan(DUST_RATES.holo);
    expect(DUST_RATES.holo).toBeGreaterThanOrEqual(DUST_RATES.rare * 2);
    for (const v of Object.values(DUST_RATES)) expect(v).toBeLessThan(READING_DUST);
  });
});

describe("dividend", () => {
  it("pays held Holo and Secret once a month, capped", async () => {
    expect(dividendFor(["holo", "secret", "common"])).toBe(35);
    expect(dividendFor(Array(10).fill("secret"))).toBe(DIVIDEND_MAX);
    await wallet(0);
    await own("0001-AAAA", "holo");
    await own("0002-AAAA", "secret");
    await own("0003-AAAA", "secret", 0); // collected, not minted: doesn't count
    expect(await payDividend(U, NOW)).toEqual({ paid: 35, month: "2026-10" });
    expect(await payDividend(U, NOW + 1000)).toEqual({ paid: 35, month: "2026-10" });
    expect(await dust()).toBe(35);
    expect(await payDividend(U, Date.UTC(2026, 10, 2))).toMatchObject({ paid: 35, month: "2026-11" });
    expect(await dust()).toBe(70);
  });
  it("never pays for a card bought with money or Stardust", async () => {
    await wallet(0);
    await ddbPutIfAbsent({ PK: `OWNER#${U}`, SK: "CARD#0011-AAAA", code: "0011-AAAA", card: JSON.stringify({ rarity: "secret" }), rarityScore: 50, minted: 1, addedAt: 1, funding: "paid" });
    await ddbPutIfAbsent({ PK: `OWNER#${U}`, SK: "CARD#0012-AAAA", code: "0012-AAAA", card: JSON.stringify({ rarity: "holo" }), rarityScore: 50, minted: 1, addedAt: 1, funding: "dust" });
    expect(await payDividend(U, NOW)).toBeNull();
  });
  it("pays nothing for a deck of commons", async () => {
    await wallet(0);
    await own("0004-AAAA", "common");
    expect(await payDividend(U, NOW)).toBeNull();
    expect(await dust()).toBe(0);
  });
});

describe("recast", () => {
  it("charges, stores the reading, marks the season, and waits a week per territory", async () => {
    const code = "0005-AAAA";
    await wallet(100);
    await own(code, "common");
    await receipt(code);
    const lens = seasonOf(NOW).lens;
    const r = await recastCard(U, code, lens, NOW);
    expect(r.status).toBe("recast");
    expect(await dust()).toBe(100 - RECAST_DUST);
    expect((await recastsOf(code))[0]).toMatchObject({ lens, season: "2026-10" });
    expect((await getStyle(code)).recasts.map((x) => x.lens)).toEqual([lens]);
    expect((await recastCard(U, code, lens, NOW + 1000)).status).toBe("too-soon");
    expect((await recastCard(U, code, lens, NOW + 8 * 86_400_000)).status).toBe("recast");
  });
  it("refuses strangers, the poor, and takes nothing when Qloo finds nothing", async () => {
    const code = "0006-AAAA";
    await own(code, "common");
    await receipt(code);
    expect((await recastCard("other", code, "fashion", NOW)).status).toBe("not-owner");
    await wallet(RECAST_DUST - 1);
    expect((await recastCard(U, code, "fashion", NOW)).status).toBe("poor");
    await ddbUpdate(`USER#${U}`, "WALLET", "SET dust = :d", { values: { ":d": 100 } });
    vi.mocked(insights).mockResolvedValueOnce([]);
    expect((await recastCard(U, code, "fashion", NOW)).status).toBe("empty");
    expect(await dust()).toBe(100);
    expect((await recastCard(U, "0007-AAAA", "nope", NOW)).status).toBe("bad-lens");
  });
  it("needs the card's loves", async () => {
    await wallet(100);
    await own("0008-AAAA", "common");
    expect((await recastCard(U, "0008-AAAA", "travel", NOW)).status).toBe("no-receipt");
  });
});

describe("living sigils", () => {
  it("sells once per card, never to Holo or Secret", async () => {
    await wallet(250);
    await own("0009-AAAA", "rare");
    expect(await buyLiving(U, "0009-AAAA", "rare", NOW)).toBe("bought");
    expect(await buyLiving(U, "0009-AAAA", "rare", NOW)).toBe("has");
    expect(await dust()).toBe(250 - LIVING_DUST);
    expect((await getStyle("0009-AAAA")).living).toBe(true);
    expect(await buyLiving(U, "0010-AAAA", "holo", NOW)).toBe("has");
  });
});
