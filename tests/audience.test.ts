import { describe, expect, it } from "vitest";
import { fitsAudience } from "@/lib/qloo";
import { cleanBio, clip } from "@/lib/tagline";

describe("audience", () => {
  it("keeps women-only items out unless the profile says woman", () => {
    const lingerie = { name: "Agent Provocateur", subtitle: "Lingerie", style: [], tags: [] };
    const bras = { name: "Skims", style: ["bralette", "minimal"], tags: [] };
    const jacket = { name: "Carhartt WIP", style: ["workwear"], tags: [{ id: "x", name: "streetwear" }] };
    for (const a of ["man", "nonbinary", "", undefined] as const) {
      expect(fitsAudience(lingerie, a)).toBe(false);
      expect(fitsAudience(bras, a)).toBe(false);
      expect(fitsAudience(jacket, a)).toBe(true);
    }
    expect(fitsAudience(lingerie, "woman")).toBe(true);
  });

  it("cleans and clips bios for a phone", () => {
    expect(cleanBio("  my\n\nlife   my rules\u0007 ")).toBe("my life my rules");
    expect(cleanBio("x".repeat(400)).length).toBe(160);
    expect(clip("short")).toBe("short");
    const c = clip("My life my rules, you are a fool and everyone knows it by now");
    expect(c.length).toBeLessThanOrEqual(48);
    expect(c.endsWith("…")).toBe(true);
  });
});
