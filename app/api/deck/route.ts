import { ddbConfigured, ddbPutIfAbsent, ddbQuery } from "@/lib/ddb";
import { deviceId, deviceIdsOn, newDevice } from "@/lib/device";
import { allow, clientId } from "@/lib/ratelimit";
import { getTwin, TWIN_CODE } from "@/lib/twins";
import type { CardData } from "@/lib/card";
import type { DeckEntry } from "@/lib/deck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECK_MAX = 100;
const NO_STORE = { "cache-control": "private, no-store" };
const enabled = () => ddbConfigured() && deviceIdsOn();

/** This device's deck, newest first. `{ enabled: false }` when there is no table, so the client falls back to local storage. */
export async function GET(request: Request) {
  if (!enabled()) return Response.json({ enabled: false, cards: [] }, { headers: NO_STORE });
  if (!(await allow(`deck:${clientId(request.headers)}`, 120, 10 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429 });
  const dev = deviceId(request.headers);
  if (!dev) return Response.json({ enabled: true, cards: [] }, { headers: NO_STORE });
  const page = await ddbQuery(`OWNER#${dev}`, "CARD#", DECK_MAX, undefined, ["code", "card", "addedAt"]);
  if (!page) return Response.json({ error: "Your deck is unreachable right now." }, { status: 503, headers: NO_STORE });
  const cards: DeckEntry[] = [];
  for (const it of page.items) {
    try {
      cards.push({ code: String(it.code), card: JSON.parse(String(it.card)) as CardData, addedAt: Number(it.addedAt) || 0 });
    } catch {}
  }
  cards.sort((a, b) => b.addedAt - a.addedAt);
  return Response.json({ enabled: true, cards }, { headers: NO_STORE });
}

/**
 * Adds a minted card to this device's deck (write-once). Only codes the server itself minted are accepted:
 * the twin must exist and hash to its code. Issues the device cookie on first use.
 */
export async function POST(request: Request) {
  if (!enabled()) return Response.json({ enabled: false }, { headers: NO_STORE });
  if (!(await allow(`deckadd:${clientId(request.headers)}`, 60, 10 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429 });
  let code = "";
  try {
    const text = await request.text();
    if (text.length > 256) return Response.json({ error: "too large" }, { status: 413 });
    code = String((JSON.parse(text) as { code?: unknown }).code ?? "").toUpperCase();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  if (!TWIN_CODE.test(code)) return Response.json({ error: "bad code" }, { status: 400 });
  const card = await getTwin(code);
  if (!card) return Response.json({ error: "unknown card" }, { status: 404, headers: NO_STORE });

  let dev = deviceId(request.headers);
  let cookie: string | undefined;
  if (!dev) ({ id: dev, cookie } = newDevice());
  const out = await ddbPutIfAbsent({ PK: `OWNER#${dev}`, SK: `CARD#${code}`, code, card: JSON.stringify(card), rarityScore: card.rarityScore, addedAt: Date.now() });
  const res = Response.json({ enabled: true, added: out === "created", code }, { status: out === "error" ? 503 : 200, headers: NO_STORE });
  if (cookie) res.headers.append("set-cookie", cookie);
  return res;
}
