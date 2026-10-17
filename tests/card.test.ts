import { describe, expect, it } from "vitest";
import { RARITY_CUTS, ablationLines, buildCard, cardCode, redrawCap } from "@/lib/card";
import { trimResult } from "@/lib/saved";
import type { BrandMatch, QEntity, StyleResult } from "@/lib/types";

const seed = (i: number, kind: QEntity["kind"], popularity?: number): QEntity => ({ id: `s${i}`, name: `Seed ${i}`, kind, tags: [], popularity });
const brand = (i: number, ablation: Record<string, number> = {}): BrandMatch => ({
  entity: { id: `b${i}`, name: `Brand ${i}`, kind: "brand", tags: [], popularity: 0.5 },
  affinity: 0.7,
  category: "fashion",
  explain: { s1: 0.5, s2: 0.5 },
  ablation,
  because: ["s1", "s2"],
});
const kinds: QEntity["kind"][] = ["artist", "movie", "book", "tv_show", "place"];
const base = (over: Partial<StyleResult> = {}, pop = 0.5): StyleResult => ({
  runId: "t",
  mode: "mock",
  planner: "autopilot",
  createdAt: 0,
  seeds: kinds.map((k, i) => seed(i + 1, k, pop)),
  dna: { name: "The Seed 1 Who Bakes", tagline: "Seed 1 did this.", keywords: [{ id: "k1", name: "Retro" }, { id: "k2", name: "Soft" }], lobes: [] },
  brands: [brand(1, { s1: 0.38, s2: 0.1 }), brand(2), brand(3)],
  rejected: [],
  contradictions: [],
  bridges: [],
  capsule: [],
  critique: [],
  stats: { qlooCalls: 0, ms: 0, llmSteps: 0 },
  ...over,
});

describe("saved result", () => {
  it("a card rebuilt from localStorage keeps its rarity, stats and verify code", () => {
    const r = base({ overlap: 0.2, contradictions: [{ a: "s1", b: "s2", overlap: 0 }] }, 0.91);
    const fresh = buildCard(r);
    const reloaded = buildCard(JSON.parse(JSON.stringify(trimResult(r))));
    expect(reloaded.rarity).toBe(fresh.rarity);
    expect(reloaded.stats).toEqual(fresh.stats);
    expect(cardCode(reloaded)).toBe(cardCode(fresh));
  });
});

describe("taste-based rarity", () => {
  it("scores obscurity 40 + pairing 25 + spread 20 + tension 15, each listed in rarityWhy", () => {
    const c = buildCard(base({ overlap: 0.2, contradictions: [{ a: "s1", b: "s2", overlap: 0 }] }, 0.91));
    // 40*0.8 + 25*0.8 + 20*5/5 + 15*1
    expect(c.rarityScore).toBe(24 + 20 + 20 + 15);
    expect(c.rarityWhy[0]).toBe("+24 obscurity: your picks sit in the top 9% by popularity");
    expect(c.rarityWhy).toHaveLength(4);
    expect(c.rarity).toBe("secret");
  });
  it("a mainstream, overlapping, narrow taste is Common", () => {
    const r = base({ overlap: 0.6, seeds: [seed(1, "artist", 0.99), seed(2, "artist", 0.99), seed(3, "artist", 0.98)] });
    const c = buildCard(r);
    expect(c.rarityScore).toBeLessThan(RARITY_CUTS.rare);
    expect(c.rarity).toBe("common");
  });
  it("never invents inputs: no popularity or overlap means those lines are absent", () => {
    const r = base({ seeds: kinds.map((k, i) => seed(i + 1, k)) });
    const c = buildCard(r);
    expect(c.rarityWhy.some((w) => /obscurity|odd pairing/.test(w))).toBe(false);
    expect(c.rarityScore).toBe(20);
  });
});

describe("weakness, Deep Cut, moves", () => {
  it("Weakness comes from the inert seed and is absent without one", () => {
    expect(buildCard(base()).weakness).toBeUndefined();
    const c = buildCard(base({ inert: [{ id: "s3", influence: 0.02 }] }));
    expect(c.weakness).toBe("Weak to: Seed 3. Moved 2% of your picks.");
  });
  it("Deep Cut only under 90% average popularity", () => {
    expect(buildCard(base({}, 0.89)).deepCut).toBe(true);
    expect(buildCard(base({}, 0.9)).deepCut).toBe(false);
    expect(buildCard(base({ seeds: kinds.map((k, i) => seed(i + 1, k)) })).deepCut).toBe(false);
  });
  it("each move carries its biggest measured ablation drop", () => {
    const r = base();
    expect(buildCard(r).moves[0].cut).toEqual({ name: "Seed 1", drop: 38 });
    expect(buildCard(r).moves[1].cut).toBeUndefined();
    expect(ablationLines(r.brands[0], r.seeds).map((x) => x.drop)).toEqual([38, 10]);
  });
  it("Signal is the avg affinity of the top brands (the same thing battle.ts measures)", () => {
    const c = buildCard(base());
    expect(c.stats[3].value).toBe(70);
    expect(c.stats[3].hint).toMatch(/how strongly Qloo backs your top 3 brands/);
  });
});

describe("rising sign", () => {
  const styled = (i: number, style: string[]): BrandMatch => ({ ...brand(i), entity: { ...brand(i).entity, style } });
  it("skips a style nearly every brand carries and picks the specific one", () => {
    const brands = [styled(1, ["Minimalist", "Techwear"]), styled(2, ["Minimalist"]), styled(3, ["Minimalist"]), styled(4, ["Minimalist", "Techwear"]), styled(5, ["Minimalist"])];
    expect(buildCard(base({ brands, createdAt: Date.UTC(2026, 9, 20) })).bigThree.rising.name).toBe("Techwear");
  });
  it("leaves older readings as they were", () => {
    const brands = [styled(1, ["Minimalist", "Techwear"]), styled(2, ["Minimalist"]), styled(3, ["Minimalist"]), styled(4, ["Minimalist", "Techwear"]), styled(5, ["Minimalist"])];
    expect(buildCard(base({ brands, createdAt: 0 })).bigThree.rising.name).toBe("Minimalist");
  });
});

describe("second draw", () => {
  it("can't outrank the card it replaced, and says so", () => {
    const r = base({ overlap: 0, contradictions: [{ a: "s1", b: "s2", overlap: 0 }] }, 0.99);
    const natural = buildCard(r);
    expect(natural.rarity).not.toBe("common");
    const capped = buildCard({ ...r, redraw: { cap: "common" } });
    expect(capped.rarity).toBe("common");
    expect(capped.secondDraw).toBe(true);
    expect(capped.rarityWhy.join(" ")).toMatch(/Second draw/);
    expect(buildCard({ ...r, redraw: { cap: "secret" } }).rarity).toBe(natural.rarity);
  });
  it("gives a Common one step of leverage, to Rare, and no more", () => {
    expect(redrawCap("common")).toBe("rare");
    expect(redrawCap("rare")).toBe("rare");
    expect(redrawCap("holo")).toBe("holo");
    const r = base({ overlap: 0, contradictions: [{ a: "s1", b: "s2", overlap: 0 }] }, 0.99);
    expect(["common", "rare"]).toContain(buildCard({ ...r, redraw: { cap: redrawCap("common") } }).rarity);
  });
});
