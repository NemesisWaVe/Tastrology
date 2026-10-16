import { describe, expect, it } from "vitest";
import { runAgent } from "@/lib/agent";
import { battle } from "@/lib/battle";
import { PERSONAS, personaRequest } from "@/lib/personas";

describe("battle", () => {
  it("keeps compatibility in 0-100 and the crossover brand from the inputs", async () => {
    const results = [];
    for (const p of PERSONAS.slice(0, 3)) results.push(await runAgent(personaRequest(p), () => {}));
    for (const x of results)
      for (const y of results) {
        const out = battle(x, y);
        expect(out.compatibility).toBeGreaterThanOrEqual(0);
        expect(out.compatibility).toBeLessThanOrEqual(100);
        expect(out.rounds).toHaveLength(4);
        const ids = new Set([...x.brands, ...y.brands].map((b) => b.entity.id));
        if (out.crossover) expect(ids.has(out.crossover.brand.id)).toBe(true);
      }
    expect(battle(results[0], results[0]).compatibility).toBe(100);
  }, 60_000);
});
