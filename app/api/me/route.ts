import { clerkOn, currentUserId, isAdmin } from "@/lib/auth";
import { ddbConfigured } from "@/lib/ddb";
import { creditsOn, refillDays, wallet } from "@/lib/ledger";
import { deckMax } from "@/lib/deckCap";
import { deviceId, deviceIdsOn, newDevice } from "@/lib/device";
import { dustOn, dustStatus, rates } from "@/lib/stardust";
import { economy } from "@/lib/economy";
import { payDividend } from "@/lib/dividend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };
const REFS_NEEDED = Number(process.env.PROMO_REFS_NEEDED) || 5;

/** The signed-in account at a glance. Credits only when CREDITS_ON=1; referrals and promo are stubs until build steps 3 and 4. */
export async function GET(request: Request) {
  if (!clerkOn()) return Response.json({ accounts: false, signedIn: false }, { headers: NO_STORE });
  const userId = await currentUserId();
  if (!userId) return Response.json({ accounts: true, signedIn: false }, { headers: NO_STORE });
  const on = creditsOn();
  // Tag the browser before the first free grant, so one browser can't fund a first card for endless accounts.
  let device = deviceId(request.headers);
  let cookie: string | undefined;
  if (!device && on && deviceIdsOn()) ({ id: device, cookie } = newDevice());
  const dOn = dustOn();
  const div = dOn ? await payDividend(userId).catch(() => null) : null;
  const [w, ds] = await Promise.all([on ? wallet(userId, device) : null, dOn ? dustStatus(userId).catch(() => null) : null]);
  const res = Response.json(
    {
      accounts: true,
      signedIn: true,
      admin: await isAdmin(userId),
      creditsOn: on,
      credits: w?.credits ?? null,
      freeLeft: w?.freeLeft ?? null,
      // The monthly refill (identity-limits.md): when the next card is due, if the wallet is empty.
      refillAt: w?.refillAt ?? null,
      refillDays: refillDays(),
      deckMax: deckMax(),
      // Burning (docs/design/burn.md): available to every signed-in account with a deck; dust and its rates only with credits on.
      burnOn: ddbConfigured(),
      stardust: dOn ? { dust: ds?.dust ?? null, weekLeft: ds?.weekLeft ?? null, rates: rates(), economy: economy(), dividend: div } : null,
      refCode: null,
      refs: { pending: 0, qualified: 0, needed: REFS_NEEDED },
      promo: { eligible: false, claimed: false, slotsLeft: null },
      orders: [],
    },
    { headers: NO_STORE },
  );
  if (cookie) res.headers.append("set-cookie", cookie);
  return res;
}
