import { allow, clientId } from "@/lib/ratelimit";
import { getTwin, TWIN_CODE } from "@/lib/twins";

export const runtime = "nodejs";

/** Digital twin lookup by verify code. Twins are written by /api/agent at the end of a live run; there is no public write. */
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.toUpperCase() ?? "";
  if (!TWIN_CODE.test(code)) return Response.json({ error: "bad code" }, { status: 400 });
  if (!(await allow(`twin:${clientId(request.headers)}`, 120, 10 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429 });
  const card = await getTwin(code);
  if (!card) return Response.json({ card: null }, { status: 404, headers: { "cache-control": "public, max-age=60, s-maxage=60" } });
  return Response.json({ card }, { headers: { "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable" } });
}
