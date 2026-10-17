import "server-only";
import { upstash, upstashBreaker, upstashConfigured } from "./cache";
import { ddbConfigured, ddbGetStatus } from "./ddb";
import { llmConfigured, llmPaused } from "./llm";
import { searchEntities, withQlooSignal } from "./qloo";
import { s3Configured, s3GetStatus } from "./s3";

/**
 * Production misconfigurations that would quietly degrade the live site. Empty outside VERCEL_ENV=production, where
 * mock mode and missing backends are normal.
 */
export function configProblems(env: Record<string, string | undefined> = process.env): string[] {
  if (env.VERCEL_ENV !== "production") return [];
  const out: string[] = [];
  if (!(env.QLOO_MODE === "live" && env.QLOO_API_KEY)) out.push("qloo_mock_mode");
  if (Boolean(env.TURNSTILE_SECRET_KEY) !== Boolean(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)) out.push("turnstile_half_configured");
  if (Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) !== Boolean(env.CLERK_SECRET_KEY)) out.push("clerk_half_configured");
  if (!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)) out.push("no_upstash");
  return out;
}

export interface DepStatus {
  ok: boolean;
  ms: number;
  /** "off": not configured (not counted as degraded); otherwise a short reason. */
  note?: string;
}

export const DEEP_TIMEOUT_MS = 1500;

/** Runs one probe with a hard timeout. A probe returns true/undefined for healthy, false or a string (reason) for not. */
async function probe(fn: (signal: AbortSignal) => Promise<boolean | string | void>, timeoutMs = DEEP_TIMEOUT_MS): Promise<DepStatus> {
  const t0 = Date.now();
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<string>((resolve) => {
    timer = setTimeout(() => {
      ac.abort();
      resolve("timeout");
    }, timeoutMs);
  });
  try {
    const r = await Promise.race([fn(ac.signal), timeout]);
    const ms = Date.now() - t0;
    if (r === undefined || r === true) return { ok: true, ms };
    return { ok: false, ms, note: r === false ? "failed" : r };
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, note: String((err as Error)?.name ?? "error") };
  } finally {
    clearTimeout(timer);
  }
}

const off = (): DepStatus => ({ ok: true, ms: 0, note: "off" });

/**
 * Cheap live checks of every dependency, in parallel. No paid calls: the Qloo probe is one search that the shared
 * cache absorbs, and the LLM is judged by its paused flag only.
 */
export async function deepCheck(): Promise<{ deps: Record<string, DepStatus>; degraded: string[] }> {
  const checks: Record<string, () => Promise<DepStatus>> = {
    upstash: () =>
      upstashConfigured()
        ? probe(async () => {
            if (upstashBreaker().open) return "breaker_open";
            const out = await upstash([["PING"]]);
            return out?.[0] === "PONG" || "no_pong";
          })
        : Promise.resolve(off()),
    ddb: () =>
      ddbConfigured()
        ? probe(async () => {
            const r = await ddbGetStatus("CARD#0000-0000", "META", DEEP_TIMEOUT_MS);
            return r.status === "found" || r.status === "missing" || r.status;
          })
        : Promise.resolve(off()),
    // A 404 on the sentinel means S3 answered: that's all this checks.
    s3: () =>
      s3Configured()
        ? probe(async () => {
            const r = await s3GetStatus("health/sentinel.json", DEEP_TIMEOUT_MS);
            return r.status === "found" || r.status === "missing" || r.status;
          })
        : Promise.resolve(off()),
    // Qloo search is often 1.5–3s cold; a tight timeout would cry wolf.
    qloo: () => probe((signal) => withQlooSignal(signal, () => searchEntities("Nike", ["brand"], 1)).then(() => true), 6000),
    llm: () => Promise.resolve(llmConfigured() ? (llmPaused() ? { ok: false, ms: 0, note: "paused" } : { ok: true, ms: 0 }) : off()),
  };
  const names = Object.keys(checks);
  const settled = await Promise.allSettled(names.map((n) => checks[n]()));
  const deps: Record<string, DepStatus> = {};
  settled.forEach((r, i) => (deps[names[i]] = r.status === "fulfilled" ? r.value : { ok: false, ms: 0, note: "error" }));
  return { deps, degraded: names.filter((n) => !deps[n].ok) };
}
