import { clerkOn, currentUserId } from "@/lib/auth";
import { collection, openPack, PACK_DUST, PACK_ODDS, packsOn, utcDay } from "@/lib/packs";
import { allow } from "@/lib/ratelimit";
import { dustStatus } from "@/lib/stardust";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };
const off = () => Response.json({ on: false, cost: PACK_DUST, odds: PACK_ODDS }, { headers: NO_STORE });

/** Battle Packs: price, odds, your Stardust, today's pack and your collection. */
export async function GET() {
  if (!clerkOn() || !packsOn()) return off();
  const userId = await currentUserId();
  if (!userId) return Response.json({ on: true, signedIn: false, cost: PACK_DUST, odds: PACK_ODDS }, { headers: NO_STORE });
  const [ds, col] = await Promise.all([dustStatus(userId).catch(() => null), collection(userId).catch(() => [])]);
  const today = col.find((p) => p.day === utcDay(Date.now())) ?? null;
  return Response.json({ on: true, signedIn: true, cost: PACK_DUST, odds: PACK_ODDS, dust: ds?.dust ?? null, today, collection: col }, { headers: NO_STORE });
}

/** Opens today's pack (one a day, Stardust only). */
export async function POST() {
  if (!clerkOn() || !packsOn()) return Response.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Sign in to open packs.", reason: "signin" }, { status: 401, headers: NO_STORE });
  if (!(await allow(`pack:u:${userId}`, 20, 10 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429, headers: NO_STORE });
  const r = await openPack(userId);
  if (r.status === "poor") return Response.json({ error: `A pack costs ${PACK_DUST} Stardust. Retire or regret cards to earn it.`, reason: "poor" }, { status: 402, headers: NO_STORE });
  if (r.status === "empty") return Response.json({ error: "The market is restocking. Come back once more people have made cards.", reason: "empty" }, { status: 409, headers: NO_STORE });
  if (r.status === "error") return Response.json({ error: "Couldn't open it just now. Try again in a moment." }, { status: 503, headers: { ...NO_STORE, "retry-after": "5" } });
  const col = await collection(userId, 1).catch(() => []);
  return Response.json({ ok: true, status: r.status, day: "day" in r ? r.day : "", cards: col[0]?.cards ?? [] }, { headers: NO_STORE });
}
