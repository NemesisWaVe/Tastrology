import { describe, expect, it } from "vitest";
import { blocked, care, clean, nearest } from "@/lib/guard";

describe("content guard", () => {
  it("blocks explicit and hateful terms, with simple disguises", () => {
    for (const t of ["porn", "P0RN hub", "best nsfw art", "onlyfans", "hentai", "urn:tag:genre:media:hentai", "strip club", "xxx", "s3x", "nazi"]) expect(blocked(t), t).toBe(true);
  });
  it("lets real titles and ordinary words through", () => {
    for (const t of ["Sex and the City", "Sex on the Beach", "Sex Education", "Moby Dick", "Essex", "Jujutsu Kaisen", "Ramen", "Scunthorpe", "Analog photography", "Kinky Boots", "Dickinson", "Suicide Squad", "The Virgin Suicides", "Ford Escort"]) expect(blocked(t), t).toBe(false);
  });
  it("catches words hidden in usernames and bios, and the usual disguises", () => {
    for (const t of ["cuck", "big cuck energy", "hentaides", "hentai des", "xxcuckxx", "fuuuck", "f u c k", "c.u.c.k", "b1tch", "pornstar99", "5lut", "n1gga", "h3ntai_lover", "kys"]) expect(blocked(t), t).toBe(true);
  });
  it("leaves words that only look like a hidden one", () => {
    for (const t of ["therapist", "Cuckoo's Nest", "Scunthorpe United", "torpedo", "swanky", "Thorny Devil", "fire retardant", "Shinigami", "Niigata", "Pedro Pascal", "Grape Soda", "Hockey", "Cocktail bar", "Matsuri", "A B C"]) expect(blocked(t), t).toBe(false);
  });
  it("filters result lists", () => {
    expect(clean([{ name: "Brazzers" }, { name: "Aftersun" }]).map((x) => x.name)).toEqual(["Aftersun"]);
  });
  it("answers a struggling search with care, and blocked words with neighbours", () => {
    expect(care("I want to die")).toBe(true);
    expect(blocked("self harm")).toBe(true);
    expect(care("Suicide Squad")).toBe(false);
    expect(nearest("hentai")).toEqual(["Anime", "Manga", "Seinen"]);
    expect(nearest("loli")).toEqual([]);
    expect(nearest("porn").length).toBeGreaterThan(0);
  });
});
