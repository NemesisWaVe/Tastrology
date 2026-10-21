import { beforeEach, describe, expect, it } from "vitest";
import { buildCard, cardCode } from "@/lib/card";
import { FRESH_MS, LATEST, clearLatest, forgetReading, isFresh, latestCode, loadReading, markFresh, saveReading, type Reading } from "@/lib/readings";
import type { BrandMatch, QEntity, StyleResult } from "@/lib/types";

// A Map-backed localStorage with a size cap, so the "store is full" path runs too.
class Store {
  m = new Map<string, string>();
  cap = Infinity;
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    const used = [...this.m].reduce((n, [kk, vv]) => n + (kk === k ? 0 : vv.length), 0);
    if (used + v.length > this.cap) throw new Error("QuotaExceededError");
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
const store = new Store();
(globalThis as unknown as { localStorage?: Store }).localStorage = store;

const kinds: QEntity["kind"][] = ["artist", "movie", "book", "tv_show", "place"];
const brand = (i: number): BrandMatch => ({
  entity: { id: `b${i}`, name: `Brand ${i}`, kind: "brand", tags: [], popularity: 0.5 },
  affinity: 0.7,
  category: "fashion",
  explain: { s1: 0.5 },
  ablation: {},
  because: ["s1"],
});
const result = (name: string): StyleResult => ({
  runId: name,
  mode: "live",
  planner: "autopilot",
  createdAt: 0,
  seeds: kinds.map((k, i) => ({ id: `s${i + 1}`, name: `${name} ${i}`, kind: k, tags: [], popularity: 0.5 })),
  dna: { name: `The ${name}`, tagline: "t", keywords: [{ id: "k1", name: "Retro" }], lobes: [] },
  brands: [brand(1), brand(2), brand(3)],
  rejected: [],
  contradictions: [],
  bridges: [],
  capsule: [],
  critique: [],
  stats: { qlooCalls: 0, ms: 0, llmSteps: 0 },
});
const reading = (name: string): Reading => ({ result: result(name), votes: {}, pinned: [] });
const code = (r: Reading) => cardCode(buildCard(r.result!));

describe("readings filed by card code", () => {
  beforeEach(() => {
    store.m.clear();
    store.cap = Infinity;
  });

  it("finds an older card's reading after a newer one became the latest", () => {
    const a = reading("Alpha");
    const b = reading("Beta");
    saveReading(a, { latest: true });
    saveReading(b, { latest: true });
    expect(latestCode()).toBe(code(b));
    expect(loadReading(code(a))?.result?.dna.name).toBe("The Alpha");
    expect(loadReading(code(b))?.result?.dna.name).toBe("The Beta");
  });

  it("files a latest reading saved before filing existed", () => {
    const a = reading("Alpha");
    store.setItem(LATEST, JSON.stringify(a));
    expect(loadReading(code(a))?.result?.dna.name).toBe("The Alpha");
    clearLatest();
    expect(loadReading(code(a))).not.toBeNull();
  });

  it("forgets a burned card, and the latest sign when it was that card", () => {
    const a = reading("Alpha");
    saveReading(a, { latest: true });
    forgetReading(code(a));
    expect(loadReading(code(a))).toBeNull();
    expect(store.getItem(LATEST)).toBeNull();
  });

  it("ignores a reading filed under a code it doesn't hash to", () => {
    const a = reading("Alpha");
    store.setItem("tastrology:r:0000-XXXX", JSON.stringify(a));
    expect(loadReading("0000-XXXX")).toBeNull();
    expect(store.getItem("tastrology:r:0000-XXXX")).toBeNull();
  });

  it("drops the oldest readings when the store is full", () => {
    const names = ["Alpha", "Beta", "Gamma", "Delta"];
    const one = JSON.stringify(reading("Alpha")).length;
    store.cap = one * 2.5 + 200;
    for (const n of names) saveReading(reading(n), { latest: false });
    expect(loadReading(code(reading("Delta")))).not.toBeNull();
    expect(loadReading(code(reading("Alpha")))).toBeNull();
  });

  it("opens the full reading only for a while after the mint, and never after a burn", () => {
    markFresh("ABCD-1234");
    const now = Date.now();
    expect(isFresh("ABCD-1234", now)).toBe(true);
    expect(isFresh("WXYZ-9876", now)).toBe(false);
    expect(isFresh("ABCD-1234", now + FRESH_MS + 1)).toBe(false);
    forgetReading("ABCD-1234");
    expect(isFresh("ABCD-1234", now)).toBe(false);
  });
});
