import { describe, expect, it } from "vitest";
import { blocked, clean } from "@/lib/guard";

describe("content guard", () => {
  it("blocks explicit and hateful terms, with simple disguises", () => {
    for (const t of ["porn", "P0RN hub", "best nsfw art", "onlyfans", "hentai", "urn:tag:genre:media:hentai", "strip club", "xxx", "s3x", "nazi"]) expect(blocked(t), t).toBe(true);
  });
  it("lets real titles and ordinary words through", () => {
    for (const t of ["Sex and the City", "Sex on the Beach", "Sex Education", "Moby Dick", "Essex", "Jujutsu Kaisen", "Ramen", "Scunthorpe", "Analog photography", "Kinky Boots", "Dickinson"]) expect(blocked(t), t).toBe(false);
  });
  it("filters result lists", () => {
    expect(clean([{ name: "Brazzers" }, { name: "Aftersun" }]).map((x) => x.name)).toEqual(["Aftersun"]);
  });
});
