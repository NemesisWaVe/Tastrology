import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/qloo", async (orig) => ({
  ...(await orig<typeof import("@/lib/qloo")>()),
  findTags: vi.fn(async () => [
    { id: "urn:tag:genre:place:hotel:ramen", name: "Ramen" },
    { id: "urn:tag:specialty_dish:place:ramen", name: "Ramen" },
    { id: "urn:tag:cuisine:qloo:ramen", name: "Ramen" },
    { id: "urn:tag:category:place:ramen_restaurant", name: "Ramen restaurant" },
    { id: "urn:tag:occupation:wikidata:ramen_chef", name: "Ramen Chef" },
  ]),
  insights: vi.fn(async () => [{ id: "A1", name: "BLACKPINK", kind: "artist", tags: [] }]),
  searchEntities: vi.fn(async () => [
    { id: "B0", name: "Fueled by", kind: "brand", tags: [] },
    { id: "B1", name: "Top Ramen", kind: "brand", tags: [] },
  ]),
}));

import { cacheKey, normalizeRequest } from "@/app/api/agent/key";
import { familyOf, resolveVibes, searchVibes } from "@/lib/vibes";
import type { AgentRequest } from "@/lib/types";

const seeds = [
  { id: "s1", name: "Radiohead", kind: "artist" },
  { id: "s2", name: "Aftersun", kind: "movie" },
];

describe("vibes", () => {
  it("offer one tag per name, from the best family, and skip noise", async () => {
    const v = await searchVibes("ramen");
    expect(v[0]).toMatchObject({ id: "urn:tag:specialty_dish:place:ramen", label: "Food" });
    expect(v.map((x) => x.name)).toEqual(["Ramen", "Ramen restaurant"]);
  });
  it("turn music into artists, food into named brands, the rest into tag signals", async () => {
    const r = await resolveVibes([
      { id: "urn:tag:genre:music:k_pop", name: "K Pop" },
      { id: "urn:tag:cuisine:qloo:ramen", name: "Ramen" },
    ]);
    expect(r.anchors.map((a) => a.name).sort()).toEqual(["BLACKPINK", "Top Ramen"]);
    expect(r.via["urn:tag:cuisine:qloo:ramen"]).toEqual(["Top Ramen"]);
    expect((await resolveVibes([{ id: "urn:tag:keyword:qloo:hiking", name: "Hiking" }])).tags).toEqual(["urn:tag:keyword:qloo:hiking"]);
    expect(familyOf("urn:tag:occupation:wikidata:x")).toBeNull();
  });
  it("are validated, capped at 2, and only change the key when present", () => {
    const base = normalizeRequest({ seeds }) as AgentRequest;
    const withV = normalizeRequest({ seeds, vibes: [{ id: "urn:tag:cuisine:qloo:ramen", name: "Ramen" }] }) as AgentRequest;
    expect(withV.vibes).toHaveLength(1);
    expect(cacheKey(base)).not.toContain("vb");
    expect(cacheKey(withV)).not.toBe(cacheKey(base));
    expect(normalizeRequest({ seeds, vibes: [1, 2, 3].map((i) => ({ id: `urn:tag:keyword:qloo:x${i}`, name: "x" })) })).toMatch(/up to 2/);
    expect(normalizeRequest({ seeds, vibes: [{ id: "javascript:alert(1)", name: "x" }] })).toMatch(/isn't one we can read/);
  });
  it("let one named love plus a vibe make a card, and keep explicit picks out", () => {
    const one = [seeds[0]];
    const v = [{ id: "urn:tag:cuisine:qloo:ramen", name: "Ramen" }];
    expect(typeof normalizeRequest({ seeds: one, vibes: v })).toBe("object");
    expect(normalizeRequest({ seeds: one })).toMatch(/between 2 and 8/);
    expect(normalizeRequest({ seeds: [...seeds, { id: "x1", name: "Brazzers", kind: "movie" }] })).toMatch(/doesn't go on public cards/);
    expect(normalizeRequest({ seeds, goal: "a strip club" })).toMatch(/doesn't go on public cards/);
    expect(normalizeRequest({ seeds, vibes: [{ id: "urn:tag:genre:media:hentai", name: "Hentai" }] })).toMatch(/doesn't go on public cards/);
  });
});
