import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/agent/route";
import { resetUpstashBreaker } from "@/lib/cache";
import { personaRequest, PERSONAS } from "@/lib/personas";
import { leaseHeld, takeLease } from "@/lib/runLease";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetUpstashBreaker();
});

/** Fake Upstash pipeline: tm:running:* keys exist, everything else is empty. */
function upstashWithLease() {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
  const seen: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const cmds = JSON.parse(String(init.body)) as (string | number)[][];
      return new Response(
        JSON.stringify(
          cmds.map(([op, key]) => {
            seen.push(`${op} ${String(key).split(":").slice(0, 2).join(":")}`);
            return { result: op === "GET" && String(key).startsWith("tm:running:") ? "1" : null };
          }),
        ),
      );
    }),
  );
  return seen;
}

describe("resume after a dropped stream", () => {
  it("answers 202 running (retry-after 4) when another instance holds the run lease", async () => {
    const seen = upstashWithLease();
    const body = JSON.stringify(personaRequest(PERSONAS[1]));
    const res = await POST(new Request("http://x/api/agent", { method: "POST", body, headers: { "content-type": "application/json", "x-run-id": "run-12345678" } }));
    expect(res.status).toBe(202);
    expect(res.headers.get("retry-after")).toBe("4");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ reason: "running" });
    // Checked the results cache first, then the lease; never started a run or touched rate limits.
    expect(seen).toContain("GET tm:results");
    expect(seen).toContain("GET tm:running");
    expect(seen.some((s) => s.startsWith("INCR") || s.startsWith("ZADD"))).toBe(false);
  });

  it("keeps the run going when the client disconnects, and caches the result for the reconnect", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("LLM_API_KEY", "");
    vi.stubEnv("LLM_BASE_URL", "");
    const body = JSON.stringify(personaRequest(PERSONAS[0]));
    const post = () => POST(new Request("http://x/api/agent", { method: "POST", body, headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" } }));
    const first = await post();
    expect(first.status).toBe(200);
    const reader = first.body!.getReader();
    await reader.read();
    await reader.cancel(); // the phone went to sleep
    const flights = (globalThis as unknown as { __tmFlights: Map<string, { ac: AbortController; done: Promise<unknown> }> }).__tmFlights;
    const f = [...flights.values()].at(-1)!;
    expect(f.ac.signal.aborted).toBe(false);
    await f.done;
    // Reconnect: the cached result replays (no second run).
    const again = await post();
    const text = await again.text();
    expect(text).toContain('"type":"result"');
    expect(text).toContain('"cached":true');
  }, 60_000);

  it("memory lease: one holder at a time when Upstash is off", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    const key = `lease-test-${Math.random()}`;
    expect(await leaseHeld(key)).toBe(false);
    expect(await takeLease(key)).toBe(true);
    expect(await takeLease(key)).toBe(false);
    expect(await leaseHeld(key)).toBe(true);
  });

  it("rejects an oversized body from content-length before reading it", async () => {
    const res = await POST(new Request("http://x/api/agent", { method: "POST", body: "{}", headers: { "content-length": String(64 * 1024) } }));
    expect(res.status).toBe(413);
  });
});
