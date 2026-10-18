import { clerkOn } from "@/lib/auth";
import { styled } from "@/lib/cardStyle";
import { previewDust, REGRETS_MAX, regretOn, regretWhy } from "@/lib/burn";
import { ddbConfigured, ddbGet, ddbPutIfAbsent, ddbQuery } from "@/lib/ddb";
import { deckFull, DECK_FULL_MSG } from "@/lib/deckCap";
import { deviceIdsOn, newDevice } from "@/lib/device";
import { deckOwner } from "@/lib/owner";
import { allow, clientId } from "@/lib/ratelimit";
import { dustOn, dustStatus } from "@/lib/stardust";
import { getTwin, TWIN_CODE } from "@/lib/twins";
import type { CardData } from "@/lib/card";
import type { DeckEntry } from "@/lib/deck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECK_MAX = 100;
const NO_STORE = { "cache-control": "private, no-store" };
const enabled = () => ddbConfigured() && (deviceIdsOn() || clerkOn());

/**
 * The deck, newest first: the account's when signed in, else this device's (read-only once accounts are on).
 * `{ enabled: false }` when there is no table, so the client falls back to local storage.
 */
export async function GET(request: Request) {
  if (!enabled()) return Response.json({ enabled: false, cards: [] }, { headers: NO_STORE });
  if (!(await allow(`deck:${clientId(request.headers)}`, 120, 10 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429 });
  const { owner, kind } = await deckOwner(request.headers);
  const base = { enabled: true, owner: kind, accounts: clerkOn() };
  if (!owner) return Response.json({ ...base, cards: [] }, { headers: NO_STORE });
  const page = await ddbQuery(`OWNER#${owner}`, "CARD#", DECK_MAX, undefined, ["code", "card", "addedAt", "minted", "runId", "funding", "rarityScore"]);
  if (!page) return Response.json({ error: "Your deck is unreachable right now." }, { status: 503, headers: NO_STORE });
  // Burning: signed-in accounts only (docs/design/burn.md). `earns` is the published rate before the weekly cap.
  const canBurn = kind === "user";
  const dust = canBurn && dustOn();
  // Regret burns: which card (if any) still qualifies. The burn route re-checks everything, including the ledger.
  const rOn = canBurn && regretOn();
  const used = rOn ? Number((await ddbGet(`USER#${owner}`, "PROFILE").catch(() => null))?.regretUsed) || 0 : REGRETS_MAX;
  const newest = Math.max(0, ...page.items.filter((x) => x.minted === 1).map((x) => Number(x.addedAt) || 0));
  const cards: DeckEntry[] = [];
  for (const it of page.items) {
    try {
      const minted = it.minted === 1;
      const canRegret = rOn && minted && !regretWhy(it, newest, used, ["free", "regret"].includes(String(it.funding)) && Boolean(it.runId));
      cards.push({
        code: String(it.code),
        card: JSON.parse(String(it.card)) as CardData,
        addedAt: Number(it.addedAt) || 0,
        minted,
        ...(dust && minted ? { earns: previewDust(it) } : {}),
        ...(canRegret ? { regret: true } : {}),
      });
    } catch {}
  }
  await Promise.all(cards.map(async (c) => (c.card = await styled(c.code, c.card, c.minted).catch(() => c.card))));
  cards.sort((a, b) => b.addedAt - a.addedAt);
  const ds = dust ? await dustStatus(owner).catch(() => null) : null;
  const burn = { on: canBurn, dustOn: dust, dust: ds?.dust ?? null, weekLeft: ds?.weekLeft ?? null, regretsLeft: rOn ? Math.max(0, REGRETS_MAX - used) : 0 };
  return Response.json({ ...base, cards, burn }, { headers: NO_STORE });
}

/**
 * Adds a minted card to the deck (write-once). Only codes the server itself minted are accepted:
 * the twin must exist and hash to its code. With accounts on, this needs a signed-in user (cards collected
 * this way are minted:0; the agent files your own mints as minted:1). Without accounts, the device cookie is issued on first use.
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

  const { owner, kind } = await deckOwner(request.headers);
  if (clerkOn() && kind !== "user") return Response.json({ error: "Sign in to keep cards.", reason: "signin" }, { status: 401, headers: NO_STORE });

  const card = await getTwin(code);
  if (!card) return Response.json({ error: "unknown card" }, { status: 404, headers: NO_STORE });

  let id = owner;
  let cookie: string | undefined;
  if (!id) {
    if (!deviceIdsOn()) return Response.json({ enabled: false }, { headers: NO_STORE });
    ({ id, cookie } = newDevice());
  }
  if (await deckFull(id)) return Response.json({ error: DECK_FULL_MSG, reason: "deckfull" }, { status: 409, headers: NO_STORE });
  const extra: Record<string, string | number> = kind === "user" ? { minted: 0, source: "collect" } : {};
  const out = await ddbPutIfAbsent({ PK: `OWNER#${id}`, SK: `CARD#${code}`, code, card: JSON.stringify(card), rarityScore: card.rarityScore, addedAt: Date.now(), ...extra });
  const res = Response.json({ enabled: true, added: out === "created", code }, { status: out === "error" ? 503 : 200, headers: NO_STORE });
  if (cookie) res.headers.append("set-cookie", cookie);
  return res;
}
