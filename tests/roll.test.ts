import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROLL_ODDS, tierAt } from "@/lib/odds";
import { commitment, rollFor, rollOn } from "@/lib/roll";

beforeEach(() => vi.stubEnv("ROLL_SECRET", "test-secret"));
afterEach(() => vi.unstubAllEnvs());

describe("rarity roll", () => {
  it("is fixed per account and run, and differs between them", () => {
    const a = rollFor("u1", "run-1", "01");
    expect(rollFor("u1", "run-1", "01")).toEqual(a);
    const others = ["run-2", "run-3", "run-4", "run-5"].map((r) => rollFor("u1", r, "01").u);
    expect(new Set([a.u, ...others]).size).toBeGreaterThan(1);
    expect(rollFor("u2", "run-1", "01").u).not.toBe(a.u);
  });
  it("lands on the published odds", () => {
    const n = 20000;
    const count: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const t = rollFor(`u${i}`, "r", "01").tier;
      count[t] = (count[t] ?? 0) + 1;
    }
    for (const o of ROLL_ODDS) expect(Math.abs(count[o.tier] / n - o.p)).toBeLessThan(0.012);
  });
  it("walks from the rare end and commits to the season key", () => {
    expect(tierAt(0.01)).toBe("secret");
    expect(tierAt(0.05)).toBe("holo");
    expect(tierAt(0.2)).toBe("rare");
    expect(tierAt(0.9)).toBe("common");
    expect(commitment("01")).toMatch(/^[0-9a-f]{64}$/);
    expect(commitment("01")).not.toBe(commitment("02"));
    expect(rollOn()).toBe(true);
    vi.stubEnv("ROLL_SECRET", "");
    expect(rollOn()).toBe(false);
  });
});
