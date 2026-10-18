import { census, styled } from "@/lib/cardStyle";
import { ddbConfigured, ddbQuery } from "@/lib/ddb";
import { allow, clientId } from "@/lib/ratelimit";
import { getTwinStatus } from "@/lib/twins";
import type { CardData } from "@/lib/card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = { "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=300" };

/** The Hall of Rares: Holo and Secret cards real people pulled (from the pack pool), and how many exist. */
export async function GET(request: Request) {
  if (!ddbConfigured()) return Response.json({ cards: [], census: null }, { headers: CACHE });
  // The CDN serves most of these; this only bites a script busting the cache with query strings.
  if (!(await allow(`rares:${clientId(request.headers)}`, 30, 10 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429 });
  const [sec, holo, cen] = await Promise.all([
    ddbQuery("POOL#secret", "CARD#", 500, undefined, ["code"]).catch(() => null),
    ddbQuery("POOL#holo", "CARD#", 500, undefined, ["code"]).catch(() => null),
    census().catch(() => null),
  ]);
  // The tier counters started with numbering; the pool goes back further. Show whichever saw more.
  const count = { secret: Math.max(cen?.secret ?? 0, sec?.items.length ?? 0), holo: Math.max(cen?.holo ?? 0, holo?.items.length ?? 0) };
  const codes = [...(sec?.items ?? []).slice(0, 8), ...(holo?.items ?? []).slice(0, 16)].map((x) => String(x.code)).slice(0, 12);
  const cards = (
    await Promise.all(
      codes.map(async (code): Promise<{ code: string; card: CardData } | null> => {
        const t = await getTwinStatus(code).catch(() => null);
        return t?.card ? { code, card: await styled(code, t.card).catch(() => t.card!) } : null;
      }),
    )
  ).filter((x): x is { code: string; card: CardData } => Boolean(x));
  return Response.json({ cards, census: count }, { headers: CACHE });
}
