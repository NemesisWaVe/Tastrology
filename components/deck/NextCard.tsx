"use client";

import Link from "next/link";
import c from "@/components/site/celestial.module.css";
import type { Economy } from "@/lib/economy";

export interface Me {
  signedIn?: boolean;
  admin?: boolean;
  creditsOn?: boolean;
  credits?: number | null;
  refillAt?: number | null;
  refillDays?: number;
  deckMax?: number;
  /** Shop and Stardust show after the 2nd card or first fight (lib/economyGate.ts). */
  economyOpen?: boolean;
  stardust?: { dust: number | null; weekLeft: number | null; economy?: Economy } | null;
}

const DAY = 86_400_000;

/** The moon on the next slot: full the day you mint, waning to new on the day your next card is ready. */
function Moon({ lit }: { lit: number }) {
  const R = 30;
  const f = Math.min(1, Math.max(0, lit));
  const rx = Math.abs(1 - 2 * f) * R;
  // Lit on the left: outer arc down the left side, then the terminator back up (bulging right past half, left below it).
  const d = f <= 0.001 ? "" : `M40 ${40 - R} A${R} ${R} 0 0 0 40 ${40 + R} A${rx} ${R} 0 0 ${f > 0.5 ? 0 : 1} 40 ${40 - R} Z`;
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" aria-hidden>
      <circle cx="40" cy="40" r={R} fill="rgb(255 255 255 / 0.04)" stroke="rgb(255 255 255 / 0.18)" strokeWidth="1" />
      {d && <path d={d} fill="#e9f0ff" opacity="0.85" />}
    </svg>
  );
}

/**
 * The empty slot at the end of the deck: when the next card comes (one per refill, docs/design/identity-limits.md).
 * Shown only with credits on; admins always see it ready.
 */
export function NextCard({ me, count }: { me: Me | null; count: number }) {
  if (!me?.signedIn || (!me.creditsOn && !me.admin)) return null;
  const max = me.deckMax ?? 12;
  const full = count >= max && !me.admin;
  const ready = !full && (me.admin || (me.credits ?? 0) >= 1);
  const days = me.refillAt ? Math.max(1, Math.ceil((me.refillAt - Date.now()) / DAY)) : null;
  const span = me.refillDays ?? 30;
  const lit = days === null ? 0 : Math.min(1, days / span);

  return (
    <div className="flex w-[260px] flex-col items-center">
      <div className={`${c.slot} flex flex-col items-center justify-center gap-4 px-6 text-center`} style={{ width: 260 }}>
        {ready ? (
          <>
            <span className="h-3 w-3 rounded-full bg-accent shadow-[0_0_24px_6px_rgba(198,255,61,0.45)]" aria-hidden />
            <p className="font-serif text-2xl italic leading-tight text-accent">Your next card is ready.</p>
            <Link href="/?new=1" className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-paper">
              Name what you love now
            </Link>
          </>
        ) : full ? (
          <>
            <p className="font-serif text-2xl italic leading-tight">Your deck is full.</p>
            <p className="text-sm text-ink-2">Retire a card to make room for the next one.</p>
          </>
        ) : (
          <>
            <Moon lit={lit} />
            <p className="font-serif text-2xl italic leading-tight">Next card at the new moon.</p>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">{days ? `${days} day${days === 1 ? "" : "s"}` : "Soon"}</p>
          </>
        )}
      </div>
      <p className="mt-4 text-center font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">
        {Math.min(count, max)} of {max} slots
      </p>
    </div>
  );
}
