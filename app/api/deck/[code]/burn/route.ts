import { clerkOn, currentUserId } from "@/lib/auth";
import { burnCard } from "@/lib/burn";
import { ddbConfigured } from "@/lib/ddb";
import { allow } from "@/lib/ratelimit";
import { dustOn } from "@/lib/stardust";
import { TWIN_CODE } from "@/lib/twins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };

/** Burns a card from the signed-in account's deck (docs/design/burn.md). Accounts only: without Clerk the feature doesn't exist. */
export async function POST(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!clerkOn() || !ddbConfigured()) return Response.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Sign in to burn cards.", reason: "signin" }, { status: 401, headers: NO_STORE });
  const code = decodeURIComponent((await params).code).toUpperCase();
  if (!TWIN_CODE.test(code)) return Response.json({ error: "bad code" }, { status: 400, headers: NO_STORE });
  if (!(await allow(`burn:u:${userId}`, 30, 10 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429, headers: NO_STORE });

  const r = await burnCard(userId, code);
  if (r.status === "not-owner") return Response.json({ error: "That card isn't in your deck." }, { status: 404, headers: NO_STORE });
  if (r.status === "not-minted") return Response.json({ error: "Only cards you minted yourself can be burned." }, { status: 403, headers: NO_STORE });
  if (r.status === "error") return Response.json({ error: "Couldn't burn it just now. Try again in a moment." }, { status: 503, headers: { ...NO_STORE, "retry-after": "5" } });
  return Response.json({ ok: true, dustOn: dustOn(), ...r }, { headers: NO_STORE });
}
