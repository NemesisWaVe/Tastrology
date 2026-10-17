import { allow, clientId } from "@/lib/ratelimit";
import { getStamps } from "@/lib/stamps";
import { TWIN_CODE } from "@/lib/twins";

export const runtime = "nodejs";

/** A card's battle stamps for its passport page. Public, like the card itself; cached briefly at the edge. */
export async function GET(request: Request) {
  const code = (new URL(request.url).searchParams.get("code") ?? "").toUpperCase();
  if (!TWIN_CODE.test(code)) return Response.json({ error: "bad code" }, { status: 400 });
  if (!(await allow(`stamps:${clientId(request.headers)}`, 120, 10 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429 });
  const stamps = await getStamps(code).catch(() => null);
  return Response.json({ stamps }, { headers: { "cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=60" } });
}
