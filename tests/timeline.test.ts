import { describe, expect, it } from "vitest";
import type { CardData } from "@/lib/card";
import { moveLine, tasteMove } from "@/lib/timeline";

const card = (loves: string[], sun: string, moon: string, rising: string) =>
  ({ evolvesFrom: loves.map((name) => ({ name, kind: "x" })), bigThree: { sun: { name: sun }, moon: { name: moon }, rising: { name: rising } } }) as unknown as CardData;

describe("taste timeline", () => {
  it("names what stayed, left, arrived and which signs moved", () => {
    const m = tasteMove(card(["Radiohead", "Dune", "Marvel"], "Futuristic", "Floral", "Minimalist"), card(["radiohead", "Dune", "Past Lives"], "Futuristic", "Quiet", "Minimalist"));
    expect(m.kept).toEqual(["radiohead", "Dune"]);
    expect(m.dropped).toEqual(["Marvel"]);
    expect(m.added).toEqual(["Past Lives"]);
    expect(moveLine(m)).toBe("Kept radiohead, Dune. Dropped Marvel. New: Past Lives. Moon moved from Floral to Quiet.");
  });
  it("says so when nothing moved", () => {
    const c = card(["A"], "S", "M", "R");
    expect(moveLine(tasteMove(c, c))).toMatch(/held still/);
  });
});
