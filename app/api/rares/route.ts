import { census, styled } from "@/lib/cardStyle";
import { ddbConfigured, ddbQuery } from "@/lib/ddb";
import { allow, clientId } from "@/lib/ratelimit";
import { getTwinStatus } from "@/lib/twins";
import type { CardData } from "@/lib/card";
import { feedOrder } from "@/lib/hall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// short: a burned card has to leave the Hall within a minute, not five
const CACHE = { "cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=60" };
const PAGE_MAX = 8;

/** Day-seeded shuffle: the Hall reads in a fresh order each day, the same order all day (so paging is stable). */
function shuffled(xs: string[], seed: number): string[] {
  const a = [...xs];
  let x = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    x = (x * 16807) % 2147483647;
    const j = x % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The Hall of Rares: Holo and Secret cards real people pulled (from the pack pool), and how many exist.
 * Home asks for a teaser (?teaser=1: the first Secret and the first Holo). The Hall page pages through every one
 * (?cursor=N, PAGE_MAX at a time) and reads `total` to know when to loop.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  if (!ddbConfigured()) return Response.json({ cards: [], census: null, total: 0 }, { headers: CACHE });
  // The CDN serves most of these; this only bites a script busting the cache with query strings.
  if (!(await allow(`rares:${clientId(request.headers)}`, 60, 10 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429 });
  const [sec, holo, cen] = await Promise.all([
    ddbQuery("POOL#secret", "CARD#", 500, undefined, ["code"]).catch(() => null),
    ddbQuery("POOL#holo", "CARD#", 500, undefined, ["code"]).catch(() => null),
    census().catch(() => null),
  ]);
  // The tier counters started with numbering; the pool goes back further. Show whichever saw more.
  const count = { secret: Math.max(cen?.secret ?? 0, sec?.items.length ?? 0), holo: Math.max(cen?.holo ?? 0, holo?.items.length ?? 0) };
  const day = Math.floor(Date.now() / 86_400_000);
  const s = shuffled((sec?.items ?? []).map((x) => String(x.code)), day * 7 + 3);
  const h = shuffled((holo?.items ?? []).map((x) => String(x.code)), day * 13 + 5);
  const all = feedOrder(s, h);
  const teaser = q.get("teaser") === "1";
  const cursor = Math.max(0, Math.min(all.length, Number(q.get("cursor")) || 0));
  // the teaser: one of each tier, the best foot forward
  const codes = teaser ? [s[0], h[0]].filter(Boolean) : all.slice(cursor, cursor + PAGE_MAX);
  const cards = (
    await Promise.all(
      codes.map(async (code): Promise<{ code: string; card: CardData } | null> => {
        const t = await getTwinStatus(code).catch(() => null);
        return t?.card ? { code, card: await styled(code, t.card).catch(() => t.card!) } : null;
      }),
    )
  ).filter((x): x is { code: string; card: CardData } => Boolean(x));
  const next = teaser || cursor + PAGE_MAX >= all.length ? null : cursor + PAGE_MAX;
  return Response.json({ cards, census: count, total: all.length, next }, { headers: CACHE });
}
