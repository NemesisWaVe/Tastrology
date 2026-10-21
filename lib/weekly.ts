import "server-only";
import { kvCache, MAX_TTL_MS } from "./cache";
import { insights, withQlooLane } from "./qloo";
import { isoWeek, signById, type Sign } from "./signs";
import type { EntityKind, QEntity } from "./types";

/**
 * The weekly reading for a sign: three brands Qloo describes in the sign's style, picked for this week, then what
 * people who love those three listen to and watch (Qloo cross-domain affinity). Three Qloo calls per sign, shared by
 * everyone with that sign and kept for MAX_TTL_MS (the cap on holding Qloo data), so the cost is flat at any scale.
 * The week seeds the pick, so a refetch inside the same week lands on the same three.
 */
export interface Pick {
  id: string;
  name: string;
  image?: string;
  kind: EntityKind;
}

export interface Weekly {
  sign: string;
  week: string;
  /** Monday the week began (ms, UTC). */
  start: number;
  brands: Pick[];
  listen: Pick | null;
  watch: Pick | null;
  line: string;
}

const cache = kvCache<Weekly>("weekly-v2", 50, MAX_TTL_MS);
/** Brands the week's pick rotates through, sorted by Qloo's own order. */
const POOL = 20;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const pick = (e: QEntity): Pick => ({ id: e.id, name: e.name, image: e.image, kind: e.kind });

/** Three distinct brands from the pool, fixed for the week: pictures first, so the page has faces. */
export function weekPick<T extends { image?: string }>(pool: T[], seed: number, n = 3): T[] {
  const ordered = [...pool.filter((e) => e.image), ...pool.filter((e) => !e.image)];
  if (ordered.length <= n) return ordered;
  const start = seed % ordered.length;
  const step = 1 + ((seed >>> 8) % (ordered.length - 1));
  const used = new Set<number>();
  for (let i = 0; used.size < n; i++) {
    let k = (start + i * step) % ordered.length;
    while (used.has(k)) k = (k + 1) % ordered.length;
    used.add(k);
  }
  return [...used].map((k) => ordered[k]);
}

/** The week's one line, from the sign's moods and the picks. Deterministic, no model call. */
export function weekLine(s: Sign, seed: number, w: Pick[], listen: Pick | null, watch: Pick | null): string {
  const mood = s.moods[seed % 3];
  const [a, b, c] = w.map((x) => x.name);
  const lines = [
    a && b && c && `A ${mood} week. ${a} sets the tone, ${b} carries it, and ${c} is for the night out.`,
    a && listen && `Make it a ${mood} week: start with ${a} and put ${listen.name} on.`,
    a && watch && `${s.name}s go ${mood} this week: ${a} by day, ${watch.name} by night.`,
    a && b && listen && `Keep it ${mood}. ${a} and ${b}, with ${listen.name} in your ears.`,
  ].filter((x): x is string => Boolean(x));
  return lines.length ? lines[(seed >>> 4) % lines.length] : `A ${mood} week for ${s.name}s.`;
}

export async function weeklyReading(id: string, now = Date.now()): Promise<Weekly | null> {
  const s = signById(id);
  if (!s) return null;
  const { key: week, start } = isoWeek(now);
  const ck = `${week}:${s.id}`;
  const had = await cache.get(ck).catch(() => undefined);
  if (had) return had;
  const seed = hash(ck);
  try {
    const out = await withQlooLane("warm", async () => {
      const pool = await insights({ type: "brand", entityIds: [], filterTags: [`urn:tag:personal_style:qloo:${s.tag}`], popularity: { min: 0.3, max: 0.97 }, take: POOL });
      const brands = weekPick(pool, seed).map(pick);
      if (!brands.length) return null;
      const ids = brands.map((b) => b.id);
      const [artists, movies] = await Promise.all([
        insights({ type: "artist", entityIds: ids, take: 5 }).catch(() => []),
        insights({ type: "movie", entityIds: ids, take: 5 }).catch(() => []),
      ]);
      const listen = artists.length ? pick(artists[(seed >>> 3) % artists.length]) : null;
      const watch = movies.length ? pick(movies[(seed >>> 5) % movies.length]) : null;
      return { sign: s.id, week, start, brands, listen, watch, line: weekLine(s, seed, brands, listen, watch) } satisfies Weekly;
    });
    if (out) await cache.set(ck, out).catch(() => {});
    return out;
  } catch (err) {
    console.warn(JSON.stringify({ evt: "weekly_fail", sign: s.id, err: String((err as Error)?.message ?? err).slice(0, 120) }));
    return null;
  }
}
