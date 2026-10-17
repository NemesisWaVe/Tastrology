import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ddbPutIfAbsent } from "@/lib/ddb";
import { addToPool, drawPack, openPack, PACK_DUST, PACK_ODDS, tierFor } from "@/lib/packs";
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
    expect(a).toHaveLength(3);
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
