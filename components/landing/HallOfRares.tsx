"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HoloCard } from "@/components/card/HoloCard";
import type { CardData } from "@/lib/card";

/** Holo and Secret cards real people pulled, with how many exist. Hidden until there is at least one. */
export function HallOfRares() {
  const [d, setD] = useState<{ cards: { code: string; card: CardData }[]; census: { holo: number; secret: number } | null } | null>(null);
  useEffect(() => {
    fetch("/api/rares")
      .then((r) => (r.ok ? r.json() : null))
      .then(setD)
      .catch(() => {});
  }, []);
  if (!d?.cards.length) return null;
  const c = d.census;
  return (
    <section className="relative mx-auto max-w-6xl px-4 py-24 sm:px-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">Hall of Rares</p>
      <h2 className="mt-2 font-serif text-4xl italic leading-tight sm:text-6xl">
        Some skies are <span className="text-accent">rarer.</span>
      </h2>
      <p className="mt-4 max-w-xl text-ink-2">
        Real cards, pulled by real people. These came out Holo or Secret. The foil tier and the taste behind it are different things. <Link href="/odds" className="underline underline-offset-4">How rarity works</Link>.
        {c && (c.holo > 0 || c.secret > 0) && (
          <>
            {" "}
            So far: <span className="text-ink">{c.secret}</span> Secret Rare{c.secret === 1 ? "" : "s"} and <span className="text-ink">{c.holo}</span> Holo Rare
            {c.holo === 1 ? "" : "s"}.
          </>
        )}
      </p>
      <ul className="mt-10 flex gap-6 overflow-x-auto pb-6 [scrollbar-width:thin]">
        {d.cards.map(({ code, card }) => (
          <li key={code} className="shrink-0">
            <Link href={`/c/${code}`} aria-label={`${card.rarityLabel}: ${card.archetype}`} className="block transition hover:-translate-y-1">
              <HoloCard card={card} width={200} idle={false} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
