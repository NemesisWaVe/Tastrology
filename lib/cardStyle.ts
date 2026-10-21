import { SEASON, editionOf, type CardData, type Rarity } from "./card";
import { upstash } from "./cache";
import { ddbGet, ddbUpdate } from "./ddb";

/**
 * Per-card extras that sit outside the card's code, so they never change what the card is.
 *   CARD#<code>  STYLE   living (0/1), rarityNo, r_<lens> = at of the last recast into it (lib/recast.ts)
 *   tm:no:<tier>         Upstash counter that numbers edition 01's Holo and Secret cards in the order they were pulled
 *   tm:no:<ed>:<tier>    the same for every later edition: each edition counts from 1
 */
export interface Recast {
  lens: string;
  at: number;
}
export interface CardStyle {
  living: boolean;
  rarityNo?: number;
  recasts: Recast[];
}

const NUMBERED: Rarity[] = ["holo", "secret"];
const key = (code: string) => [`CARD#${code}`, "STYLE"] as const;

function parse(it: Record<string, unknown> | null): CardStyle {
  const recasts = Object.entries(it ?? {})
    .filter(([k]) => k.startsWith("r_"))
    .map(([k, v]) => ({ lens: k.slice(2), at: Number(v) || 0 }));
  return { living: Number(it?.living) === 1, rarityNo: Number(it?.rarityNo) || undefined, recasts };
}

export async function getStyle(code: string): Promise<CardStyle> {
  return parse(await ddbGet(...key(code)).catch(() => null));
}

/** Edition 01 keeps the counter it has always used, so its numbers carry on; later editions get their own. */
const tierKey = (edition: string, tier: Rarity) => (edition === "01" ? `tm:no:${tier}` : `tm:no:${edition}:${tier}`);

/** Gives a Holo or Secret its tier number within its edition, once. A lost race just skips a number. */
export async function numberCard(code: string, rarity: Rarity, edition: string, have?: CardStyle): Promise<number | null> {
  if (!NUMBERED.includes(rarity)) return null;
  const cur = have ?? (await getStyle(code));
  if (cur.rarityNo) return cur.rarityNo;
  const r = await upstash([["INCR", tierKey(edition, rarity)]]);
  const n = Number(r?.[0]) || 0;
  if (!n) return null;
  const w = await ddbUpdate(...key(code), "SET rarityNo = :n", { condition: "attribute_not_exists(rarityNo)", values: { ":n": n } });
  if (w === "updated") return n;
  return w === "failed" ? (await getStyle(code)).rarityNo ?? null : null;
}

/** How many Holo and Secret cards an edition has pulled (the current one by default). */
export async function census(edition = SEASON): Promise<{ holo: number; secret: number } | null> {
  const r = await upstash([["MGET", tierKey(edition, "holo"), tierKey(edition, "secret")]]);
  const v = r?.[0];
  if (!Array.isArray(v)) return null;
  return { holo: Number(v[0]) || 0, secret: Number(v[1]) || 0 };
}

/**
 * The card as shown: its style merged in. With `number`, a Holo or Secret minted before numbering gets one now
 * (the deck passes it for its own mints; public views don't, so persona cards stay unnumbered).
 */
export async function styled(code: string, card: CardData, number = false): Promise<CardData> {
  const st = await getStyle(code);
  const rarityNo = st.rarityNo ?? card.rarityNo ?? (number ? await numberCard(code, card.rarity, editionOf(card), st).catch(() => null) : null) ?? undefined;
  return {
    ...card,
    ...(st.living ? { living: true } : {}),
    ...(rarityNo ? { rarityNo } : {}),
    ...(st.recasts.length ? { recasts: [...new Set(st.recasts.map((x) => x.lens))] } : {}),
  };
}
