import { describe, expect, it } from "vitest";
import { cacheKey, normalizeRequest } from "@/app/api/agent/key";
import { isAllowedImageUrl } from "@/app/api/img/allow";
import type { AgentRequest } from "@/lib/types";

describe("/api/img allowlist", () => {
  it("only proxies https images.qloo.com", () => {
    expect(isAllowedImageUrl("https://images.qloo.com/i/abc.jpg")).toBe(true);
    for (const bad of [
      "http://images.qloo.com/i/abc.jpg",
      "https://images.qloo.com.evil.com/x.jpg",
      "https://user:pw@images.qloo.com/x.jpg",
      "https://images.qloo.com:8443/x.jpg",
      "https://evil.com/?https://images.qloo.com/",
      "not a url",
    ])
      expect(isAllowedImageUrl(bad), bad).toBe(false);
  });
});

describe("/api/agent cache key", () => {
  const base: AgentRequest = { seeds: [{ id: "a", name: "A", kind: "movie" }, { id: "b", name: "B", kind: "book" }] };
  it("changes with feedback and previous brands", () => {
    const k = cacheKey(base);
    expect(cacheKey({ ...base, feedback: { liked: [], disliked: ["x"] } })).not.toBe(k);
    expect(cacheKey({ ...base, feedback: { liked: ["x"], disliked: [] } })).not.toBe(k);
    expect(cacheKey({ ...base, previous: { brandIds: ["x"] } })).not.toBe(k);
    expect(cacheKey({ ...base, previous: { brandIds: ["y", "x"] } })).toBe(cacheKey({ ...base, previous: { brandIds: ["x", "y"] } }));
  });
  it("clamps the goal to 200 chars", () => {
    const r = normalizeRequest({ ...base, goal: "x".repeat(500) }) as AgentRequest;
    expect(r.goal).toHaveLength(200);
  });
});
