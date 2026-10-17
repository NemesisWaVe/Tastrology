import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as battleGET } from "@/app/api/battle/route";
import { GET as cardGET } from "@/app/api/card/route";
import { getFighterStatus } from "@/lib/fighters";
import { getTwinStatus } from "@/lib/twins";

type Reply = "404" | "500" | "throw" | "noitem";
/** Fake S3 and DynamoDB: each backend answers the way the test says. */
function backends(s3: Reply, ddb: Reply) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const which = String(url).includes("dynamodb") ? ddb : s3;
      if (which === "throw") throw new TypeError("fetch failed");
      if (which === "noitem") return new Response("{}", { status: 200 });
      return new Response(which === "404" ? "<NoSuchKey/>" : "oops", { status: Number(which) });
    }),
  );
}

let n = 0;
/** A fresh valid code per test, so the in-memory twin cache never answers for us. */
const code = () => `${String(1000 + n++).padStart(4, "0")}-ABCD`;

beforeEach(() => {
  vi.stubEnv("S3_BUCKET", "b");
  vi.stubEnv("S3_ACCESS_KEY_ID", "k");
  vi.stubEnv("S3_SECRET_ACCESS_KEY", "s");
  vi.stubEnv("DDB_TABLE", "t");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("tri-state twin lookup", () => {
  it("is missing when every backend answered and none has it", async () => {
    backends("404", "noitem");
    expect((await getTwinStatus(code())).status).toBe("missing");
  });
  it("is an error when nothing was found and a backend couldn't answer", async () => {
    backends("404", "throw");
    expect((await getTwinStatus(code())).status).toBe("error");
    backends("500", "noitem");
    expect((await getTwinStatus(code())).status).toBe("error");
  });
  it("treats unconfigured backends as silent, not as errors", async () => {
    vi.stubEnv("S3_BUCKET", "");
    vi.stubEnv("DDB_TABLE", "");
    backends("throw", "throw");
    expect((await getTwinStatus(code())).status).toBe("missing");
  });
});

describe("/api/card and /api/battle on a storage blip", () => {
  const req = (path: string) => new Request(`http://x${path}`, { headers: { "x-forwarded-for": `10.0.0.${n}` } });
  it("returns 503 no-store instead of a cacheable 404", async () => {
    backends("500", "throw");
    const res = await cardGET(req(`/api/card?code=${code()}`));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("still returns a cacheable 404 for a real miss", async () => {
    backends("404", "noitem");
    const res = await cardGET(req(`/api/card?code=${code()}`));
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toContain("max-age=60");
  });
  it("battle: 503 when a fighter lookup errored", async () => {
    backends("500", "noitem");
    expect((await getFighterStatus(code())).status).toBe("error");
    const res = await battleGET(req(`/api/battle?a=${code()}&b=${code()}`));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("battle: 404 when both stores answered", async () => {
    backends("404", "noitem");
    const res = await battleGET(req(`/api/battle?a=${code()}&b=${code()}`));
    expect(res.status).toBe(404);
  });
});
