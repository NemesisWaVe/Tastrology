import { clerkOn, currentUserId } from "@/lib/auth";
import { claimDevice } from "@/lib/claim";
import { ddbConfigured } from "@/lib/ddb";
import { DEVICE_COOKIE, deviceId } from "@/lib/device";
import { allow, clientId } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };

/** Moves this device's anonymous deck into the signed-in account, once (see lib/claim.ts). Clears tm_d when every card made it. */
export async function POST(request: Request) {
  if (!clerkOn() || !ddbConfigured()) return Response.json({ enabled: false, moved: 0 }, { headers: NO_STORE });
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Sign in first.", reason: "signin" }, { status: 401, headers: NO_STORE });
  if (!(await allow(`claim:${clientId(request.headers)}`, 10, 10 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429 });
  const dev = deviceId(request.headers);
  if (!dev) return Response.json({ enabled: true, moved: 0 }, { headers: NO_STORE });

  const r = await claimDevice(userId, dev);
  if (!r.ok) {
    const other = r.reason === "other-account";
    return Response.json(
      { error: other ? "This device's cards already belong to another account." : "Couldn't move your cards. We'll try again next visit.", reason: r.reason },
      { status: other ? 409 : 503, headers: NO_STORE },
    );
  }
  const res = Response.json({ enabled: true, moved: r.moved }, { headers: NO_STORE });
  if (r.complete) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.headers.append("set-cookie", `${DEVICE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
  }
  return res;
}
