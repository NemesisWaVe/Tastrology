import { describe, expect, it } from "vitest";
import { gate, gateLoad } from "@/lib/qloo";
import { normQ } from "@/lib/searchKey";
import { rank, stemOf, tidyNamed } from "@/lib/tasteSearch";
import type { EntityKind, QEntity } from "@/lib/types";
import { hasWords, pickVibes, scoreTags, termKey } from "@/lib/vibes";

// Fixtures are trimmed from live Qloo answers (October 2026).
const ent = (name: string, kind: EntityKind, popularity?: number): QEntity => ({ id: `${kind}:${name}:${popularity}`, name, kind, tags: [], popularity });
const tag = (id: string, name: string, popularity?: number) => ({ id, name, popularity });
const show = (q: string, ents: QEntity[], tags: ReturnType<typeof tag>[], checked: Record<string, boolean | null> = {}) =>
  rank(q, ents, scoreTags(q, tags), new Map(Object.entries(checked))).map((h) => `${h.name}[${h.kind === "vibe" ? h.subtitle!.split(" ·")[0] : h.kind}]`);

const SNEAKER_TAGS = [
  tag("urn:tag:genre:brand:fashion:footwear:sneakers", "Sneakers", 0.968),
  tag("urn:tag:specialty_dish:place:sneakers", "Sneakers", 0.763),
  tag("urn:tag:specialty_dish:place:sneakers_with_pistachios_ice_cream", "Sneakers With Pistachios Ice Cream", 0.578),
  tag("urn:tag:keyword:qloo:sneakers", "Sneakers", 0),
];
const SNEAKER_ENTS = [ent("Sneakers", "movie", 0.93), ent("Sneakers", "artist", 0.75), ent("Sneakers Street", "place", 0.98), ent("Sneakers Pub", "place", 0.89), ent("Sneakers Bistro", "place", 0.9)];

describe("taste search: reading what people mean", () => {
  it("sneakers is a style (Nike), not a dessert or a bar", () => {
    const tags = scoreTags("sneakers", SNEAKER_TAGS);
    expect(tags[0]).toMatchObject({ family: "style", label: "Style", exact: true });
    // The pistachio dessert is under the dish floor and loose; the 0-popularity keyword is under its floor.
    expect(tags.map((t) => t.label)).toEqual(["Style"]);
    const hits = show("sneakers", SNEAKER_ENTS, SNEAKER_TAGS, { "urn:tag:genre:brand:fashion:footwear:sneakers": true });
    expect(hits[0]).toBe("Sneakers[Style]");
    expect(hits.join()).not.toMatch(/Pub|Bistro|Street/);
  });

  it("Minecraft is the game: a same-named music genre that leads nowhere is dropped, the empty twin goes", () => {
    const ents = [ent("Minecraft", "brand", 0.99), ent("Minecraft", "videogame", 0.97), ent("A Minecraft Movie", "movie", 1), ent("Minecraft", "tv_show")];
    const tags = [
      tag("urn:tag:genre:music:minecraft", "Minecraft", 0.914),
      tag("urn:tag:keyword:qloo:minecraft", "Minecraft", 0.488),
      tag("urn:tag:specialty_dish:place:10_chicken_mcnuggets_a_minecraft_movie_meal", "10 Chicken Mcnuggets A Minecraft Movie Meal", 0.578),
    ];
    const hits = show("minecraft", ents, tags, { "urn:tag:genre:music:minecraft": false });
    expect(hits.slice(0, 3)).toEqual(["Minecraft[videogame]", "Minecraft[brand]", "A Minecraft Movie[movie]"]);
    expect(hits.join()).not.toMatch(/genre|Vibe|tv_show/);
  });

  it("a strong name contests an unchecked vibe: it can follow, never lead", () => {
    const tags = [tag("urn:tag:genre:music:minecraft", "Minecraft", 0.914)];
    // The check timed out (null): offered, but after the game.
    expect(show("minecraft", [ent("Minecraft", "videogame", 0.97)], tags, { "urn:tag:genre:music:minecraft": null })).toEqual(["Minecraft[videogame]", "Minecraft[Music genre]"]);
  });

  it("Hades the game never shows a burger called Hades", () => {
    const tags = [tag("urn:tag:specialty_dish:place:hades", "Hades", 0), tag("urn:tag:specialty_dish:place:hades_burger", "Hades Burger", 0)];
    expect(scoreTags("hades", tags)).toEqual([]);
    expect(show("hades", [ent("Hades", "artist", 0.96), ent("Hades", "videogame", 0.94)], tags)).toEqual(["Hades[artist]", "Hades[videogame]"]);
  });

  it("an exact vibe with nothing named against it still leads (k-pop, ramen, matcha)", () => {
    const kpop = [tag("urn:tag:genre:music:k_pop", "K Pop", 0.999), tag("urn:tag:keyword:qloo:k_pop", "K Pop", 0.59)];
    expect(show("k-pop", [ent("KPop Demon Hunters", "movie", 1)], kpop)).toEqual(["K Pop[Music genre]", "KPop Demon Hunters[movie]"]);
    const ramen = [tag("urn:tag:specialty_dish:place:ramen", "Ramen", 0.996), tag("urn:tag:cuisine:qloo:ramen", "Ramen", 0.993)];
    // Cuisine outranks the dish of the same name; a shop that's only called "Ramen" is dropped once the vibe leads.
    expect(scoreTags("ramen", ramen)[0].id).toBe("urn:tag:cuisine:qloo:ramen");
    expect(show("ramen", [ent("Ramen", "place", 0.76), ent("Ramen Tatsu-Ya", "place", 1)], ramen)).toEqual(["Ramen[Food]"]);
    expect(scoreTags("matcha", [tag("urn:tag:menu_highlight:qloo:matcha", "Matcha", 0.927)])[0]).toMatchObject({ label: "Food", exact: true });
  });

  it("two real genres of one name both show (anime: music and screen), a plain Vibe twin does not", () => {
    const tags = [
      tag("urn:tag:genre:music:anime", "Anime", 0.999),
      tag("urn:tag:genre:media:anime", "Anime", 0.999),
      tag("urn:tag:keyword:qloo:anime", "Anime", 0.953),
      tag("urn:tag:genre:music:anime_ost", "Anime Ost", 0.989),
    ];
    expect(pickVibes("anime", scoreTags("anime", tags)).map((v) => v.label)).toEqual(["Music genre", "Screen genre", "Music genre"]);
  });

  it("loose vibes must contain the words: kyoto cuisine yes, game remixes for gamer no", () => {
    expect(hasWords("Kyoto Cuisine", "kyoto")).toBe(true);
    expect(hasWords("Game Remixes", "gamer")).toBe(false);
    expect(hasWords("Atlantic Ocean", "frank ocean")).toBe(false);
    expect(hasWords("K-pop Star", "k-pop")).toBe(true);
    expect(hasWords("Sneakerheads", "sneaker")).toBe(true);
    expect(hasWords("Fan's Cafe", "anime")).toBe(false);
  });

  it("fan words read as the thing itself, but a band is not a fan of radio", () => {
    expect(stemOf("sneakerhead")).toBe("sneaker");
    expect(stemOf("anime fan")).toBe("anime");
    expect(stemOf("k-pop stan")).toBe("k-pop");
    expect(stemOf("head")).toBeNull();
    // Radiohead stems to "radio", and search ignores the stem because the band is a strong exact name.
    expect(stemOf("radiohead")).toBe("radio");
    expect(termKey("Sneakers")).toBe(termKey("sneaker"));
    expect(termKey("K-Pop")).toBe(termKey("kpop"));
  });

  it("same-named things: the work before the company, records with no popularity dropped", () => {
    const out = tidyNamed([ent("Minecraft", "brand", 0.99), ent("A Minecraft Movie", "movie", 1), ent("Minecraft", "videogame", 0.97), ent("Minecraft", "tv_show")]);
    expect(out.map((e) => `${e.name}[${e.kind}]`)).toEqual(["Minecraft[videogame]", "Minecraft[brand]", "A Minecraft Movie[movie]"]);
  });

  it("one spelling per query, so every cache layer shares it", () => {
    expect(normQ("  Frank   OCEAN ")).toBe("frank ocean");
    expect(normQ("ｍｉｎｅｃｒａｆｔ")).toBe("minecraft");
  });
});

describe("Qloo lanes", () => {
  it("typeahead has its own slots: a full reading lane doesn't block it", async () => {
    let free!: () => void;
    const hold = new Promise<void>((r) => (free = r));
    const busy = Array.from({ length: 4 }, () => gate(() => hold));
    expect(gateLoad("run").active).toBe(4);
    await expect(gate(async () => "typed", undefined, undefined, "search")).resolves.toBe("typed");
    expect(gateLoad("search")).toEqual({ active: 0, waiting: 0 });
    free();
    await Promise.all(busy);
  });
});
