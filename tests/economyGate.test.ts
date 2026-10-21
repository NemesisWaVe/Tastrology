import { beforeEach, describe, expect, it } from "vitest";
import { ddbPutIfAbsent } from "@/lib/ddb";
import { economyOpen } from "@/lib/economyGate";
import { useFakeDynamo } from "./fakeDynamo";

beforeEach(() => {
  useFakeDynamo();
});
const card = (u: string, code: string) => ddbPutIfAbsent({ PK: `OWNER#${u}`, SK: `CARD#${code}`, code });

describe("economy gate", () => {
  it("stays shut on a first card, opens on the second", async () => {
    await card("g1", "1000-AAAA");
    expect(await economyOpen("g1", 0, false)).toBe(false);
    await card("g1", "1001-AAAA");
    expect(await economyOpen("g1", 0, false)).toBe(true);
  });

  it("opens on a first fight, held Stardust or admin", async () => {
    await card("g2", "1002-AAAA");
    await ddbPutIfAbsent({ PK: "USER#g2", SK: "BOUT#abc123#abcdefgh", status: "done" });
    expect(await economyOpen("g2", 0, false)).toBe(true);
    expect(await economyOpen("g3", 40, false)).toBe(true);
    expect(await economyOpen("g4", 0, true)).toBe(true);
    expect(await economyOpen("g5", null, false)).toBe(false);
  });
});
