import { clerkOn, currentUserId } from "@/lib/auth";
import { claimOpen } from "@/lib/brandOpen";
import { ddbConfigured } from "@/lib/ddb";
import { TWIN_CODE } from "@/lib/twins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };

/** The brand sheet was opened by its owner: break the week's seal and pay the open bonus if it's due. */
export async function POST(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!clerkOn() || !ddbConfigured()) return Response.json({ status: "off" }, { headers: NO_STORE });
  const userId = await currentUserId();
  if (!userId) return Response.json({ status: "signedout" }, { headers: NO_STORE });
  const code = decodeURIComponent((await params).code).toUpperCase();
  if (!TWIN_CODE.test(code)) return Response.json({ error: "bad code" }, { status: 400, headers: NO_STORE });
  return Response.json(await claimOpen(userId, code), { headers: NO_STORE });
}
