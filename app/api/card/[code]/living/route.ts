import { clerkOn, currentUserId } from "@/lib/auth";
import { ddbConfigured } from "@/lib/ddb";
import { allow } from "@/lib/ratelimit";
import { buyLiving, LIVING_DUST } from "@/lib/recast";
import { dustOn } from "@/lib/stardust";
import { getTwinStatus, TWIN_CODE } from "@/lib/twins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };
const WHY = {
  has: [409, "This card's sigils are already alive."],
  "not-owner": [403, "You can wake the sigils on cards you minted."],
  poor: [402, `Living sigils cost ${LIVING_DUST} Stardust.`],
  error: [503, "Couldn't do that just now. No Stardust was taken."],
} as const;

/** Living sigils for one of your cards, paid in earned Stardust. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!clerkOn() || !dustOn() || !ddbConfigured()) return Response.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Sign in first.", reason: "signin" }, { status: 401, headers: NO_STORE });
  if (!(await allow(`living:${userId}`, 10, 10 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429, headers: NO_STORE });
  const code = decodeURIComponent((await params).code).toUpperCase();
  if (!TWIN_CODE.test(code)) return Response.json({ error: "bad code" }, { status: 400, headers: NO_STORE });
  const t = await getTwinStatus(code);
  if (!t.card) return Response.json({ error: "Card not found." }, { status: 404, headers: NO_STORE });
  const r = await buyLiving(userId, code, t.card.rarity);
  if (r === "bought") return Response.json({ ok: true }, { headers: NO_STORE });
  const [status, error] = WHY[r];
  return Response.json({ error, reason: r }, { status, headers: NO_STORE });
}
