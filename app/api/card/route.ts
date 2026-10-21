import { allow, clientId } from "@/lib/ratelimit";
import { getTwinStatus, TWIN_CODE } from "@/lib/twins";
import { styled } from "@/lib/cardStyle";

export const runtime = "nodejs";

/** Digital twin lookup by verify code. Twins are written by /api/agent at the end of a live run; there is no public write. */
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.toUpperCase() ?? "";
  if (!TWIN_CODE.test(code)) return Response.json({ error: "bad code" }, { status: 400 });
  if (!(await allow(`twin:${clientId(request.headers)}`, 120, 10 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429 });
  const r = await getTwinStatus(code);
  const { status, card } = r;
  // Burned by its owner (docs/design/burn.md): gone, not missing. Never cached: a fresh reading of the same loves revives it.
  if (r.status === "burned") return Response.json({ card: null, burned: true, burnedAt: r.at }, { status: 410, headers: { "cache-control": "no-store" } });
  // A storage blip is not a 404: answer 503 and keep it out of every cache so the next try can find the card.
  if (status === "error") return Response.json({ card: null, error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store", "retry-after": "5" } });
  // a card minted a moment ago must not be hidden behind a cached "not found"
  if (!card) return Response.json({ card: null }, { status: 404, headers: { "cache-control": "no-store" } });
  // No shared cache: a burn has to take the card down on the very next view (a CDN copy kept it up for minutes after
  // it was burned). The browser may keep its copy but must check back each time.
  return Response.json({ card: await styled(code, card).catch(() => card) }, { headers: { "cache-control": "private, no-cache" } });
}
