"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { HoloCard } from "@/components/card/HoloCard";
import type { CardData } from "@/lib/card";
import { ROLL_ODDS } from "@/lib/odds";
import { EASE } from "./primitives";
import s from "./landing.module.css";

/**
 * Holo and Secret cards real people pulled, with how many exist, shown like a gallery hangs its best pieces: each card
 * under its own spotlight on a lit floor, with an engraved plaque. Secrets hang first. Hidden until there is one.
 */
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

      <ul className={s.hallRow}>
        {cards.map(({ code, card }, i) => (
          <motion.li
            key={code}
            className={s.exhibit}
            data-tier={card.rarity}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
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
                No. {card.serial}
                {card.rarityNo ? ` · ${String(card.rarityNo).padStart(3, "0")} of its tier` : ""}
              </small>
            </p>
          </motion.li>
        ))}
      </ul>
    </section>
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
