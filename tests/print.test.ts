import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCard, cardCode } from "@/lib/card";
import { printId, stamp, unstamped } from "@/lib/print";
import type { BrandMatch, QEntity, StyleResult } from "@/lib/types";

beforeEach(() => vi.stubEnv("ROLL_SECRET", "test-secret"));
afterEach(() => vi.unstubAllEnvs());

const seed = (id: string, name: string, popularity?: number): QEntity => ({ id, name, kind: "artist", tags: [], popularity });
const brand = (i: number): BrandMatch => ({
  entity: { id: `b${i}`, name: `Brand ${i}`, kind: "brand", tags: [], popularity: 0.5 },
  affinity: 0.7,
  category: "fashion",
  explain: { s1: 0.5, s2: 0.5 },
  ablation: {},
  because: ["s1", "s2"],
});
/** A live reading of three loves (Hatsune Miku, Minecraft, Matcha), as the cache holds it: no account on it. */
const reading = (over: Partial<StyleResult> = {}): StyleResult => ({
  runId: "reading-1",
  mode: "live",
  planner: "llm",
  createdAt: Date.now(),
  seeds: [seed("s1", "Hatsune Miku", 0.99), seed("s2", "Minecraft", 0.97), seed("s3", "Matcha Maiden", 0.71)],
  dna: { name: "The Matcha Maiden Who Sips Matcha", tagline: "x", keywords: [{ id: "k1", name: "Cute" }], lobes: [] },
  brands: [brand(1), brand(2), brand(3)],
  rejected: [],
  contradictions: [],
  bridges: [],
  capsule: [],
  critique: [],
  stats: { qlooCalls: 23, ms: 0, llmSteps: 3 },
  ...over,
});
const codeOf = (r: StyleResult) => cardCode(buildCard(r));

describe("prints: one reading, many cards", () => {
  it("minting the same loves again is a new card: own print, own roll, own code and link", () => {
    const base = reading();
    const prints = ["run-a", "run-b", "run-c", "run-d", "run-e", "run-f"].map((runId) => stamp(base, { userId: "u1", runId }));
    const codes = prints.map(codeOf);
    expect(new Set(codes).size).toBe(prints.length);
    expect(new Set(prints.map((p) => p.roll!.u)).size).toBe(prints.length);
    // Same taste, same serial ("No. 4129" on the face); the print part of the code is what tells them apart.
    expect(new Set(prints.map((p) => buildCard(p).serial)).size).toBe(1);
    // The shared reading itself is never changed by printing it.
    expect(base.roll).toBeUndefined();
    expect(base.print).toBeUndefined();
  });

  it("a retry of one mint (same run id) is the identical card", () => {
    const a = stamp(reading(), { userId: "u1", runId: "run-a" });
    const again = stamp(reading(), { userId: "u1", runId: "run-a" });
    expect(codeOf(again)).toBe(codeOf(a));
    expect(again.roll).toEqual(a.roll);
  });

  it("two people with the same loves never share a card", () => {
    const mine = stamp(reading(), { userId: "u1", runId: "run-a" });
    const theirs = stamp(reading(), { userId: "u2", runId: "run-a" });
    expect(codeOf(theirs)).not.toBe(codeOf(mine));
    expect(printId("u1", "run-a")).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
  });

  it("an older cached reading carrying someone's roll is cleaned before it is printed for you", () => {
    const old = { ...reading(), roll: { tier: "secret" as const, u: 0.001, season: "01" }, print: "AAAAAA", redraw: { cap: "rare" as const } };
    expect(unstamped(old)).toEqual(reading());
    const mine = stamp(old, { userId: "u9", runId: "run-z" });
    expect(mine.print).not.toBe("AAAAAA");
    expect(mine.redraw).toBeUndefined();
  });

  it("a second draw keeps its cap on the print", () => {
    const p = stamp(reading(), { userId: "u1", runId: "run-r", cap: "rare" });
    expect(p.redraw).toEqual({ cap: "rare" });
    expect(["common", "rare"]).toContain(buildCard(p).rarity);
  });

  it("cards minted before prints keep their codes", () => {
    const old = reading();
    const c = buildCard(old);
    expect(c.print).toBeUndefined();
    expect(cardCode(c)).toBe(cardCode({ ...c }));
    expect(cardCode({ ...c, print: "ABC123" })).not.toBe(cardCode(c));
  });

  it("mock readings stay unprinted (they never reach a deck)", () => {
    expect(stamp(reading({ mode: "mock" }), { userId: "u1", runId: "r" }).print).toBeUndefined();
  });
});

describe("Deep Cut reads only what you named", () => {
  it("a vibe's stand-in brand doesn't make Hatsune Miku a deep cut", () => {
    // Miku named; Matcha Maiden only stands in for the "matcha" vibe.
    const r = reading({
      seeds: [seed("s1", "Hatsune Miku", 0.99), seed("s3", "Matcha Maiden", 0.71)],
      vibes: [{ id: "urn:tag:menu_highlight:qloo:matcha", name: "Matcha", via: ["Matcha Maiden"] }],
    });
    const card = buildCard(r);
    expect(card.deepCut).toBe(false);
    expect(card.avgPop).toBeUndefined();
  });

  it("named loves that really are off the mainstream still earn it", () => {
    const card = buildCard(reading({ seeds: [seed("s1", "Obscure Band", 0.62), seed("s2", "Small Zine", 0.7)] }));
    expect(card.deepCut).toBe(true);
    expect(card.avgPop).toBe(66);
  });
});
