import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ddbGet, ddbPutIfAbsent } from "@/lib/ddb";
import { addToPool, drawPack, openPack, PACK_DUST, PACK_HOLDERS, PACK_ODDS, PACK_SIZE, tierFor } from "@/lib/packs";
import { FakeDynamo, useFakeDynamo } from "./fakeDynamo";

let db: FakeDynamo;
const NOW = Date.UTC(2026, 9, 18, 12);
const codes = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${String(5000 + i)}-${p}`);

beforeEach(async () => {
  db = useFakeDynamo();
  vi.stubEnv("CREDITS_ON", "1");
  for (const c of codes(6, "CCCC")) await addToPool(c, "common");
  for (const c of codes(3, "RRRR")) await addToPool(c, "rare");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const dustOf = async (u: string) => Number((await ddbGet(`USER#${u}`, "WALLET"))?.dust);
const wallet = (u: string, dust: number) => ddbPutIfAbsent({ PK: `USER#${u}`, SK: "WALLET", credits: 0, v: 0, dust });

describe("battle packs", () => {
  it("published odds add up to 1 and map in order", () => {
    expect(PACK_ODDS.reduce((a, o) => a + o.p, 0)).toBeCloseTo(1);
    expect(tierFor(0)).toBe("common");
    expect(tierFor(0.99)).toBe("secret");
  });

  it("draws the same pack all day, and never your own cards", async () => {
    await ddbPutIfAbsent({ PK: "OWNER#u1", SK: "CARD#5000-CCCC", code: "5000-CCCC" });
    const a = await drawPack("u1", "2026-10-18");
    expect(a).toHaveLength(PACK_SIZE);
    expect(a).not.toContain("5000-CCCC");
    expect(await drawPack("u1", "2026-10-18")).toEqual(a);
  });

  it("costs Stardust once a day, and refuses when you can't afford it", async () => {
    await wallet("u2", PACK_DUST + 10);
    const first = await openPack("u2", NOW);
    expect(first.status).toBe("opened");
    expect(await openPack("u2", NOW)).toMatchObject({ status: "dup" });
    expect(Number(db.items.get("USER#u2|WALLET")?.dust?.N)).toBe(10);
    expect((await openPack("u2", NOW + 86_400_000)).status).toBe("poor");
  });
});

describe("pack tiers", () => {
  it("publishes tables that add up, with the boosts in order", async () => {
    const { PACKS, PACK_KINDS, tierFor } = await import("@/lib/packs");
    for (const k of PACK_KINDS) expect(PACKS[k].odds.reduce((a, o) => a + o.p, 0)).toBeCloseTo(1);
    const p = (k: keyof typeof PACKS, t: string) => PACKS[k].odds.find((o) => o.tier === t)!.p;
    expect(p("star", "secret")).toBe(0.02);
    expect(p("supernova", "secret") - p("star", "secret")).toBeCloseTo(0.03);
    expect(p("supernova", "holo")).toBeCloseTo(3 * p("star", "holo"));
    expect(p("flare", "holo")).toBeGreaterThan(p("star", "holo"));
    expect(PACKS.star.dust).toBeLessThan(PACKS.flare.dust);
    expect(PACKS.flare.dust).toBeLessThan(PACKS.supernova.dust);
    expect(tierFor(0.99, PACKS.supernova.odds)).toBe("secret");
  });
});

describe("stardust bundles", () => {
  it("stay off until payments are live and DUST_SALE=1", async () => {
    const { dustSaleOn } = await import("@/lib/products");
    vi.stubEnv("PAYMENTS_PROVIDER", "");
    vi.stubEnv("DUST_SALE", "1");
    expect(dustSaleOn()).toBe(false);
    vi.stubEnv("PAYMENTS_PROVIDER", "razorpay");
    vi.stubEnv("DUST_SALE", "");
    expect(dustSaleOn()).toBe(false);
    vi.stubEnv("DUST_SALE", "1");
    expect(dustSaleOn()).toBe(true);
    vi.unstubAllEnvs();
  });

  it("credits a paid order once, however often the webhook retries", async () => {
    const { creditPurchasedDust } = await import("@/lib/stardust");
    await wallet("buyer", 5);
    expect(await creditPurchasedDust("buyer", "order_ABC123", 100)).toBe("credited");
    expect(await creditPurchasedDust("buyer", "order_ABC123", 100)).toBe("dup");
    expect(await creditPurchasedDust("buyer", "bad id!", 100)).toBe("error");
    expect(await creditPurchasedDust("buyer", "order_XYZ999", -5)).toBe("error");
    expect(await dustOf("buyer")).toBe(105);
  });
});

describe("pack cards are copies, and an original has a holder limit", () => {
  const all = [...codes(6, "CCCC"), ...codes(3, "RRRR")];

  it("an original that reaches the holder limit leaves the pool", async () => {
    for (const c of all) await ddbPutIfAbsent({ PK: `CARD#${c}`, SK: "HOLDERS", n: PACK_HOLDERS - 1 } as never);
    await wallet("u3", PACK_DUST);
    const r = await openPack("u3", NOW);
    expect(r.status).toBe("opened");
    const [code] = (r as { codes: string[] }).codes;
    expect(Number(db.items.get(`CARD#${code}|HOLDERS`)?.n?.N)).toBe(PACK_HOLDERS);
    expect([...db.items.keys()].some((k) => k.startsWith("POOL#") && k.endsWith(`CARD#${code}`))).toBe(false);
  });

  it("when every original is full, nothing is charged", async () => {
    for (const c of all) await ddbPutIfAbsent({ PK: `CARD#${c}`, SK: "HOLDERS", n: PACK_HOLDERS } as never);
    await wallet("u4", PACK_DUST);
    expect((await openPack("u4", NOW)).status).not.toBe("opened");
    expect(await dustOf("u4")).toBe(PACK_DUST);
  });

  it("never hands you a card you already collected", async () => {
    await ddbPutIfAbsent({ PK: "USER#u5", SK: "PACK#2026-10-01", codes: all.filter((c) => c !== "5005-CCCC").join(",") } as never);
    for (const day of ["2026-10-18", "2026-10-19", "2026-10-20"]) expect(await drawPack("u5", day)).toEqual(["5005-CCCC"]);
  });

  it("draws from the whole tier, not just its first cards", async () => {
    const big = Array.from({ length: 400 }, (_, i) => `${String(i * 25).padStart(4, "0")}-BBBB`);
    for (const c of big) await addToPool(c, "common");
    for (const c of codes(6, "CCCC")) db.items.delete(`POOL#common|CARD#${c}`);
    for (const c of codes(3, "RRRR")) db.items.delete(`POOL#rare|CARD#${c}`);
    const seen = new Set<number>();
    for (let u = 0; u < 60; u++) for (const c of (await drawPack(`x${u}`, "2026-10-18")) ?? []) seen.add(big.indexOf(c));
    expect(Math.max(...seen)).toBeGreaterThan(300);
    expect(Math.min(...seen)).toBeLessThan(100);
  });
});
