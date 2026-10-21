import { createHmac, timingSafeEqual } from "node:crypto";
import { wipeAccount } from "@/lib/wipe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Clerk webhooks (Svix-signed). Only user.deleted matters: a user removed in the Clerk dashboard (or by Clerk itself)
 * gets the same full erase as Close account (lib/wipe.ts). Set CLERK_WEBHOOK_SIGNING_SECRET (whsec_…) in Vercel and
 * point a Clerk endpoint at /api/clerk-webhook subscribed to user.deleted. A failed wipe answers 500, so Svix retries.
 */
export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) return Response.json({ error: "webhook off" }, { status: 404 });
  const body = await request.text();
  if (!verify(secret, request.headers, body)) return Response.json({ error: "bad signature" }, { status: 401 });
  let evt: { type?: string; data?: { id?: string } };
  try {
    evt = JSON.parse(body);
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }
  if (evt.type !== "user.deleted") return Response.json({ ok: true, ignored: evt.type });
  const uid = evt.data?.id;
  if (!uid || !/^user_[A-Za-z0-9]+$/.test(uid)) return Response.json({ error: "no user" }, { status: 400 });
  const ok = await wipeAccount(uid).catch(() => false);
  console.log(JSON.stringify({ evt: "account_wiped", via: "clerk", ok }));
  return ok ? Response.json({ ok: true }) : Response.json({ error: "wipe failed" }, { status: 500 });
}

/** Svix scheme: HMAC-SHA256 over "<id>.<timestamp>.<body>" with the base64 key after "whsec_"; 5-minute clock window. */
function verify(secret: string, h: Headers, body: string): boolean {
  const id = h.get("svix-id");
  const ts = h.get("svix-timestamp");
  const sigs = h.get("svix-signature");
  if (!id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const want = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest();
  return sigs.split(" ").some((part) => {
    const [v, sig] = part.split(",");
    if (v !== "v1" || !sig) return false;
    const got = Buffer.from(sig, "base64");
    return got.length === want.length && timingSafeEqual(got, want);
  });
}
