import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BattleResult } from "@/lib/battle";
import { getStamps, recordBattle } from "@/lib/stamps";
import { FakeDynamo } from "./fakeDynamo";

let db: FakeDynamo;
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

const fight = (winner: BattleResult["winner"]) => ({ names: { a: "Neon Monk", b: "Soft Brutalist" }, winner }) as BattleResult;

describe("passport stamps", () => {
  it("stamps both cards, once per pair", async () => {
    await recordBattle("AAAA1111", "BBBB2222", fight("a"), 1);
    await recordBattle("AAAA1111", "BBBB2222", fight("a"), 2);
    expect(await getStamps("AAAA1111")).toMatchObject({ won: 1, lost: 0, recent: [{ code: "BBBB2222", name: "Soft Brutalist", outcome: "won" }] });
    expect(await getStamps("BBBB2222")).toMatchObject({ won: 0, lost: 1, recent: [{ code: "AAAA1111", outcome: "lost" }] });
  });

  it("counts ties for both sides", async () => {
    await recordBattle("CCCC3333", "DDDD4444", fight("tie"));
    expect((await getStamps("CCCC3333"))?.tied).toBe(1);
    expect((await getStamps("DDDD4444"))?.tied).toBe(1);
  });
});
