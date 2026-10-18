import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimOpen, OPEN_CARDS, OPEN_DUST } from "@/lib/brandOpen";
import { ddbGet, ddbPutIfAbsent } from "@/lib/ddb";
import { useFakeDynamo } from "./fakeDynamo";

const NOW = Date.UTC(2026, 9, 19, 12);
const U = "u1";
const own = (code: string, minted = 1) => ddbPutIfAbsent({ PK: `OWNER#${U}`, SK: `CARD#${code}`, code, minted, addedAt: 1 });
const dust = async () => Number((await ddbGet(`USER#${U}`, "WALLET"))?.dust) || 0;

beforeEach(async () => {
  useFakeDynamo();
  vi.stubEnv("CREDITS_ON", "1");
  await ddbPutIfAbsent({ PK: `USER#${U}`, SK: "WALLET", credits: 0, dust: 0, v: 0 });
});
afterEach(() => vi.unstubAllEnvs());

describe("brand sheet opens", () => {
  it("pay once per card per week, for up to OPEN_CARDS cards", async () => {
    const codes = Array.from({ length: OPEN_CARDS + 1 }, (_, i) => `000${i}-AAAA`);
    for (const c of codes) await own(c);
    expect(await claimOpen(U, codes[0], NOW)).toEqual({ status: "paid", dust: OPEN_DUST });
    expect(await claimOpen(U, codes[0], NOW + 1000)).toEqual({ status: "already" });
    for (const c of codes.slice(1, OPEN_CARDS)) expect((await claimOpen(U, c, NOW)).status).toBe("paid");
    expect(await claimOpen(U, codes[OPEN_CARDS], NOW)).toEqual({ status: "capped" });
    expect(await dust()).toBe(OPEN_DUST * OPEN_CARDS);
    // Capped still breaks the seal.
    expect(await claimOpen(U, codes[OPEN_CARDS], NOW)).toEqual({ status: "already" });
    // Next week pays again.
    expect((await claimOpen(U, codes[0], NOW + 7 * 86_400_000)).status).toBe("paid");
  });
  it("breaks the seal on a paid card without paying", async () => {
    await ddbPutIfAbsent({ PK: `OWNER#${U}`, SK: "CARD#0020-AAAA", code: "0020-AAAA", minted: 1, addedAt: 1, funding: "paid" });
    expect(await claimOpen(U, "0020-AAAA", NOW)).toEqual({ status: "opened" });
    expect(await dust()).toBe(0);
  });
  it("only for cards you minted", async () => {
    await own("0009-AAAA", 0);
    expect((await claimOpen(U, "0009-AAAA", NOW)).status).toBe("not-owner");
    expect((await claimOpen(U, "0010-AAAA", NOW)).status).toBe("not-owner");
  });
});
