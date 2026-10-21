import { describe, expect, it } from "vitest";
import { feedOrder } from "@/lib/hall";

describe("Hall feed order", () => {
  it("leads with a Secret, then one Secret to two Holos", () => {
    expect(feedOrder(["s1", "s2"], ["h1", "h2", "h3", "h4", "h5"])).toEqual(["s1", "h1", "h2", "s2", "h3", "h4", "h5"]);
  });
  it("keeps every card exactly once when one tier is empty", () => {
    expect(feedOrder([], ["h1", "h2", "h3"])).toEqual(["h1", "h2", "h3"]);
    expect(feedOrder(["s1", "s2"], [])).toEqual(["s1", "s2"]);
  });
});
