import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Anonymous device identity for the deck: a random id in a signed, HttpOnly cookie. No account, no PII.
 * Signing key: DECK_SECRET (falls back to RL_SALT). Without one, decks are off.
 */
export const DEVICE_COOKIE = "tm_d";
const MAX_AGE_S = 400 * 24 * 3600;
const ID_RE = /^[0-9a-f-]{36}$/;

const secret = () => process.env.DECK_SECRET || process.env.RL_SALT || "";
export const deviceIdsOn = () => secret().length >= 16;
const sign = (id: string) => createHmac("sha256", `device|${secret()}`).update(id).digest("base64url").slice(0, 32);

/** The device id from a valid cookie, else null. */
export function deviceId(headers: Headers): string | null {
  if (!deviceIdsOn()) return null;
  for (const part of (headers.get("cookie") ?? "").split(";")) {
    const [k, v] = part.trim().split("=");
    if (k !== DEVICE_COOKIE || !v) continue;
    const [id, sig] = v.split(".");
    if (!id || !sig || !ID_RE.test(id)) return null;
    const want = Buffer.from(sign(id));
    const got = Buffer.from(sig);
    return want.length === got.length && timingSafeEqual(want, got) ? id : null;
  }
  return null;
}

/** A fresh device id and its Set-Cookie header. */
export function newDevice(): { id: string; cookie: string } {
  const id = randomUUID();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return { id, cookie: `${DEVICE_COOKIE}=${id}.${sign(id)}; Path=/; Max-Age=${MAX_AGE_S}; HttpOnly; SameSite=Lax${secure}` };
}
