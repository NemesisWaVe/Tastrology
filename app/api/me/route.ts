import { clerkOn, currentUserId, isAdmin } from "@/lib/auth";
import { creditsOn, wallet } from "@/lib/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };
const REFS_NEEDED = Number(process.env.PROMO_REFS_NEEDED) || 5;

/** The signed-in account at a glance. Credits only when CREDITS_ON=1; referrals and promo are stubs until build steps 3 and 4. */
export async function GET() {
  if (!clerkOn()) return Response.json({ accounts: false, signedIn: false }, { headers: NO_STORE });
  const userId = await currentUserId();
  if (!userId) return Response.json({ accounts: true, signedIn: false }, { headers: NO_STORE });
  const on = creditsOn();
  const w = on ? await wallet(userId) : null;
  return Response.json(
    {
      accounts: true,
      signedIn: true,
      admin: await isAdmin(userId),
      creditsOn: on,
      credits: w?.credits ?? null,
      freeLeft: w?.freeLeft ?? null,
      refCode: null,
      refs: { pending: 0, qualified: 0, needed: REFS_NEEDED },
      promo: { eligible: false, claimed: false, slotsLeft: null },
      orders: [],
    },
    { headers: NO_STORE },
  );
}
