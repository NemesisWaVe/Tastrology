import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Bot check for fresh readings (they cost Qloo and LLM quota). Cloudflare Turnstile, off unless TURNSTILE_SECRET_KEY is set.
 * A passed check earns a signed, short-lived cookie so queue retries and re-reads don't need a new token
 * (Turnstile tokens are single-use).
 */
export const HUMAN_COOKIE = "tm_h";
const HUMAN_TTL_S = 30 * 60;
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * On only when both halves are set. A secret without the public site key would ask every browser for a token it has
 * no way to produce, locking out every fresh reading, so a half-configured pair fails open (and /api/health flags it).
 */
export const turnstileOn = () => Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

const sign = (exp: string) => createHmac("sha256", `human|${process.env.TURNSTILE_SECRET_KEY}`).update(exp).digest("base64url");

function readCookie(headers: Headers, name: string): string | undefined {
  for (const part of (headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

/** True when the request carries an unexpired human cookie we signed. */
export function hasHumanCookie(headers: Headers): boolean {
  const raw = readCookie(headers, HUMAN_COOKIE);
  if (!raw) return false;
  const [exp, sig] = raw.split(".");
  if (!exp || !sig || Number(exp) * 1000 < Date.now()) return false;
  const want = Buffer.from(sign(exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

export function humanCookie(): string {
  const exp = String(Math.floor(Date.now() / 1000) + HUMAN_TTL_S);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${HUMAN_COOKIE}=${exp}.${sign(exp)}; Path=/api; Max-Age=${HUMAN_TTL_S}; HttpOnly; SameSite=Strict${secure}`;
}

/** Server-side check of a Turnstile token. Fails closed on a bad token, open (true) if Cloudflare is unreachable. */
export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token });
    if (ip && ip !== "local") body.set("remoteip", ip);
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return true;
    const j = (await res.json()) as { success?: boolean };
    return j.success === true;
  } catch {
    return true;
  }
}
