import { describe, expect, it, vi } from "vitest";
import { runAgent } from "@/lib/agent";
import { GroundingLedger } from "@/lib/grounding";
import * as qloo from "@/lib/qloo";
import { PERSONAS, personaRequest } from "@/lib/personas";
import type { QEntity } from "@/lib/types";

const ent = (id: string): QEntity => ({ id, name: id, kind: "brand", tags: [] });

describe("GroundingLedger", () => {
  it("only keeps ids Qloo returned", () => {
    const l = new GroundingLedger();
    l.record([ent("a"), ent("b")]);
    const { kept, dropped } = l.filter([{ id: "a" }, { id: "llm-invented" }, { id: "b" }], (x) => x.id);
    expect(kept.map((x) => x.id)).toEqual(["a", "b"]);
    expect(dropped.map((x) => x.id)).toEqual(["llm-invented"]);
    expect(l.sanitizeIds(["b", "nope", 3])).toEqual(["b"]);
  });
});

describe("agent output is grounded in Qloo responses", () => {
  for (const p of PERSONAS) {
    it(`${p.name}: every brand and bridge was returned by a Qloo call`, async () => {
      const returned = new Set<string>();
      const insights = vi.spyOn(qloo, "insights");
      const search = vi.spyOn(qloo, "searchEntities");
      const result = await runAgent(personaRequest(p), () => {});
      for (const r of [...insights.mock.results, ...search.mock.results]) for (const e of (await r.value) as QEntity[]) returned.add(e.id);
      insights.mockRestore();
      search.mockRestore();

      expect(result.brands.length).toBeGreaterThanOrEqual(8);
      expect(result.dna.keywords.length).toBeGreaterThanOrEqual(5);
      for (const b of result.brands) expect(returned.has(b.entity.id), b.entity.name).toBe(true);
      for (const b of result.bridges) expect(returned.has(b.entity.id), b.entity.name).toBe(true);
      // Style DNA keywords come from Qloo tag insights, not the LLM.
      for (const k of result.dna.keywords) expect(returned.has(k.id), k.name).toBe(true);
    });
  }

  it("feedback: disliked brands never come back, liked brands become signals", async () => {
    const first = await runAgent(personaRequest(PERSONAS[1]), () => {});
    const [down, up] = [first.brands[0].entity.id, first.brands[1].entity.id];
    const second = await runAgent(
      { ...personaRequest(PERSONAS[1]), feedback: { liked: [up], disliked: [down] }, previous: { brandIds: first.brands.map((b) => b.entity.id) } },
      () => {},
    );
    expect(second.brands.some((b) => b.entity.id === down)).toBe(false);
    expect(second.changes?.removed.some((r) => r.id === down)).toBe(true);
    expect(second.changes?.why.join(" ")).toMatch(/signal/);
  });
});
