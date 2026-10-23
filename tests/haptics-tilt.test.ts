import { describe, expect, it } from "vitest";
import { strengthen } from "@/lib/haptics";
import { tiltReader } from "@/lib/tilt";

const ev = (beta: number, gamma: number) => ({ beta, gamma }) as DeviceOrientationEvent;

describe("haptics", () => {
  it("raises pulses too short to feel, keeps pauses", () => {
    expect(strengthen(6)).toBe(16);
    expect(strengthen(70)).toBe(70);
    expect(strengthen([10, 30, 8])).toEqual([16, 30, 16]);
    expect(strengthen([34, 5, 70])).toEqual([34, 5, 70]);
  });
});

describe("tilt", () => {
  it("measures from how the phone is held, reaching full range at a small turn", () => {
    const read = tiltReader();
    expect(read(ev(70, 3))).toEqual({ x: 0, y: 0 });
    const t = read(ev(70, 15))!;
    expect(t.x).toBeGreaterThan(0.9);
    expect(read(ev(64, 3))!.y).toBeLessThan(-0.4);
  });

  it("ignores readings without angles", () => {
    expect(tiltReader()(ev(null as unknown as number, 0))).toBeNull();
  });
});
