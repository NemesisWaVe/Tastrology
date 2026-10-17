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

describe("fighter sheets", () => {
  it("battle on a round-tripped sheet matches battle on the reading", async () => {
    const { toSheet, fromSheet } = await import("@/lib/fighters");
    const rs = [];
    for (const p of PERSONAS.slice(0, 2)) rs.push(await runAgent(personaRequest(p), () => {}));
    const direct = battle(rs[0], rs[1]);
    const viaSheet = battle(fromSheet(toSheet(rs[0])), fromSheet(toSheet(rs[1])));
    expect(viaSheet.winner).toBe(direct.winner);
    expect(viaSheet.rounds.map((r) => [r.stat, r.winner])).toEqual(direct.rounds.map((r) => [r.stat, r.winner]));
    expect(JSON.stringify(toSheet(rs[0]))).not.toMatch(/https?:/);
  }, 60_000);
});

describe("/api/battle", () => {
  it("battles two registered fighters, 404s unknown ones, caches briefly (a burn must reach the CDN)", async () => {
    const { toSheet, registerFighter } = await import("@/lib/fighters");
    const { buildCard, cardCode } = await import("@/lib/card");
    const { GET } = await import("@/app/api/battle/route");
    const codes: string[] = [];
    for (const p of PERSONAS.slice(0, 2)) {
      const r = await runAgent(personaRequest(p), () => {});
      const code = cardCode(buildCard(r));
      await registerFighter(code, toSheet(r));
      codes.push(code);
    }
    const req = (a: string, b: string) => new Request(`http://x/api/battle?a=${a}&b=${b}`);
    const ok = await GET(req(codes[0], codes[1]));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toContain("s-maxage=300");
    const j = (await ok.json()) as { result: { rounds: unknown[]; winner: string } };
    expect(j.result.rounds).toHaveLength(4);
    expect((await GET(req(codes[0], "0000-ZZZZ"))).status).toBe(404);
    expect((await GET(req(codes[0], "nope"))).status).toBe(400);
  }, 60_000);
});
