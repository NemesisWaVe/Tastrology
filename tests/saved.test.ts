import { describe, expect, it } from "vitest";
import { isSavedResult } from "@/lib/saved";

const ok = {
  runId: "r",
  mode: "mock",
  planner: "autopilot",
  createdAt: 0,
  seeds: [{ id: "s1", name: "Seed", kind: "movie", tags: [] }],
  dna: { name: "N", tagline: "T", keywords: [{ id: "k", name: "K" }], lobes: [{ seedIds: ["s1"], keywords: [] }] },
  brands: [{ entity: { id: "b1", name: "B", kind: "brand", tags: [] }, affinity: 0.5, category: "", explain: {}, ablation: {}, because: [] }],
  rejected: [],
  contradictions: [],
  bridges: [],
  capsule: [],
  critique: [],
  stats: { qlooCalls: 1, ms: 1, llmSteps: 0 },
};

describe("saved result shape check", () => {
  it("accepts a well-formed result", () => {
    expect(isSavedResult(ok)).toBe(true);
  });
  it("rejects broken saves instead of letting them crash the page", () => {
    expect(isSavedResult(null)).toBe(false);
    expect(isSavedResult("x")).toBe(false);
    expect(isSavedResult({ ...ok, dna: undefined })).toBe(false);
    expect(isSavedResult({ ...ok, brands: [{ affinity: 1 }] })).toBe(false);
    expect(isSavedResult({ ...ok, seeds: "nope" })).toBe(false);
    expect(isSavedResult({ ...ok, dna: { ...ok.dna, keywords: [null] } })).toBe(false);
  });
});
