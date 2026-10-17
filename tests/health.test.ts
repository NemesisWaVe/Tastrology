import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import { configProblems } from "@/lib/health";
import { turnstileOn } from "@/lib/human";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const prod = {
  VERCEL_ENV: "production",
  QLOO_MODE: "live",
  QLOO_API_KEY: "k",
  UPSTASH_REDIS_REST_URL: "https://r",
  UPSTASH_REDIS_REST_TOKEN: "t",
};

describe("health: production config checks", () => {
  it("passes a complete production config", () => {
    expect(configProblems(prod)).toEqual([]);
    expect(configProblems({ ...prod, TURNSTILE_SECRET_KEY: "s", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "p", CLERK_SECRET_KEY: "c", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk" })).toEqual([]);
  });
  it("flags mock mode, half pairs and no Upstash", () => {
    expect(configProblems({ ...prod, QLOO_API_KEY: "" })).toEqual(["qloo_mock_mode"]);
    expect(configProblems({ ...prod, TURNSTILE_SECRET_KEY: "s" })).toEqual(["turnstile_half_configured"]);
    expect(configProblems({ ...prod, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk" })).toEqual(["clerk_half_configured"]);
    expect(configProblems({ ...prod, UPSTASH_REDIS_REST_TOKEN: "" })).toEqual(["no_upstash"]);
  });
  it("ignores everything outside production", () => {
    expect(configProblems({ VERCEL_ENV: "preview" })).toEqual([]);
    expect(configProblems({})).toEqual([]);
  });
  it("route answers 503 with ok:false on a production problem", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("QLOO_API_KEY", "");
    const res = await GET(new Request("http://x/api/health"));
    expect(res.status).toBe(503);
    const j = await res.json();
    expect(j.ok).toBe(false);
    expect(j.problems).toContain("qloo_mock_mode");
  });
  it("route answers 200 outside production", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    const res = await GET(new Request("http://x/api/health"));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});

describe("health: turnstile half pair fails open", () => {
  it("is off without the public site key", () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "s");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    expect(turnstileOn()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "p");
    expect(turnstileOn()).toBe(true);
  });
});

describe("health: deep check", () => {
  it("needs the bearer token", async () => {
    vi.stubEnv("HEALTH_TOKEN", "secret-token");
    expect((await GET(new Request("http://x/api/health?deep=1"))).status).toBe(401);
    expect((await GET(new Request("http://x/api/health?deep=1", { headers: { authorization: "Bearer wrong-token!" } }))).status).toBe(401);
  });
  it("probes every dependency and reports degraded ones", async () => {
    vi.stubEnv("HEALTH_TOKEN", "secret-token");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("S3_BUCKET", "b");
    vi.stubEnv("S3_ACCESS_KEY_ID", "k");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "s");
    vi.stubEnv("DDB_TABLE", "t");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (String(url).includes("dynamodb") ? new Response("{}") : new Response("<Error/>", { status: 500 }))),
    );
    const res = await GET(new Request("http://x/api/health?deep=1", { headers: { authorization: "Bearer secret-token" } }));
    const j = await res.json();
    expect(res.status).toBe(503);
    expect(j.deps.ddb.ok).toBe(true); // answered "no such item": reachable
    expect(j.deps.s3.ok).toBe(false); // 500
    expect(j.deps.qloo.ok).toBe(true); // mock mode
    expect(j.deps.upstash).toMatchObject({ ok: true, note: "off" });
    expect(j.degraded).toEqual(["s3"]);
  });
});
