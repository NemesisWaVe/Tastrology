import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEASON, buildCard, cardCode, cardNo, editionName, editionOf, setOf } from "@/lib/card";
import { battle } from "@/lib/battle";
import { ODDS_V } from "@/lib/odds";
import { claimPrint, printId, stamp, unstamped } from "@/lib/print";
import type { BrandMatch, QEntity, StyleResult } from "@/lib/types";

// DynamoDB as a map: claimPrint's write-once claims and the twins filed before claims existed.
const db = vi.hoisted(() => ({ items: new Map<string, Record<string, unknown>>(), down: false }));
vi.mock("@/lib/ddb", () => ({
  ddbPutIfAbsent: async (it: { PK: string; SK: string }) => {
    if (db.down) return "error";
    const k = `${it.PK}|${it.SK}`;
    if (db.items.has(k)) return "exists";
    db.items.set(k, it);
    return "created";
  },
  ddbGet: async (PK: string, SK: string) => (db.down ? null : (db.items.get(`${PK}|${SK}`) ?? null)),
}));

beforeEach(() => {
  vi.stubEnv("ROLL_SECRET", "test-secret");
  db.items.clear();
  db.down = false;
});
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

describe("a card's code is one mint's alone", () => {
  const codeIn = (r: StyleResult) => cardCode(buildCard(r));

  it("a free code is claimed for this mint, and a retry of the mint finds its own claim", async () => {
    const a = await claimPrint(reading(), { userId: "u1", runId: "run-a" });
    expect(a.print).toBe(printId("u1", "run-a"));
    expect(db.items.get(`CODE#${codeIn(a)}|CLAIM`)?.owner).toBe("u1|run-a");
    const again = await claimPrint(reading(), { userId: "u1", runId: "run-a" });
    expect(codeIn(again)).toBe(codeIn(a));
  });

  it("if another mint already holds the code, this one takes the next print: its own code, the same roll", async () => {
    const first = stamp(reading(), { userId: "u2", runId: "run-b" });
    // Someone else got there first with this very code (a hash collision).
    db.items.set(`CODE#${codeIn(first)}|CLAIM`, { owner: "u9|run-z" });
    const p = await claimPrint(reading(), { userId: "u2", runId: "run-b" });
    expect(codeIn(p)).not.toBe(codeIn(first));
    expect(p.roll).toEqual(first.roll);
    expect(db.items.get(`CODE#${codeIn(p)}|CLAIM`)?.owner).toBe("u2|run-b");
  });

  it("a card filed before claims existed keeps its code too", async () => {
    const first = stamp(reading(), { userId: "u3", runId: "run-c" });
    db.items.set(`CARD#${codeIn(first)}|META`, { card: JSON.stringify({ print: "ZZZZZZ" }) });
    const p = await claimPrint(reading(), { userId: "u3", runId: "run-c" });
    expect(codeIn(p)).not.toBe(codeIn(first));
  });

  it("its own twin from an earlier attempt is not a collision", async () => {
    const first = stamp(reading(), { userId: "u4", runId: "run-d" });
    db.items.set(`CARD#${codeIn(first)}|META`, { card: JSON.stringify(buildCard(first)) });
    expect(codeIn(await claimPrint(reading(), { userId: "u4", runId: "run-d" }))).toBe(codeIn(first));
  });

  it("with DynamoDB down the first print goes ahead, and a mock reading is never claimed", async () => {
    db.down = true;
    expect((await claimPrint(reading(), { userId: "u5", runId: "run-e" })).print).toBe(printId("u5", "run-e"));
    db.down = false;
    expect((await claimPrint(reading({ mode: "mock" }), { userId: "u5", runId: "run-e" })).print).toBeUndefined();
    expect(db.items.size).toBe(0);
  });

  it("the number on a print is its code; older cards keep the taste serial", () => {
    const p = buildCard(stamp(reading(), { userId: "u1", runId: "run-a" }));
    expect(cardNo(p)).toBe(cardCode(p));
    expect(cardNo(buildCard(reading()))).toBe(buildCard(reading()).serial);
  });
});

describe("editions and provenance are fixed at mint", () => {
  it("a print carries its edition, mint time, odds and engine, and they never change after", () => {
    const p = stamp(reading({ engine: "1", edition: "01" }), { userId: "u1", runId: "run-a", at: 1_700_000_000_000 });
    const c = buildCard(p);
    expect(c.edition).toBe(SEASON);
    expect(c.mintedAt).toBe(1_700_000_000_000);
    expect(c.odds).toBe(ODDS_V);
    expect(c.engine).toBe("1");
    expect(setOf(c)).toBe(`SET ${SEASON}`);
  });

  it("a cached reading from an older edition is printed into the current one", () => {
    expect(stamp(reading({ edition: "00" }), { userId: "u1", runId: "run-a" }).edition).toBe(SEASON);
  });

  it("the edition is part of a print's code, so it can't be edited onto a card", () => {
    const c = buildCard(stamp(reading(), { userId: "u1", runId: "run-a" }));
    expect(cardCode({ ...c, edition: "02" })).not.toBe(cardCode(c));
    // a print from before editions (print, no edition) hashes without one, as it was minted
    const { edition: _e, ...before } = c;
    expect(cardCode(before)).not.toBe(cardCode(c));
  });

  it("older cards read as edition 01; the stamp says 1st, 2nd, 3rd, 11th, 21st", () => {
    expect(editionOf({})).toBe("01");
    expect(["01", "02", "03", "04", "11", "12", "13", "21", "22"].map((edition) => editionName({ edition }))).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  });
});

describe("fights use the cards as minted", () => {
  const other = () => reading({ seeds: [seed("s7", "Daft Punk", 0.95), seed("s8", "Blade Runner", 0.9)], brands: [brand(4), brand(5), brand(6)] });

  it("a stored card's stats are what fight, not a rebuild with today's formulas", () => {
    const a = buildCard(stamp(reading(), { userId: "u1", runId: "run-a" }));
    const strong = { ...a, stats: a.stats.map((s) => ({ ...s, value: 99 })) };
    const out = battle(reading(), other(), { a: strong });
    expect(out.rounds.map((r) => r.a)).toEqual([99, 99, 99, 99]);
    expect(out.cards.a.print).toBe(a.print);
  });

  it("a stored card without the four round stats falls back to the rebuild", () => {
    const a = buildCard(reading());
    const odd = { ...a, stats: [{ label: "Vibe", value: 99, hint: "" }] };
    expect(battle(reading(), other(), { a: odd }).rounds.map((r) => r.a)).toEqual(a.stats.map((s) => s.value));
  });
});
