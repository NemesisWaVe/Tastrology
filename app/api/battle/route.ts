import { after } from "next/server";
import { battle, ENGINE_V } from "@/lib/battle";
import { recordBattle } from "@/lib/stamps";
import { fromSheet, getFighterStatus, putFighterMemory, type FighterSheet } from "@/lib/fighters";
import { allow, clientId } from "@/lib/ratelimit";
import { s3Get, s3PutIfAbsent } from "@/lib/s3";
import { burnedAt, getTwin, TWIN_CODE } from "@/lib/twins";

export const runtime = "nodejs";

/** Battle of two registered fighters. Deterministic, so stored write-once and cached forever. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const a = q.get("a")?.toUpperCase() ?? "";
  const b = q.get("b")?.toUpperCase() ?? "";
  if (!TWIN_CODE.test(a) || !TWIN_CODE.test(b)) return Response.json({ error: "bad code" }, { status: 400 });
  // A card can't fight itself (it would also stamp its own passport).
  if (a === b) return Response.json({ error: "same card" }, { status: 400 });
  if (!(await allow(`battle:${clientId(request.headers)}`, 120, 10 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429 });
  // A burned card can't fight (docs/design/burn.md). A tombstone that can't be read fails open, like every optional store.
  const [ta, tb] = await Promise.all([burnedAt(a), burnedAt(b)]);
  if (ta || tb) return Response.json({ error: "burned", burned: ta ? a : b }, { status: 410, headers: { "cache-control": "public, max-age=60, s-maxage=60" } });
  const [la, lb] = await Promise.all([getFighterStatus(a), getFighterStatus(b)]);
  const fa = la.sheet;
  const fb = lb.sheet;
  if ((!fa && la.status === "error") || (!fb && lb.status === "error"))
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store", "retry-after": "5" } });
  if (!fa || !fb) return Response.json({ error: "unknown fighter" }, { status: 404, headers: { "cache-control": "public, max-age=30, s-maxage=30" } });
  const out = battle(fromSheet(fa), fromSheet(fb));
  // Sheets carry no images, so the cards come back from their twins (art, style, rarity number) when they can.
  const [twa, twb] = await Promise.all([getTwin(a).catch(() => null), getTwin(b).catch(() => null)]);
  if (twa?.art?.length) out.cards.a = { ...out.cards.a, art: twa.art, evolvesFrom: twa.evolvesFrom, living: twa.living, rarityNo: twa.rarityNo };
  if (twb?.art?.length) out.cards.b = { ...out.cards.b, art: twb.art, evolvesFrom: twb.evolvesFrom, living: twb.living, rarityNo: twb.rarityNo };
  const [x, y] = [a, b].sort();
  // Sides matter in the result, so a swapped order gets its own key.
  const key = `battles/v1/${x}_${y}_${ENGINE_V}${a === x ? "" : "_r"}.json`;
  if (!(await s3Get(key).catch(() => null))) {
    await s3PutIfAbsent(key, JSON.stringify(out)).catch(() => {});
    // Passport stamps (write-once per pair), after the response so a slow table never delays the fight.
    try {
      after(() => recordBattle(a, b, out).catch(() => {}));
    } catch {}
  }
  return Response.json({ result: out }, { headers: { "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=60" } });
}

/** Dev only: in mock mode (not live, not production), registers a sheet in memory so the route can be exercised without a live run. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" || (process.env.QLOO_MODE === "live" && process.env.QLOO_API_KEY)) return Response.json({ error: "not found" }, { status: 404 });
  const j = (await request.json().catch(() => null)) as { code?: string; sheet?: FighterSheet } | null;
  if (!j?.code || !TWIN_CODE.test(j.code) || !j.sheet) return Response.json({ error: "bad body" }, { status: 400 });
  putFighterMemory(j.code, j.sheet);
  return Response.json({ ok: true });
}
