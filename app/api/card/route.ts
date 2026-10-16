import { sharedCache, upstash, upstashConfigured } from "@/lib/cache";
import { cardCode, type CardData } from "@/lib/card";
import { allow, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Digital twins of minted cards, keyed by their verify code.
 * Stores the rendered card only (names, scores, sigils), never raw Qloo responses.
 */
const TTL_MS = 180 * 24 * 60 * 60 * 1000;
const mem = sharedCache<string>("twins", 2000);
const key = (code: string) => `tm:twin:${code}`;
const CODE = /^\d{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.toUpperCase() ?? "";
  if (!CODE.test(code)) return Response.json({ error: "bad code" }, { status: 400 });
  let raw = mem.get(code);
  if (!raw && upstashConfigured()) {
    const [v] = (await upstash([["GET", key(code)]])) ?? [];
    if (typeof v === "string") raw = v;
  }
  if (!raw) return Response.json({ card: null }, { status: 404 });
  return Response.json({ card: JSON.parse(raw) as CardData }, { headers: { "cache-control": "public, max-age=300" } });
}

export async function POST(request: Request) {
  if (!(await allow(`twin:${clientIp(request.headers)}`, 60, 10 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429 });
  const card = (await request.json().catch(() => null)) as CardData | null;
  if (!card?.serial || !card.archetype || !Array.isArray(card.mrz)) return Response.json({ error: "bad card" }, { status: 400 });
  const raw = JSON.stringify(card);
  if (raw.length > 60_000) return Response.json({ error: "too large" }, { status: 413 });
  // The code is a checksum of the card's own fields: a card can only register under its own code.
  const code = cardCode(card);
  mem.set(code, raw, TTL_MS);
  if (upstashConfigured()) await upstash([["SET", key(code), raw, "PX", TTL_MS, "NX"]]);
  return Response.json({ code });
}
