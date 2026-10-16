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

/** Client IP from the platform headers (Vercel sets x-real-ip / x-vercel-forwarded-for). */
export function clientIp(headers: Headers): string {
  const first = (h: string) => headers.get(h)?.split(",")[0]?.trim();
  return first("x-real-ip") || first("x-vercel-forwarded-for") || first("x-forwarded-for") || "local";
}
