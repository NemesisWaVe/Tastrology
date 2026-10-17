import { afterEach, describe, expect, it, vi } from "vitest";
import { runAgent, UpstreamError } from "@/lib/agent";
import { BREAKER_OPEN_MS, resetUpstashBreaker, upstash, upstashBreaker } from "@/lib/cache";
import { splitNdjson } from "@/lib/ndjson";
import { personaRequest, PERSONAS } from "@/lib/personas";
import { gate, gateLoad } from "@/lib/qloo";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetUpstashBreaker();
});

describe("Upstash circuit breaker", () => {
  it("opens after 3 straight failures, skips Upstash for 30s, then tries again", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", fetch);
    vi.useFakeTimers({ toFake: ["Date"] });
    for (let i = 0; i < 3; i++) expect(await upstash([["GET", "k"]])).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(upstashBreaker().open).toBe(true);

    expect(await upstash([["GET", "k"]])).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3); // skipped while open

    vi.setSystemTime(Date.now() + BREAKER_OPEN_MS + 1);
    fetch.mockImplementation(async () => new Response(JSON.stringify([{ result: "v" }])) as never);
    expect(await upstash([["GET", "k"]])).toEqual(["v"]);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(upstashBreaker()).toMatchObject({ open: false, fails: 0 });
  });

  it("a success in between resets the count", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    let ok = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (ok ? new Response("[]") : new Response("down", { status: 502 }))),
    );
    await upstash([["PING"]]);
    await upstash([["PING"]]);
    ok = true;
    await upstash([["PING"]]);
    ok = false;
    await upstash([["PING"]]);
    await upstash([["PING"]]);
    expect(upstashBreaker().open).toBe(false);
  });
});

describe("Qloo gate", () => {
  it("lets a queued waiter give up on abort or timeout without leaking its place", async () => {
    let free!: () => void;
    const hold = new Promise<void>((r) => (free = r));
    const busy = Array.from({ length: 4 }, () => gate(() => hold));
    const ac = new AbortController();
    const aborted = gate(async () => "ran", ac.signal);
    const timed = gate(async () => "ran", undefined, 20);
    expect(gateLoad().waiting).toBe(2);
    ac.abort();
    await expect(aborted).rejects.toThrow();
    await expect(timed).rejects.toThrow(/timed out/);
    expect(gateLoad().waiting).toBe(0);
    free();
    await Promise.all(busy);
    expect(gateLoad()).toEqual({ active: 0, waiting: 0 });
  });
});

describe("NDJSON reader", () => {
  it("skips a bad line and keeps the rest", () => {
    const { items, rest, bad } = splitNdjson('{"type":"thought","text":"a"}\n<html>502</html>\n\n{"type":"result"}\n{"type":"thou');
    expect(items).toEqual([{ type: "thought", text: "a" }, { type: "result" }]);
    expect(bad).toBe(1);
    expect(rest).toBe('{"type":"thou');
  });
});

describe("Qloo down", () => {
  it("fails the run with reason upstream when every seed search fails", async () => {
    vi.stubEnv("QLOO_MODE", "live");
    vi.stubEnv("QLOO_API_KEY", "x");
    vi.stubEnv("LLM_API_KEY", "");
    vi.stubEnv("LLM_BASE_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad gateway", { status: 503, headers: { "retry-after": "0.01" } })),
    );
    const req = personaRequest(PERSONAS[2]);
    const err = await runAgent(req, () => {}).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.reason).toBe("upstream");
  }, 30_000);
});
