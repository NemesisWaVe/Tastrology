"use client";

import type { CardData } from "./card";

/** One card in a device's deck (server: DynamoDB, keyed by the signed device cookie). */
export interface DeckEntry {
  code: string;
  card: CardData;
  addedAt: number;
}

const added = new Set<string>();

/** Files a freshly minted card into this device's deck. Fire-and-forget; once per code per page load. */
export function addToDeck(code: string): void {
  if (added.has(code)) return;
  added.add(code);
  void fetch("/api/deck", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) }).catch(() => added.delete(code));
}

/** The deck, or `enabled: false` when the server has no deck store (the page then shows the card saved on this device). */
export async function loadDeck(): Promise<{ enabled: boolean; cards: DeckEntry[]; error?: string }> {
  try {
    const res = await fetch("/api/deck", { cache: "no-store" });
    const j = (await res.json()) as { enabled?: boolean; cards?: DeckEntry[]; error?: string };
    return { enabled: Boolean(j.enabled), cards: j.cards ?? [], error: res.ok ? undefined : (j.error ?? "Couldn't load your deck.") };
  } catch {
    return { enabled: true, cards: [], error: "Couldn't reach the server." };
  }
}
