"use client";

import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HoloCard } from "@/components/card/HoloCard";
import { Sky } from "@/components/reveal/Sky";
import { skyState } from "@/components/reveal/traceModel";
import { CursorArrow } from "@/components/CursorArrow";
import { SiteNav } from "@/components/site/SiteShell";
import { whenAuthReady } from "@/lib/authBridge";
import { buildCard, cardCode, SEASON } from "@/lib/card";
import { claimDeviceDeck, loadDeck, type DeckEntry } from "@/lib/deck";
import { isPersonaRequest } from "@/lib/personas";
import type { AgentRequest, StyleResult } from "@/lib/types";

/** The card saved in this browser (last reading), if any. */
function savedCard(): { req?: AgentRequest; mock: boolean; entry: DeckEntry } | null {
  try {
    const saved = JSON.parse(localStorage.getItem("tastrology:v1") ?? "null") as { req?: AgentRequest; result?: StyleResult } | null;
    const card = saved?.result ? buildCard(saved.result) : null;
    return card ? { req: saved?.req, mock: saved?.result?.mode === "mock", entry: { code: cardCode(card), card, addedAt: 0 } } : null;
  } catch {
    return null;
  }
}

/**
 * Signed-in visit: move this device's anonymous deck into the account (server, write-once per device),
 * and file the card saved in this browser too. Returns how many device cards moved.
 */
async function claimOnce(): Promise<number> {
  const b = await whenAuthReady();
  if (!b?.signedIn()) return 0;
  const moved = await claimDeviceDeck();
  const local = savedCard();
  if (local && !local.mock && !isPersonaRequest(local.req)) {
    await fetch("/api/deck", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: local.entry.code }) }).catch(() => {});
  }
  return moved;
}

/** Every card this device has minted. Server deck (DynamoDB) when it's on; otherwise the one card saved in this browser. */
export default function DeckPage() {
  const [cards, setCards] = useState<DeckEntry[] | null>(null);
  const [local, setLocal] = useState(false);
  const [error, setError] = useState<string>();
  const [owner, setOwner] = useState<"user" | "device">("device");
  const [toast, setToast] = useState<string>();

  useEffect(() => {
    let off = false;
    (async () => {
      const moved = await claimOnce();
      if (off) return;
      if (moved > 0) setToast("Cards from this device moved to your account.");
      const d = await loadDeck();
      if (off) return;
      if (d.owner) setOwner(d.owner);
      if (d.enabled && !d.error) return setCards(d.cards);
      // No server deck (or it's unreachable): fall back to the card saved on this device.
      setError(d.error);
      setLocal(true);
      const local = savedCard();
      setCards(local ? [local.entry] : []);
    })();
    return () => {
      off = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const reduce = Boolean(useReducedMotion());
  const sky = useMemo(() => (cards?.[0] ? skyState(cards[0].card.evolvesFrom, cards[0].card.archetype) : null), [cards]);

  return (
    <div className="relative isolate min-h-screen">
      {sky && <Sky f={sky} reduce={reduce} drawn fixed quiet dim={0.4} />}
      <SiteNav />
      {toast && (
        <div role="status" className="rise fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2.5 rounded-full border border-accent/40 bg-paper/95 px-5 py-2.5 text-sm text-ink shadow-lg backdrop-blur-md">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          {toast}
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">Season {SEASON}</p>
        <h1 className="mt-2 font-serif text-5xl italic leading-[0.95] sm:text-6xl">Your deck</h1>
        <p className="mt-3 max-w-xl text-ink-2">
          {cards === null
            ? "Shuffling…"
            : local
              ? "Only your latest card is kept in this browser."
              : `${cards.length} ${cards.length === 1 ? "card" : "cards"}, kept ${owner === "user" ? "in your account" : "for this device"}. Every one is a verified original you can share.`}
        </p>
        {error && <p className="mt-2 font-mono text-[11px] text-warn">{error}</p>}

        {cards?.length === 0 && (
          <div className="mt-16 max-w-md">
            <p className="text-ink-2">No cards yet. Name a few things you love and mint your first.</p>
            <Link href="/" className="mt-6 inline-flex items-center gap-3 rounded-full bg-accent py-2 pl-6 pr-2 font-semibold text-paper">
              Get your sign
              <CursorArrow className="h-9 w-9 bg-paper text-accent" />
            </Link>
          </div>
        )}

        {!!cards?.length && (
          <ul className="mt-12 grid grid-cols-1 justify-items-center gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(({ code, card }, i) => (
              <li key={code} className="rise flex flex-col items-center" style={{ animationDelay: `${Math.min(i, 9) * 60}ms` }}>
                <Link href={`/c/${code}`} aria-label={`Open ${card.archetype}`} className="transition duration-300 hover:-translate-y-1">
                  <HoloCard card={card} width={260} idle={false} still={reduce} />
                </Link>
                <p className="mt-4 text-center font-serif text-xl italic leading-tight">{card.archetype}</p>
                <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">
                  No. {card.serial} · {card.rarityLabel} · {code}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
