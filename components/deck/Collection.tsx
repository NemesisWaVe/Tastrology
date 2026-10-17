"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HoloCard } from "@/components/card/HoloCard";
import type { CardData } from "@/lib/card";

/** Cards from Battle Packs: other people's, kept to fight. Separate from the deck, which is only you. */
export function Collection() {
  const [cards, setCards] = useState<{ code: string; card: CardData }[]>([]);
  useEffect(() => {
    fetch("/api/pack", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { collection?: { cards: { code: string; card: CardData }[] }[] } | null) => setCards((j?.collection ?? []).flatMap((p) => p.cards)))
      .catch(() => {});
  }, []);
  if (!cards.length) return null;
  return (
    <section className="mt-20">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">Collection</p>
      <h2 className="mt-2 font-serif text-4xl italic leading-tight">Strangers you can fight</h2>
      <p className="mt-3 max-w-xl text-ink-2">From your Battle Packs. They aren&apos;t you, so they live here, not in your deck.</p>
      <ul className="mt-8 flex gap-6 overflow-x-auto pb-4 [scrollbar-width:thin]">
        {cards.map(({ code, card }) => (
          <li key={code} className="flex shrink-0 flex-col items-center">
            <Link href={`/vs/${code}`} aria-label={`Fight ${card.archetype}`} className="block transition hover:-translate-y-1">
              <HoloCard card={card} width={160} idle={false} still />
            </Link>
            <Link href={`/vs/${code}`} className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3 hover:text-accent">
              Fight
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
