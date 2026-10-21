import { clerkOn, currentUserId, deleteClerkUser } from "@/lib/auth";
import { ddbConfigured } from "@/lib/ddb";
import { allow } from "@/lib/ratelimit";
import { wipeAccount } from "@/lib/wipe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "cache-control": "private, no-store" };

/**
 * DELETE: closes the account. Everything goes first (lib/wipe.ts): friends, requests and open bouts (stakes are
 * returned), username and player code, wallet and deck, and every card this person minted. Then the Clerk account is
 * deleted, which signs the person out everywhere (its user.deleted webhook finds nothing left).
 */
export async function DELETE() {
  if (!clerkOn()) return Response.json({ error: "Accounts aren't on." }, { status: 404, headers: NO_STORE });
  const uid = await currentUserId();
  if (!uid) return Response.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE });
  if (!(await allow(`account-delete:${uid}`, 3, 10 * 60 * 1000))) return Response.json({ error: "Slow down a little." }, { status: 429, headers: NO_STORE });
  if (ddbConfigured() && !(await wipeAccount(uid))) return Response.json({ error: "Couldn't reach the server. Try again." }, { status: 503, headers: NO_STORE });
  if (!(await deleteClerkUser(uid))) return Response.json({ error: "Couldn't close the account. Try again." }, { status: 503, headers: NO_STORE });
  return Response.json({ ok: true }, { headers: NO_STORE });
}
