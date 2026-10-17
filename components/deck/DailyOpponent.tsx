"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PERSONAS } from "@/lib/personas";

/** Same opponent for everyone all UTC day, a new one at midnight. */
export function todaysOpponent(now = Date.now()) {
  return PERSONAS[Math.floor(now / 86_400_000) % PERSONAS.length];
}

/** The daily loop while you wait for your next card: one fight a day, then a challenge link of your own. */
export function DailyOpponent({ hasCard }: { hasCard: boolean }) {
  // Picked after mount so the server render and the visitor's clock never disagree.
  const [p, setP] = useState<ReturnType<typeof todaysOpponent> | null>(null);
  useEffect(() => setP(todaysOpponent()), []);
  if (!p) return <div className="mt-10 h-[118px]" aria-hidden />;
  return (
    <section className="mt-10 flex flex-col gap-4 rounded-[22px] border border-line bg-paper/60 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Today&apos;s opponent</p>
        <p className="mt-2 font-serif text-3xl italic leading-tight">{p.name}</p>
        <p className="mt-1 text-sm text-ink-2">{p.blurb}</p>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
        <Link href={hasCard ? `/vs?a=me&b=${p.key}` : `/vs?b=${p.key}`} className="rounded-full bg-accent px-6 py-2.5 font-semibold text-paper">
          Fight
        </Link>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">New opponent at midnight UTC</p>
      </div>
    </section>
  );
}
