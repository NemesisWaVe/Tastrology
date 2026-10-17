"use client";

import Link from "next/link";
import type { DeckEntry } from "@/lib/deck";
import { moveLine, tasteMove } from "@/lib/timeline";

const month = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", year: "numeric" });

/** Your own cards in the order you made them, with one line on what changed between each. */
export function Timeline({ cards }: { cards: DeckEntry[] }) {
  const mine = cards.filter((e) => e.minted).sort((a, b) => a.addedAt - b.addedAt);
  if (!mine.length) return null;
  return (
    <section className="mt-20">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">Timeline</p>
      <h2 className="mt-2 font-serif text-4xl italic leading-tight">How your taste moved</h2>
      {mine.length === 1 && <p className="mt-3 max-w-xl text-ink-2">One card so far. The next one shows how you changed.</p>}
      <ol className="mt-8 border-l border-line pl-6">
        {mine.map((e, i) => (
          <li key={e.code} className="relative pb-8 last:pb-0">
            <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_12px_rgba(198,255,61,0.6)]" aria-hidden />
            <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">{month(e.addedAt)}</p>
            <Link href={`/c/${e.code}`} className="mt-1 block font-serif text-2xl italic hover:text-accent">
              {e.card.archetype}
            </Link>
            {i > 0 && <p className="mt-2 max-w-2xl text-ink-2">{moveLine(tasteMove(mine[i - 1].card, e.card))}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
