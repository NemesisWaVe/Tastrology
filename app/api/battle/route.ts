import { battle, ENGINE_V } from "@/lib/battle";
import { fromSheet, getFighter, putFighterMemory, type FighterSheet } from "@/lib/fighters";
import { allow, clientId } from "@/lib/ratelimit";
import { s3Get, s3PutIfAbsent } from "@/lib/s3";
import { TWIN_CODE } from "@/lib/twins";

export const runtime = "nodejs";

/** Battle of two registered fighters. Deterministic, so stored write-once and cached forever. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const a = q.get("a")?.toUpperCase() ?? "";
  const b = q.get("b")?.toUpperCase() ?? "";
  if (!TWIN_CODE.test(a) || !TWIN_CODE.test(b)) return Response.json({ error: "bad code" }, { status: 400 });
  if (!(await allow(`battle:${clientId(request.headers)}`, 120, 10 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429 });
  const [fa, fb] = await Promise.all([getFighter(a), getFighter(b)]);
  if (!fa || !fb) return Response.json({ error: "unknown fighter" }, { status: 404, headers: { "cache-control": "public, max-age=30, s-maxage=30" } });
  const out = battle(fromSheet(fa), fromSheet(fb));
  const [x, y] = [a, b].sort();
  // Sides matter in the result, so a swapped order gets its own key.
  const key = `battles/v1/${x}_${y}_${ENGINE_V}${a === x ? "" : "_r"}.json`;
  if (!(await s3Get(key).catch(() => null))) await s3PutIfAbsent(key, JSON.stringify(out)).catch(() => {});
  return Response.json({ result: out }, { headers: { "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable" } });
}

/** Dev only: in mock mode (not live, not production), registers a sheet in memory so the route can be exercised without a live run. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" || (process.env.QLOO_MODE === "live" && process.env.QLOO_API_KEY)) return Response.json({ error: "not found" }, { status: 404 });
  const j = (await request.json().catch(() => null)) as { code?: string; sheet?: FighterSheet } | null;
  if (!j?.code || !TWIN_CODE.test(j.code) || !j.sheet) return Response.json({ error: "bad body" }, { status: 400 });
  putFighterMemory(j.code, j.sheet);
  return Response.json({ ok: true });
}
