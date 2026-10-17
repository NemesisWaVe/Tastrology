import { ddbQuery } from "./ddb";

/** Cards one deck may hold (env DECK_MAX, default 12). A card is an identity, not a pile: retire one to make room. */
export function deckMax(): number {
  const n = Math.floor(Number(process.env.DECK_MAX));
  return Number.isFinite(n) && n >= 1 ? n : 12;
}

/** True when the deck already holds DECK_MAX cards. Fails open: a storage hiccup never blocks a reading. */
export async function deckFull(owner: string): Promise<boolean> {
  const max = deckMax();
  const r = await ddbQuery(`OWNER#${owner}`, "CARD#", max, undefined, ["code"]);
  return !!r && r.items.length >= max;
}

export const DECK_FULL_MSG = `Your deck is full. Retire a card to make room.`;
