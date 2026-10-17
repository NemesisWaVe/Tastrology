import { createHash } from "node:crypto";
import { sharedCache, upstash, upstashConfigured } from "./cache";

const hits = sharedCache<number[]>("ratelimit", 5000);

/**
 * Per-key limit. Upstash (when configured): fixed window shared by every instance.
 * Otherwise: in-memory sliding window on this instance. Returns true when the request is allowed.
 */
export async function allow(key: string, limit = 30, windowMs = 10 * 60 * 1000): Promise<boolean> {
  if (upstashConfigured()) {
    const bucket = Math.floor(Date.now() / windowMs);
    const k = `tm:rl:${key}:${bucket}`;
    const out = await upstash([["INCR", k], ["PEXPIRE", k, windowMs]]);
    if (out && typeof out[0] === "number") return out[0] <= limit;
    // Redis unreachable: fall through to the local limiter rather than failing open or closed.
  }
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  return true;
}

/** First 4 groups of an IPv6 address (its /64), lowercase, zero-padded. Null when `ip` isn't IPv6. */
function v6Prefix(ip: string): string | null {
  if (!ip.includes(":")) return null;
  const [head, tail] = ip.split("::");
  const a = head ? head.split(":") : [];
  const b = tail === undefined ? [] : tail ? tail.split(":") : [];
  const groups = tail === undefined ? a : [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b];
  return groups.slice(0, 4).map((x) => x.toLowerCase().padStart(4, "0")).join(":");
}

/** Client IP. On Vercel only x-real-ip is trusted (the rest can be spoofed); elsewhere the usual proxy headers. IPv6 collapses to its /64. */
export function clientIp(headers: Headers): string {
  const first = (h: string) => headers.get(h)?.split(",")[0]?.trim();
  let ip = process.env.VERCEL
    ? first("x-real-ip") || "local"
    : first("x-real-ip") || first("x-vercel-forwarded-for") || first("x-forwarded-for") || "local";
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) ip = mapped[1];
  const p = v6Prefix(ip);
  return p ? `${p}::/64` : ip;
}

/** Rate-limit identity: salted hash of the client IP, so raw addresses never reach Redis keys. */
export function clientId(headers: Headers): string {
  return createHash("sha256").update((process.env.RL_SALT || "") + clientIp(headers)).digest("hex").slice(0, 16);
}

/* ------------------------------------------------------------ daily counters */

const day = () => new Date().toISOString().slice(0, 10);
const counts = sharedCache<number>("daycount", 50);
const DAY_MS = 26 * 60 * 60 * 1000;

/** Counts one event for today (UTC) under `tm:<name>:<YYYY-MM-DD>`: Upstash INCR+EXPIRE, memory fallback. Returns the new count. */
export async function bumpDaily(name: string): Promise<number> {
  const k = `${name}:${day()}`;
  let n = (counts.get(k) ?? 0) + 1;
  const out = await upstash([["INCR", `tm:${k}`], ["EXPIRE", `tm:${k}`, 2 * 24 * 3600]]);
  if (out && typeof out[0] === "number") n = Math.max(n, out[0]);
  counts.set(k, n, DAY_MS);
  return n;
}

/** Today's count as this instance knows it (sync). The first look on a cold instance pulls the shared value in the background. */
export function peekDaily(name: string): number {
  const k = `${name}:${day()}`;
  const n = counts.get(k);
  if (n === undefined) {
    counts.set(k, 0, DAY_MS);
    void upstash([["GET", `tm:${k}`]]).then((o) => {
      const v = Number(o?.[0]);
      if (v > (counts.get(k) ?? 0)) counts.set(k, v, DAY_MS);
    });
  }
  return n ?? 0;
}

/* ------------------------------------------------------------ global run slots */

const localSlots = sharedCache<number>("slots", 50);

/**
 * Takes one of `max` global slots for up to `ttlMs` (a lease that expires on its own if the instance dies).
 * Upstash: a sorted set of lease tokens scored by expiry, shared by every instance. Memory fallback: a per-instance count.
 * Returns a release function, or null when every slot is taken.
 */
export async function acquireSlot(name: string, max: number, ttlMs: number): Promise<(() => Promise<void>) | null> {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  if (upstashConfigured()) {
    const k = `tm:slots:${name}`;
    const now = Date.now();
    const out = await upstash([
      ["ZREMRANGEBYSCORE", k, "-inf", now],
      ["ZADD", k, now + ttlMs, token],
      ["ZCARD", k],
      ["PEXPIRE", k, ttlMs * 2],
    ]);
    if (out && typeof out[2] === "number") {
      if (out[2] > max) {
        await upstash([["ZREM", k, token]]);
        return null;
      }
      return async () => {
        await upstash([["ZREM", k, token]]);
      };
    }
    // Redis unreachable: fall back to this instance's count.
  }
  const n = localSlots.get(name) ?? 0;
  if (n >= max) return null;
  localSlots.set(name, n + 1, ttlMs);
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    localSlots.set(name, Math.max(0, (localSlots.get(name) ?? 1) - 1), ttlMs);
  };
}

/** Today's shared count (Upstash), else this instance's. For the health endpoint. */
export async function readDaily(name: string): Promise<number> {
  const k = `${name}:${day()}`;
  const out = await upstash([["GET", `tm:${k}`]]);
  const v = Number(out?.[0]);
  return Number.isFinite(v) && v > 0 ? v : (counts.get(k) ?? 0);
}
