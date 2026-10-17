import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCard, cardCode } from "@/lib/card";
import { getPersonaRun, putPersonaRun } from "@/lib/personaRuns";
import { backfillReceipt, getReceipt, putReceipt, snapOf } from "@/lib/receipt";
import type { BrandMatch, QEntity, StyleResult } from "@/lib/types";
import { useFakeDynamo } from "./fakeDynamo";

const seed = (i: number, kind: QEntity["kind"]): QEntity => ({ id: `s${i}`, name: `Seed ${i}`, kind, tags: [], popularity: 0.5 });
const brand = (i: number): BrandMatch => ({
  entity: { id: `b${i}`, name: `Brand ${i}`, kind: "brand", tags: [], site: "https://example.com" },
  affinity: 0.7,
  category: "fashion",
  explain: { s1: 0.6, s2: 0.4 },
  ablation: { s1: 12 },
  because: ["s1", "s2"],
});
const result = (name = "The Seed 1 Who Bakes"): StyleResult => ({
  runId: "t",
  mode: "live",
  planner: "llm",
  createdAt: 0,
  seeds: (["artist", "movie", "book"] as const).map((k, i) => seed(i + 1, k)),
  dna: { name, tagline: "Seed 1 did this.", keywords: [{ id: "k1", name: "Retro" }], lobes: [] },
  brands: [brand(1), brand(2)],
  rejected: [{ entity: { id: "v1", name: "Void", kind: "brand", tags: [] }, affinity: 0.2, reason: "too loud" }],
  contradictions: [],
  bridges: [],
  capsule: [],
  critique: [],
  stats: { qlooCalls: 0, ms: 0, llmSteps: 0 },
});

beforeEach(() => void useFakeDynamo());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("receipts", () => {
  it("keeps the reading behind a mint, and the sheet reads brands and pulls from it", async () => {
    const r = result();
    const code = cardCode(buildCard(r));
    await putReceipt(code, r);
    const got = await getReceipt(code);
    expect(got.status).toBe("found");
    const snap = got.status === "found" ? snapOf(got.rec) : null;
    expect(snap?.brands.map((b) => b.name)).toEqual(["Brand 1", "Brand 2"]);
    expect(snap?.brands[0]).toMatchObject({ explain: { s1: 0.6 }, ablation: { s1: 12 }, site: "https://example.com" });
    expect(snap?.voids).toEqual([{ name: "Void", reason: "too loud" }]);
  });

  it("backfill only accepts the reading that produces this code", async () => {
    const r = result();
    const code = cardCode(buildCard(r));
    expect(await backfillReceipt(code, result("Someone Else Entirely"))).toBe("mismatch");
    expect(await backfillReceipt(code, r)).toBe("created");
    expect(await backfillReceipt(code, r)).toBe("exists");
  });
});

describe("persona runs", () => {
  it("keeps an LLM run for good, never an autopilot one", async () => {
    await putPersonaRun("p-auto", { events: [], result: { ...result(), planner: "autopilot" } });
    expect(await getPersonaRun("p-auto")).toBeNull();
    await putPersonaRun("p-llm", { events: [], result: result() });
    expect((await getPersonaRun("p-llm"))?.result.dna.name).toBe("The Seed 1 Who Bakes");
  });
});
