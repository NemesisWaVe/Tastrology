import { timingSafeEqual } from "node:crypto";
import { storeMode } from "@/lib/cache";
import { ddbConfigured } from "@/lib/ddb";
import { turnstileOn } from "@/lib/human";
import { llmConfigured, llmPaused } from "@/lib/llm";
import { qlooMode } from "@/lib/qloo";
import { readDaily } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COUNTERS = ["runs", "denied_busy", "denied_daily", "denied_bot", "qloo_429"] as const;

function authorized(request: Request): boolean {
  const want = process.env.HEALTH_TOKEN;
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!want || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** Public: which backends are on. With `?detail=1` and `Authorization: Bearer $HEALTH_TOKEN`: today's counters (UTC). */
export async function GET(request: Request) {
  const base = { ok: true, qlooMode: qlooMode(), llmConfigured: llmConfigured(), llmPaused: llmPaused(), store: storeMode(), deck: ddbConfigured(), turnstile: turnstileOn() };
  const detail = new URL(request.url).searchParams.get("detail") === "1" && authorized(request);
  const today = detail ? Object.fromEntries(await Promise.all(COUNTERS.map(async (c) => [c, await readDaily(c)] as const))) : undefined;
  return Response.json(today ? { ...base, today } : base, { headers: { "cache-control": "no-store" } });
}
