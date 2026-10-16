import { describe, expect, it } from "vitest";
import { foldBeats, pullShares } from "@/components/reveal/traceModel";
import type { SceneData } from "@/lib/types";

describe("reading scene beats", () => {
  const beats: SceneData[] = [
    { kind: "seeds", seeds: [{ id: "a", name: "A", kind: "movie" }, { id: "b", name: "B", kind: "book" }, { id: "c", name: "C", kind: "artist" }] },
    { kind: "brands", brands: [{ id: "x", name: "X", affinity: 90 }, { id: "y", name: "Y", affinity: 80 }, { id: "z", name: "Z", affinity: 70 }] },
    { kind: "ablation", seed: "a", drops: { x: 6, y: 2, z: 9 } },
    { kind: "ablation", seed: "b", drops: { x: 1, y: 1, z: 0 } },
    { kind: "ablation", seed: "c", drops: { x: 1, y: 1, z: 0 } },
    { kind: "critique", kept: ["x", "y"], rejected: [{ id: "z", why: "fluke" }], inert: ["c"] },
  ];

  it("folds beats in order and tracks the seed currently pulled out", () => {
    const f = foldBeats(beats.slice(0, 4));
    expect(f.ablated).toEqual(["a", "b"]);
    expect(f.last).toBe("ablation");
    expect(f.critique).toBeUndefined();
  });

  it("splits the pull over kept brands only, so a flung fluke can't decide the bet", () => {
    const { shares, top } = pullShares(foldBeats(beats));
    expect(top).toBe("a");
    expect(shares.a).toBeCloseTo(8 / 12);
    expect(shares.b + shares.c).toBeCloseTo(4 / 12);
  });

  it("defers to the agent's strongest seed when it sent one", () => {
    const withStrongest = [...beats.slice(0, -1), { ...beats[5], strongest: "b" } as SceneData];
    expect(pullShares(foldBeats(withStrongest)).top).toBe("b");
  });
});
