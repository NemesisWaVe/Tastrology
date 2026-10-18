import { describe, expect, it } from "vitest";
import { autoPath, Coverage, foilFor, FOILS, pathAt, rareFoil, streakStep, thresholdFor } from "@/lib/scratch";

describe("scratch foil", () => {
  it("counts each cell once and needs both zones worked", () => {
    const c = new Coverage(160, 48, 56);
    for (let x = 0; x <= 160; x += 4) c.stamp(x, 24, 30);
    expect(c.total).toBe(1);
    expect(c.done(0.5)).toBe(true);
    const only = new Coverage(160, 48, 56);
    for (let x = 70; x <= 160; x += 4) for (const y of [4, 14, 24, 34, 44]) only.stamp(x, y, 8);
    expect(only.total).toBeGreaterThanOrEqual(0.5);
    expect(only.zones[0]).toBe(0);
    expect(only.done(0.5)).toBe(false); // the logo was never touched
    const again = new Coverage(160, 48, 56);
    again.stamp(80, 24, 10);
    const once = again.total;
    again.stamp(80, 24, 10);
    expect(again.total).toBe(once);
  });

  it("the auto path clears the foil and runs under four seconds before the payoff", () => {
    const w = 260;
    const h = 56;
    const pts = autoPath(w, h, 58);
    const end = pts[pts.length - 1].t;
    expect(end).toBeGreaterThan(2400);
    expect(end).toBeLessThan(3800);
    for (let i = 1; i < pts.length; i++) expect(pts[i].t).toBeGreaterThanOrEqual(pts[i - 1].t);
    const c = new Coverage(w, h, 58);
    let last: { x: number; y: number } | null = null;
    for (let t = 0; t <= end; t += 16) {
      const p = pathAt(pts, t);
      if (!p.down) {
        last = null;
        continue;
      }
      const from = last ?? p;
      const d = Math.hypot(p.x - from.x, p.y - from.y);
      const n = Math.max(1, Math.ceil(d / 3));
      for (let k = 1; k <= n; k++) c.stamp(from.x + ((p.x - from.x) * k) / n, from.y + ((p.y - from.y) * k) / n, 11);
      last = p;
    }
    expect(c.done(thresholdFor(1))).toBe(true);
  });

  it("foils and the weekly shimmer are fixed, not random", () => {
    expect(foilFor("urn:entity:x")).toEqual(foilFor("urn:entity:x"));
    expect(FOILS).toContainEqual(foilFor("anything"));
    expect(rareFoil("b1", "2026-W42")).toBe(rareFoil("b1", "2026-W42"));
    const share = Array.from({ length: 1200 }, (_, i) => rareFoil(`b${i}`, "2026-W42")).filter(Boolean).length / 1200;
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.13);
  });

  it("a streak climbs while scratches come close together, then resets", () => {
    const t = 1_000_000_000;
    expect(streakStep(t)).toBe(0);
    expect(streakStep(t + 5000)).toBe(1);
    expect(streakStep(t + 9000)).toBe(2);
    expect(streakStep(t + 60_000)).toBe(0);
  });
});
