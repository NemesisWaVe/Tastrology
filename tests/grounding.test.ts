import { describe, expect, it, vi } from "vitest";
import { runAgent } from "@/lib/agent";
import { GroundingLedger, chooseTagline, groundSignName, shortSeed, tagMentionsSeed } from "@/lib/grounding";
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

  it("re-plan with every brand 👎: none come back, and the diff says why", async () => {
    const first = await runAgent(personaRequest(PERSONAS[1]), () => {});
    const ids = first.brands.map((b) => b.entity.id);
    const second = await runAgent({ ...personaRequest(PERSONAS[1]), feedback: { liked: [], disliked: ids }, previous: { brandIds: ids } }, () => {});
    expect(second.brands.filter((b) => ids.includes(b.entity.id))).toEqual([]);
    expect(second.changes?.removed.map((r) => r.id).sort()).toEqual([...ids].sort());
    expect(second.changes?.why.join(" ")).toMatch(/filter\.exclude\.entities/);
  });

  it("copy only claims what was computed", async () => {
    for (const p of PERSONAS) {
      const r = await runAgent(personaRequest(p), () => {});
      const main = r.brands.filter((b) => !b.side);
      expect(r.critique.join(" ")).toContain(`Kept ${main.length} of`);
      expect(r.critique.join(" ")).not.toMatch(/at least two of your seeds/);
      for (const b of r.brands.filter((b) => b.side)) expect(b.why).toMatch(/^Moon pick, on purpose/);
      expect(r.dna.name).toMatch(/^The .+ Who .+/);
      expect(r.dna.name.split(" ").length).toBeLessThanOrEqual(6);
      expect(r.dna.tagline.split(" ").length).toBeLessThanOrEqual(12);
    }
  });
});

describe("taglines must name a seed", () => {
  const seeds = ["Neuromancer (Sprawl, #1)", "The Great British Baking Show", "Blade Runner 2049"];
  it("shortSeed builds the noun for 'The X Who Y'", () => {
    expect(shortSeed("Neuromancer (Sprawl, #1)")).toBe("Neuromancer");
    expect(shortSeed("The Lunchbox")).toBe("Lunchbox");
    expect(shortSeed("Blade Runner 2049")).toBe("Blade Runner");
    expect(shortSeed("Made in Heaven")).toBe("Heaven");
    // games: the name people say, never the first word of a long title or a sequel number
    expect(shortSeed("Grand Theft Auto V")).toBe("GTA");
    expect(shortSeed("Grand Theft Auto 5")).toBe("GTA");
    expect(shortSeed("The Legend of Zelda: Breath of the Wild")).toBe("Zelda");
    expect(shortSeed("Call of Duty: Modern Warfare")).toBe("CoD");
    expect(shortSeed("Red Dead Redemption 2")).toBe("Red Dead");
    expect(shortSeed("The Elder Scrolls V: Skyrim")).toBe("Elder Scrolls");
    expect(shortSeed("Uncharted 4: A Thief's End")).toBe("Uncharted");
    expect(shortSeed("Minecraft")).toBe("Minecraft");
    expect(groundSignName("The GTA Who Bakes", ["Grand Theft Auto V"])).toBe("The GTA Who Bakes");
    expect(groundSignName("The Grand Who Bakes", ["Grand Theft Auto V"])).toBe("The GTA Who Bakes");
  });
  it("grounds the LLM's sign noun in a real seed", () => {
    const s = ["Daft Punk", "Neuromancer (Sprawl, #1)", "Blade Runner 2049"];
    expect(groundSignName("The Neuromancer Who Bakes", s)).toBe("The Neuromancer Who Bakes");
    expect(groundSignName("The Daft Who Blooms Understated", s)).toBe("The Daft Punk Who Blooms Understated");
    expect(groundSignName("The Replicant Who Bakes", s, "Blade Runner 2049")).toBe("The Blade Runner Who Bakes");
    expect(groundSignName("The Replicant Who Bakes", s)).toBeNull();
    expect(groundSignName("Daft Punk Forever", s)).toBeNull();
  });
  it("accepts a tagline that names a seed, ignoring case and subtitles", () => {
    expect(tagMentionsSeed("neuromancer did this to you.", seeds)).toBe(true);
    expect(tagMentionsSeed("Blame the great british baking show.", seeds)).toBe(true);
  });
  it("rejects generic lines and falls back to the deterministic one", () => {
    const generic = "Cyberpunk first, soft second.";
    expect(tagMentionsSeed(generic, seeds)).toBe(false);
    expect(chooseTagline(generic, seeds, "Blame Neuromancer.")).toBe("Blame Neuromancer.");
    expect(chooseTagline("", seeds, "Blame Neuromancer.")).toBe("Blame Neuromancer.");
    expect(chooseTagline("Neuromancer, again.", seeds, "x")).toBe("Neuromancer, again.");
  });
  it("every persona ends up with a tagline that names one of its seeds, and a name of its own", async () => {
    const names = new Set<string>();
    for (const p of PERSONAS) {
      const r = await runAgent(personaRequest(p), () => {});
      expect(tagMentionsSeed(r.dna.tagline, r.seeds.map((s) => s.name)), r.dna.tagline).toBe(true);
      expect(r.dna.name).toMatch(/^The .+ Who .+/);
      names.add(r.dna.name);
    }
    expect(names.size).toBe(PERSONAS.length);
  });
});
