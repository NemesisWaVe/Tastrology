import { describe, expect, it } from "vitest";
import { typeOf } from "@/lib/card";
import { SIGNS, isoWeek, signFor, signOf } from "@/lib/signs";
import { weekLine, weekPick } from "@/lib/weekly";

describe("signs and the weekly reading", () => {
  it("twelve signs with distinct ids, and typeOf still draws from them", () => {
    expect(SIGNS).toHaveLength(12);
    expect(new Set(SIGNS.map((s) => s.id)).size).toBe(12);
    expect(typeOf("Futuristic").glyph).toBe("⚡");
    expect(signFor("Futuristic")?.id).toBe("futurist");
    expect(signFor("Dark Academia")?.id).toBe("rebel");
    expect(signFor("Zzz")).toBeUndefined();
  });

  it("Qloo's wider vocabulary lands on a sign, and every card gets one", () => {
    const want: [string, string][] = [["Cute", "playful"], ["Pastel Colors", "playful"], ["Seductive", "romantic"], ["Skate", "rebel"], ["Bold Logos", "rebel"], ["Conceptual", "avant"], ["User Friendly", "futurist"], ["Casual", "utility"], ["Refined Elegance", "luxe"], ["Earthy", "natural"], ["Smart", "tailored"], ["Refined Tailoring", "luxe"]];
    for (const [w, id] of want) expect(signFor(w)?.id, w).toBe(id);
    // the type colours on a card still come from `re` alone, so existing cards keep their look
    expect(typeOf("Cute").glyph).toBe("✧");
    const t = (name: string) => ({ name });
    expect(signOf({ sun: t("Zzz"), moon: t("Cute"), rising: t("Urban") }).id).toBe("playful");
    expect(signOf({ sun: t("Zzz"), moon: t("Qqq"), rising: t("Www") })).toBe(signOf({ sun: t("zzz"), moon: t("x"), rising: t("y") }));
  });

  it("ISO weeks start on Monday and roll over on Monday", () => {
    const sun = isoWeek(Date.UTC(2026, 9, 25, 23));
    const mon = isoWeek(Date.UTC(2026, 9, 26, 0));
    expect(sun.key).toBe("2026-W43");
    expect(mon.key).toBe("2026-W44");
    expect(new Date(sun.start).getUTCDay()).toBe(1);
    expect(isoWeek(Date.UTC(2027, 0, 1)).key).toBe("2026-W53");
  });

  it("picks three distinct brands, pictures first, the same for the same seed", () => {
    const pool = Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, image: i % 3 ? `x${i}` : undefined }));
    for (let seed = 0; seed < 500; seed += 37) {
      const a = weekPick(pool, seed);
      expect(new Set(a.map((x) => x.id)).size).toBe(3);
      expect(weekPick(pool, seed)).toEqual(a);
    }
    expect(weekPick(pool.slice(0, 2), 5)).toHaveLength(2);
  });

  it("always writes a line", () => {
    const p = (name: string) => ({ id: name, name, kind: "brand" as const });
    for (let seed = 0; seed < 64; seed++) expect(weekLine(SIGNS[0], seed, [p("A"), p("B"), p("C")], p("Artist"), p("Film")).length).toBeGreaterThan(10);
    expect(weekLine(SIGNS[0], 3, [], null, null)).toContain("Futurist");
  });
});
