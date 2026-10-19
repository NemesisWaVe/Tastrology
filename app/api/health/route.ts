import { timingSafeEqual } from "node:crypto";
import { storeMode, upstash } from "@/lib/cache";
import { funnelCounts } from "@/lib/metrics";
import { ddbConfigured } from "@/lib/ddb";
import { configProblems, deepCheck } from "@/lib/health";
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

/**
 * Public: which backends are on, plus `problems` (production misconfigurations; any one makes this a 503, so a plain
 * uptime monitor catches them). With `Authorization: Bearer $HEALTH_TOKEN`:
 *   ?detail=1  today's counters (UTC)
 *   ?deep=1    a live probe of every dependency (1.5s each); any failure makes this a 503
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const wantDeep = q.get("deep") === "1";
  const authed = authorized(request);
  if (wantDeep && !authed) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });

  const problems = configProblems();
  const detail = q.get("detail") === "1" && authed;
  const [funnel, errors] = detail ? await Promise.all([funnelCounts(), upstash([["LRANGE", "tm:errors", 0, 99]])]) : [];
  const [today, deep] = await Promise.all([
    q.get("detail") === "1" && authed ? Promise.all(COUNTERS.map(async (c) => [c, await readDaily(c)] as const)).then(Object.fromEntries) : undefined,
    wantDeep ? deepCheck() : undefined,
  ]);
  const ok = problems.length === 0 && (!deep || deep.degraded.length === 0);
  const body = {
    ok,
    qlooMode: qlooMode(),
    llmConfigured: llmConfigured(),
    llmPaused: llmPaused(),
    store: storeMode(),
    deck: ddbConfigured(),
    turnstile: turnstileOn(),
    ...(problems.length ? { problems } : {}),
    ...(today ? { today } : {}),
    ...(detail ? { funnel, errors: errors?.[0] ?? [], measurement: "Event counts, not unique people. Shared means link copied, compose opened or native handoff; scanned means a public invite/card fight visit; scan_minted is client-reported. Client events respect DNT/GPC. No visitor identifiers in these counters." } : {}),
    ...(deep ?? {}),
  };
  return Response.json(body, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
