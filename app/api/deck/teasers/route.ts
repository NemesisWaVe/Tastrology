import { clerkOn, currentUserId } from "@/lib/auth";
import { teasers } from "@/lib/brandOpen";
import { ddbConfigured, ddbQuery } from "@/lib/ddb";
import { allow } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };

/** Per card in your deck: the brand that peeks out, how many are new this week, and whether this week's seal is broken. */
export async function GET() {
  if (!clerkOn() || !ddbConfigured()) return Response.json({ teasers: {} }, { headers: NO_STORE });
  const userId = await currentUserId();
  if (!userId || !(await allow(`teasers:${userId}`, 60, 10 * 60 * 1000))) return Response.json({ teasers: {} }, { headers: NO_STORE });
  const page = await ddbQuery(`OWNER#${userId}`, "CARD#", 20, undefined, ["code", "minted"]).catch(() => null);
  const codes = (page?.items ?? []).filter((x) => Number(x.minted) === 1).map((x) => String(x.code));
  return Response.json({ teasers: await teasers(userId, codes).catch(() => ({})) }, { headers: NO_STORE });
}
