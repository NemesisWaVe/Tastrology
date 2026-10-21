"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HoloCard } from "@/components/card/HoloCard";
import { AfterEconomy } from "@/components/site/AfterFirstCard";
import { buildCard, type CardData } from "@/lib/card";
import { ROLL_ODDS } from "@/lib/odds";
import { PERSONAS, personaRequest } from "@/lib/personas";
import { useAgentRun } from "@/lib/useAgentRun";

const LABEL = { common: "Common", rare: "Rare", holo: "Holo Rare", secret: "Secret Rare" } as const;
const NOTE = {
  common: "Brushed silver frame, flat print.",
  rare: "Foil frame in your type colours, foil over the art.",
  holo: "Rainbow foil frame to face, lit by tilt. Living sigils built in.",
  secret: "Full gold art, etched face, glitter and a light that crosses the card.",
} as const;
const ORDER = ["secret", "holo", "rare"] as const;
const SET = [...PERSONAS].sort((a, b) => ORDER.indexOf(a.showcase) - ORDER.indexOf(b.showcase));

/**
 * The whole set on one page: one reading in all four finishes, the three ready-made cards in their showcase finish,
 * and the add-ons. The cards are real readings, run live through the agent one after another (persona runs are
 * cached server side, and nothing from Qloo is stored in the repo).
 */
export function CardGallery() {
  const { run } = useAgentRun();
  const [cards, setCards] = useState<Record<string, CardData>>({});
  useEffect(() => {
    let live = true;
    (async () => {
      // the hero's card first: it is the warmest in the cache, and the finish ladder below uses it
      for (const p of [...SET].sort((a) => (a.key === "neon" ? -1 : 0))) {
        const r = await run(personaRequest(p)).catch(() => null);
        if (!live) return;
        if (!r) continue;
        try {
          const c = buildCard(r);
          setCards((m) => ({ ...m, [p.key]: c }));
        } catch {
          /* a card that fails to build just stays a placeholder */
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [run]);
  const ladder = cards.neon ?? Object.values(cards)[0];

  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">Set 01 · every card</p>
      <h1 className="mt-2 font-serif text-5xl italic leading-[0.95] sm:text-7xl">
        Four finishes. <span className="text-accent">One of you.</span>
      </h1>
      <p className="mt-5 max-w-xl text-ink-2">
        What you love decides the sign, the Big Three and the brands. The finish is rolled once, when you mint, at the same odds for everyone.{" "}
        <Link href="/odds" className="underline underline-offset-4">
          How the roll works
        </Link>
        .
      </p>

      <section className="mt-14">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">The finishes · one reading, four ways</h2>
        <ul className="-mx-4 mt-6 flex gap-6 overflow-x-auto overflow-y-hidden px-4 pb-6 pt-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          {ROLL_ODDS.map((o) => (
            <li key={o.tier} className="w-[230px] shrink-0 sm:w-auto">
              <Slot card={ladder ? { ...ladder, rarity: o.tier, rarityLabel: LABEL[o.tier], rarityNo: undefined } : null} width={230} />
              <p className="mt-4 flex items-baseline justify-between gap-3">
                <span className="font-display text-lg font-semibold">{LABEL[o.tier]}</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">{Math.round(o.p * 1000) / 10}% of pulls</span>
              </p>
              <p className="mt-1 text-[14px] leading-snug text-ink-3">{NOTE[o.tier]}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">The ready-made three · showcase finishes</h2>
        <ul className="-mx-4 mt-6 flex gap-8 overflow-x-auto overflow-y-hidden px-4 pb-6 pt-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
          {SET.map((p) => (
            <li key={p.key} className="w-[270px] shrink-0 sm:w-auto">
              <Slot card={cards[p.key] ?? null} width={270} />
              <p className="mt-4 font-display text-xl font-semibold">{p.name}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">{LABEL[p.showcase]} showcase</p>
              <Link href="/#pick" className="mt-3 inline-flex items-center gap-2 text-[14px] text-ink-2 underline-offset-4 transition hover:text-ink hover:underline">
                Mint your own copy →
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <AfterEconomy>
      <section className="mt-16 grid grid-cols-1 gap-6 rounded-[28px] border border-line bg-white/[0.02] p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
        <div>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">Add-ons</h2>
          <p className="mt-3 font-display text-2xl font-semibold">Living sigils</p>
          <p className="mt-2 max-w-xl text-ink-2">
            The Sun, Moon and Rising sigils breathe and the type marks turn. Built into every Holo and Secret Rare; any other card can wear them for
            Stardust. More add-ons land here as they ship.
          </p>
        </div>
        <Link href="/shop" className="inline-flex h-12 items-center justify-center rounded-full bg-ink px-6 text-[14px] font-semibold text-paper transition hover:bg-accent">
          Open the shop
        </Link>
      </section>
      </AfterEconomy>

      <div className="mt-16 flex flex-wrap items-center gap-4">
        <Link href="/#byo" className="inline-flex h-14 items-center rounded-full bg-accent px-7 text-[15px] font-semibold text-paper">
          Make my card
        </Link>
        <span className="text-[14px] text-ink-3">Three favourites, about thirty seconds.</span>
      </div>
    </div>
  );
}

/** A card, or a card-shaped placeholder while its reading loads. */
function Slot({ card, width }: { card: CardData | null; width: number }) {
  if (card) return <HoloCard card={card} width={width} idle />;
  return <div className="shimmer rounded-[4.8%] border border-line" style={{ width: "100%", maxWidth: width, aspectRatio: "63 / 88" }} aria-label="Loading card" />;
}
