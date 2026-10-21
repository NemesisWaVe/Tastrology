"use client";

import Link from "next/link";
import { motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { HoloCard } from "@/components/card/HoloCard";
import { cardNo, type CardData } from "@/lib/card";
import { ROLL_ODDS } from "@/lib/odds";
import { EASE } from "./primitives";
import s from "./landing.module.css";

/**
 * Holo and Secret cards real people pulled, with how many exist, shown like a gallery hangs its best pieces: each card
 * under its own spotlight on a lit floor, with an engraved plaque. Secrets hang first. Hidden until there is one.
 */
export function HallOfRares() {
  const [d, setD] = useState<{ cards: { code: string; card: CardData }[]; census: { holo: number; secret: number } | null; total?: number } | null>(null);
  useEffect(() => {
    fetch("/api/rares?teaser=1")
      .then((r) => (r.ok ? r.json() : null))
      .then(setD)
      .catch(() => {});
  }, []);
  if (!d?.cards.length) return null;
  const c = d.census;
  const cards = [...d.cards].sort((a, b) => Number(b.card.rarity === "secret") - Number(a.card.rarity === "secret"));
  return (
    <section className={`${s.hall} relative py-24 sm:py-32`}>
      <div className="mx-auto max-w-6xl px-4 text-center sm:px-8">
        <p className={s.hallEyebrow}>
          <i aria-hidden>✦</i> Hall of Rares <i aria-hidden>✦</i>
        </p>
        <h2 className="mt-4 font-serif text-5xl italic leading-[0.95] sm:text-7xl">
          Some skies are <span className={s.goldText}>rarer.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-ink-2">
          Real cards, pulled by real people, that came out of the pack in foil. The finish is luck; the taste is theirs.{" "}
          <Link href="/odds" className="underline underline-offset-4 hover:text-ink">
            How rarity works
          </Link>
        </p>
        {c && (
          <div className="mt-9 flex flex-wrap items-stretch justify-center gap-3 sm:gap-4">
            <Medal tier="secret" n={c.secret} label={`Secret Rare${c.secret === 1 ? "" : "s"}`} odds={pct("secret")} />
            <Medal tier="holo" n={c.holo} label={`Holo Rare${c.holo === 1 ? "" : "s"}`} odds={pct("holo")} />
          </div>
        )}
      </div>

      <Exhibits cards={cards} door={<HallDoor total={d.total ?? cards.length} c={c} />} />
      {/* the door again, where nobody has to swipe to find it */}
      <div className="mt-8 flex justify-center px-4">
        <Link href="/hall" className={s.hallCta}>
          Enter the Hall
          <small>{d.total && d.total > 2 ? `${d.total - 2} more foils inside` : "swipe through every foil"}</small>
          <i aria-hidden>→</i>
        </Link>
      </div>
    </section>
  );
}

/** The row decides when the cards rise: a card off to the right is clipped by the row, so on its own it never counts
 * as seen (it stayed shifted down and invisible, and gave the row a vertical scroll). Its own component, so the row
 * exists by the time it is observed. */
function Exhibits({ cards, door }: { cards: { code: string; card: CardData }[]; door: React.ReactNode }) {
  const row = useRef<HTMLUListElement>(null);
  const shown = useInView(row, { once: true, margin: "-60px" });
  return (
    <ul ref={row} className={s.hallRow}>
      {cards.map(({ code, card }, i) => (
        <motion.li
          key={code}
          className={s.exhibit}
          data-tier={card.rarity}
          initial={{ opacity: 0, y: 40 }}
          animate={shown ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.9, ease: EASE, delay: i * 0.1 }}
        >
          <span className={s.spot} aria-hidden />
          <Link href={`/c/${code}`} aria-label={`${card.rarityLabel}: ${card.archetype}`} className={s.exhibitCard}>
            <HoloCard card={card} width={230} idle={false} />
          </Link>
          <span className={s.floor} aria-hidden />
          <p className={s.plaque}>
            <span>{card.rarityLabel}</span>
            <b>{card.archetype}</b>
            <small>
              No. {cardNo(card)}
              {card.rarityNo ? ` · ${String(card.rarityNo).padStart(3, "0")} of its tier` : ""}
            </small>
          </p>
        </motion.li>
      ))}
      <motion.li
        className={s.exhibit}
        initial={{ opacity: 0, y: 40 }}
        animate={shown ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.9, ease: EASE, delay: cards.length * 0.1 }}
      >
        {door}
      </motion.li>
    </ul>
  );
}

/** The way in: a deck of face-down cards with the count, and the whole Hall behind it. */
function HallDoor({ total, c }: { total: number; c: { holo: number; secret: number } | null }) {
  const more = Math.max(0, total - 2);
  return (
    <Link href="/hall" className={s.door} aria-label="Enter the Hall of Rares">
      <span className={s.doorStack} aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span className={s.doorText}>
        <small>{more > 0 ? `+${more} more in the Hall` : "The whole Hall"}</small>
        <b>Enter the Hall</b>
        <em>
          {c ? `${c.secret} Secret · ${c.holo} Holo` : "every foil pulled"} · swipe through them all
        </em>
      </span>
      <span className={s.doorGo} aria-hidden>
        →
      </span>
    </Link>
  );
}

const pct = (tier: string) => `${Math.round((ROLL_ODDS.find((o) => o.tier === tier)?.p ?? 0) * 1000) / 10}% of pulls`;

function Medal({ tier, n, label, odds }: { tier: "secret" | "holo"; n: number; label: string; odds: string }) {
  return (
    <div className={s.medal} data-tier={tier}>
      <b>{n}</b>
      <span>
        {label}
        <small>{n === 0 ? `unclaimed · ${odds}` : odds}</small>
      </span>
    </div>
  );
}
