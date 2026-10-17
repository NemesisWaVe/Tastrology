import { createHash } from "node:crypto";
import type { Lookup } from "./lookup";

/** Tiny in-memory LRU with TTL. Survives across requests on a warm serverless instance. */
export class LRU<V> {
  private map = new Map<string, { v: V; exp: number }>();
  constructor(private max = 500, private ttlMs = 6 * 60 * 60 * 1000) {}

  get(k: string): V | undefined {
    const hit = this.map.get(k);
    if (!hit) return undefined;
    if (hit.exp < Date.now()) {
      this.map.delete(k);
      return undefined;
    }
    this.map.delete(k);
    this.map.set(k, hit);
    return hit.v;
  }

  delete(k: string) {
    this.map.delete(k);
  }

  set(k: string, v: V, ttlMs = this.ttlMs) {
    this.map.delete(k);
    this.map.set(k, { v, exp: Date.now() + ttlMs });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }
}

const g = globalThis as unknown as { __tmCaches?: Record<string, LRU<unknown>> };
export function sharedCache<V>(name: string, max?: number): LRU<V> {
  g.__tmCaches ??= {};
  g.__tmCaches[name] ??= new LRU<unknown>(max);
  return g.__tmCaches[name] as LRU<V>;
}

/* ------------------------------------------------------------ Upstash */

/** Hard cap for anything written to shared storage (Qloo data included). */
export const MAX_TTL_MS = 6 * 60 * 60 * 1000;

export const upstashConfigured = () => Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
export const storeMode = (): "upstash" | "memory" => (upstashConfigured() ? "upstash" : "memory");

/**
 * Circuit breaker: after BREAKER_FAILS consecutive failures or timeouts, Upstash is skipped for BREAKER_OPEN_MS and
 * every caller takes its memory fallback at once, instead of each one waiting out a 1.5s timeout. The next call after
 * the window is a trial: success closes the breaker, failure opens it again.
 */
export const BREAKER_FAILS = 3;
export const BREAKER_OPEN_MS = 30_000;
const gb = globalThis as unknown as { __tmUpstashBreaker?: { fails: number; openUntil: number } };
const breaker = (gb.__tmUpstashBreaker ??= { fails: 0, openUntil: 0 });

export function upstashBreaker(): { open: boolean; fails: number; openUntil: number } {
  return { open: Date.now() < breaker.openUntil, fails: breaker.fails, openUntil: breaker.openUntil };
}
/** Tests only. */
export function resetUpstashBreaker() {
  breaker.fails = 0;
  breaker.openUntil = 0;
}
function upstashFailed() {
  if (++breaker.fails >= BREAKER_FAILS) {
    breaker.openUntil = Date.now() + BREAKER_OPEN_MS;
    breaker.fails = 0;
    console.warn(JSON.stringify({ evt: "upstash_breaker_open", ms: BREAKER_OPEN_MS }));
  }
}

/**
 * Runs Redis commands through Upstash's REST API (plain fetch, no SDK).
 * Returns null on any failure, or while the breaker is open: shared state is an optimization, never a hard dependency.
 */
export async function upstash(commands: (string | number)[][]): Promise<unknown[] | null> {
  if (!upstashConfigured()) return null;
  if (Date.now() < breaker.openUntil) return null;
  try {
    const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL!.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    if (!res.ok) {
      upstashFailed();
      return null;
    }
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    breaker.fails = 0;
    return out.map((x) => (x.error ? null : x.result));
  } catch {
    upstashFailed();
    return null;
  }
}

/** GET one key, tri-state (see lib/lookup.ts). */
export async function upstashGetStatus(key: string): Promise<Lookup<string>> {
  if (!upstashConfigured()) return { status: "off" };
  const out = await upstash([["GET", key]]);
  if (!out) return { status: "error" };
  return typeof out[0] === "string" ? { status: "found", value: out[0] } : { status: "missing" };
}

/** Async cache: in-memory LRU in front, Upstash Redis behind it when configured. */
export interface KV<V> {
  get(k: string): Promise<V | undefined>;
  /** `ttlMs` shortens the cache's own TTL for this entry (never lengthens it past the cap). */
  set(k: string, v: V, ttlMs?: number): Promise<void>;
}

export function kvCache<V>(name: string, max = 500, ttlMs = MAX_TTL_MS): KV<V> {
  const mem = sharedCache<V>(name, max);
  const ttl = Math.min(ttlMs, MAX_TTL_MS);
  const rk = (k: string) => `tm:${name}:${createHash("sha1").update(k).digest("base64url")}`;
  return {
    async get(k) {
      const hit = mem.get(k);
      if (hit !== undefined || !upstashConfigured()) return hit;
      const [raw] = (await upstash([["GET", rk(k)]])) ?? [];
      if (typeof raw !== "string") return undefined;
      try {
        const v = JSON.parse(raw) as V;
        mem.set(k, v, ttl);
        return v;
      } catch {
        return undefined;
      }
    },
    async set(k, v, ttlMs) {
      const t = ttlMs ? Math.min(ttlMs, ttl) : ttl;
      mem.set(k, v, t);
      if (upstashConfigured()) await upstash([["SET", rk(k), JSON.stringify(v), "PX", t]]);
    },
  };
}
