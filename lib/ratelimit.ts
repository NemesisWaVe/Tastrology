import { sharedCache } from "./cache";

const hits = sharedCache<number[]>("ratelimit", 5000);

/** Sliding window per key. Returns true when the request is allowed. */
export function allow(key: string, limit = 12, windowMs = 10 * 60 * 1000): boolean {
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
