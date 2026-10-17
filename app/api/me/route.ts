import { clerkOn, currentUserId, isAdmin } from "@/lib/auth";
import { ddbConfigured } from "@/lib/ddb";
import { creditsOn, wallet } from "@/lib/ledger";
import { dustOn, dustStatus, rates } from "@/lib/stardust";

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
  const dOn = dustOn();
  const [w, ds] = await Promise.all([on ? wallet(userId) : null, dOn ? dustStatus(userId).catch(() => null) : null]);
  return Response.json(
    {
      accounts: true,
      signedIn: true,
      admin: await isAdmin(userId),
      creditsOn: on,
      credits: w?.credits ?? null,
      freeLeft: w?.freeLeft ?? null,
      // Burning (docs/design/burn.md): available to every signed-in account with a deck; dust and its rates only with credits on.
      burnOn: ddbConfigured(),
      stardust: dOn ? { dust: ds?.dust ?? null, weekLeft: ds?.weekLeft ?? null, rates: rates() } : null,
      refCode: null,
      refs: { pending: 0, qualified: 0, needed: REFS_NEEDED },
      promo: { eligible: false, claimed: false, slotsLeft: null },
      orders: [],
    },
    { headers: NO_STORE },
  );
}
