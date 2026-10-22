import { describe, expect, it } from "vitest";
import { parseBaseline } from "@/lib/comparison";

const ok = '{"brands":[{"name":"ACRONYM","reason":"Tech-wear."},{"name":"Burberry","reason":"British heritage."}]}';

describe("comparison baseline parsing", () => {
  it("reads clean and fenced JSON", () => {
    expect(parseBaseline(ok)?.map((b) => b.name)).toEqual(["ACRONYM", "Burberry"]);
    expect(parseBaseline("```json\n" + ok + "\n```")?.length).toBe(2);
  });
  it("reads past a stray opening brace or prose around the object", () => {
    expect(parseBaseline("{\n" + ok)?.length).toBe(2);
    expect(parseBaseline("Here you go: " + ok + " Enjoy!")?.length).toBe(2);
  });
  it("still refuses what it can't read", () => {
    expect(parseBaseline("no json here")).toBeNull();
    expect(parseBaseline('{"brands":[]}')).toBeNull();
  });
});
