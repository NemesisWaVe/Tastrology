"use client";

import type { CardData } from "./card";

/** One card in a device's deck (server: DynamoDB, keyed by the signed device cookie). */
export interface DeckEntry {
  code: string;
  card: CardData;
  addedAt: number;
  /** True when the account minted it itself (fresh reading); false for claimed or collected cards. */
  minted?: boolean;
  /** Dust a burn would earn before the weekly cap (only when Stardust is on and this is your own mint). */
  earns?: number;
}

/** Burn state for the deck (docs/design/burn.md). `on` only for signed-in accounts; `dustOn` only with credits on. */
export interface DeckBurn {
  on: boolean;
  dustOn: boolean;
  dust: number | null;
  weekLeft: number | null;
}

export interface BurnReply {
  ok?: boolean;
  status?: "burned" | "dup";
  dust?: number;
  balance?: number | null;
  capped?: boolean;
  reason?: "off" | "uncharged" | "burned-before" | "cap";
  dustOn?: boolean;
  error?: string;
}

/** Burns one of your own mints. Never throws. */
export async function burnFromDeck(code: string): Promise<BurnReply & { httpOk: boolean }> {
  try {
    const res = await fetch(`/api/deck/${encodeURIComponent(code)}/burn`, { method: "POST" });
    const j = (await res.json().catch(() => ({}))) as BurnReply;
    return { ...j, httpOk: res.ok };
  } catch {
    return { httpOk: false, error: "Couldn't reach the server." };
  }
}

const added = new Set<string>();

/** Files a freshly minted card into this device's deck. Fire-and-forget; once per code per page load. */
export function addToDeck(code: string): void {
  if (added.has(code)) return;
  added.add(code);
  void fetch("/api/deck", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) }).catch(() => added.delete(code));
}

/** The deck, or `enabled: false` when the server has no deck store (the page then shows the card saved on this device). */
export async function loadDeck(): Promise<{ enabled: boolean; cards: DeckEntry[]; owner?: "user" | "device"; error?: string; burn?: DeckBurn }> {
  try {
    const res = await fetch("/api/deck", { cache: "no-store" });
    const j = (await res.json()) as { enabled?: boolean; cards?: DeckEntry[]; owner?: "user" | "device"; error?: string; burn?: DeckBurn };
    return { enabled: Boolean(j.enabled), cards: j.cards ?? [], owner: j.owner, burn: j.burn, error: res.ok ? undefined : (j.error ?? "Couldn't load your deck.") };
  } catch {
    return { enabled: true, cards: [], error: "Couldn't reach the server." };
  }
}

/** Moves this device's anonymous deck into the signed-in account. Returns how many cards moved (0 when there was nothing to move). */
export async function claimDeviceDeck(): Promise<number> {
  try {
    const res = await fetch("/api/deck/claim", { method: "POST" });
    if (!res.ok) return 0;
    const j = (await res.json()) as { moved?: number };
    return Number(j.moved) || 0;
  } catch {
    return 0;
  }
}
