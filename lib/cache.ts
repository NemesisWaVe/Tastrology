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

  set(k: string, v: V) {
    this.map.delete(k);
    this.map.set(k, { v, exp: Date.now() + this.ttlMs });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }
}

const g = globalThis as unknown as { __tmCaches?: Record<string, LRU<unknown>> };
export function sharedCache<V>(name: string, max?: number): LRU<V> {
  g.__tmCaches ??= {};
  g.__tmCaches[name] ??= new LRU<unknown>(max);
  return g.__tmCaches[name] as LRU<V>;
}
