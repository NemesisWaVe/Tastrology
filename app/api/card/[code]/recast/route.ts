import { clerkOn, currentUserId } from "@/lib/auth";
import { ddbConfigured } from "@/lib/ddb";
import { allow } from "@/lib/ratelimit";
import { LENSES, RECAST_DUST, recastCard, recastOn, recastsOf, seasonOf } from "@/lib/recast";
import { TWIN_CODE } from "@/lib/twins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };
const WHY: Record<string, [number, string]> = {
  "not-owner": [403, "You can recast cards you minted."],
  "bad-lens": [400, "Pick a territory."],
  "too-soon": [409, "This card was cast into that territory this week. Try another, or come back in a few days."],
  "no-receipt": [409, "Open \"What it pulled in\" on this card first, so we know its loves."],
  poor: [402, `A recast costs ${RECAST_DUST} Stardust.`],
  busy: [503, "Recasts are resting for today. Try again tomorrow."],
  empty: [200, "Nothing in that territory pulled toward this card. No Stardust was taken."],
  error: [503, "Couldn't reach the stars just now. No Stardust was taken."],
};

const codeOf = async (params: Promise<{ code: string }>) => decodeURIComponent((await params).code).toUpperCase();

/** The card's recasts, the territories and this month's featured one. Public: recasts show on the card's page too. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = await codeOf(params);
  if (!TWIN_CODE.test(code)) return Response.json({ error: "bad code" }, { status: 400 });
  const on = recastOn() && ddbConfigured();
  return Response.json(
    { on, cost: RECAST_DUST, lenses: LENSES.map(({ id, label }) => ({ id, label })), season: seasonOf(), rows: on ? await recastsOf(code) : [] },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!clerkOn() || !recastOn() || !ddbConfigured()) return Response.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Sign in to recast.", reason: "signin" }, { status: 401, headers: NO_STORE });
  if (!(await allow(`recast:${userId}`, 10, 10 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429, headers: NO_STORE });
  const code = await codeOf(params);
  if (!TWIN_CODE.test(code)) return Response.json({ error: "bad code" }, { status: 400, headers: NO_STORE });
  const body = (await request.json().catch(() => ({}))) as { lens?: string };
  const r = await recastCard(userId, code, String(body.lens ?? ""));
  if (r.status === "recast") return Response.json({ row: r.row }, { headers: NO_STORE });
  const [status, error] = WHY[r.status] ?? WHY.error;
  return Response.json({ error, reason: r.status }, { status, headers: NO_STORE });
}
