import { clerkOn, currentUserId } from "@/lib/auth";
import { burnCard, regretOn, type RegretWhy } from "@/lib/burn";
import { ddbConfigured } from "@/lib/ddb";
import { allow } from "@/lib/ratelimit";
import { dustOn } from "@/lib/stardust";
import { TWIN_CODE } from "@/lib/twins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };
const REGRET_WHY: Record<RegretWhy, string> = {
  "used-up": "You've used both regrets. This one can only be retired.",
  "too-old": "Regrets are for the first 72 hours. This one can only be retired.",
  "not-newest": "Only your newest card can be regretted.",
  uncharged: "This card didn't cost a reading, so there's nothing to give back.",
};

/** Burns a card from the signed-in account's deck (docs/design/burn.md). Accounts only: without Clerk the feature doesn't exist. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!clerkOn() || !ddbConfigured()) return Response.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Sign in to burn cards.", reason: "signin" }, { status: 401, headers: NO_STORE });
  const code = decodeURIComponent((await params).code).toUpperCase();
  if (!TWIN_CODE.test(code)) return Response.json({ error: "bad code" }, { status: 400, headers: NO_STORE });
  if (!(await allow(`burn:u:${userId}`, 30, 10 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429, headers: NO_STORE });

  // { "regret": true } asks for a regret burn (docs/design/regret-burn.md) instead of an ordinary one.
  const regret = regretOn() && Boolean(((await request.json().catch(() => null)) as { regret?: unknown } | null)?.regret);
  const r = await burnCard(userId, code, Date.now(), regret);
  if (r.status === "not-eligible") return Response.json({ error: REGRET_WHY[r.why], reason: r.why }, { status: 409, headers: NO_STORE });
  if (r.status === "not-owner") return Response.json({ error: "That card isn't in your deck." }, { status: 404, headers: NO_STORE });
  if (r.status === "not-minted") return Response.json({ error: "Only cards you minted yourself can be burned." }, { status: 403, headers: NO_STORE });
  if (r.status === "error") return Response.json({ error: "Couldn't burn it just now. Try again in a moment." }, { status: 503, headers: { ...NO_STORE, "retry-after": "5" } });
  return Response.json({ ok: true, dustOn: dustOn(), ...r }, { headers: NO_STORE });
}
