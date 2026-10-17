"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HoloCard } from "@/components/card/HoloCard";
import type { CardData } from "@/lib/card";
import { sfx } from "@/lib/sound";

type Odds = { tier: string; p: number }[];
interface PackInfo {
  on: boolean;
  signedIn?: boolean;
  cost: number;
  odds: Odds;
  dust?: number | null;
  today?: { day: string; cards: { code: string; card: CardData }[] } | null;
}

const LABEL: Record<string, string> = { common: "Common", rare: "Rare", holo: "Holo", secret: "Secret" };

/**
 * The one thing Stardust buys: three cards from other people's skies, to fight. Odds are published, the pack is fixed
 * for the day, and Stardust is earned only (never sold), per docs/design/regret-burn-legal.md.
 */
export function BattlePack() {
  const [info, setInfo] = useState<PackInfo | null>(null);
  const [cards, setCards] = useState<{ code: string; card: CardData }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  useEffect(() => {
    fetch("/api/pack", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<PackInfo>) : null))
      .then((j) => {
        if (!j) return;
        setInfo(j);
        if (j.today?.cards.length) setCards(j.today.cards);
      })
      .catch(() => {});
  }, []);

  const open = async () => {
    setBusy(true);
    setMsg(undefined);
    sfx("tear");
    const res = await fetch("/api/pack", { method: "POST" }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { cards?: { code: string; card: CardData }[]; error?: string } | null;
    setBusy(false);
    if (!res?.ok || !j?.cards) return setMsg(j?.error ?? "Couldn't open it just now.");
    sfx("reveal");
    setCards(j.cards);
    setInfo((i) => (i && typeof i.dust === "number" ? { ...i, dust: Math.max(0, i.dust - i.cost) } : i));
  };

  const odds = (info?.odds ?? []).map((o) => `${LABEL[o.tier] ?? o.tier} ${Math.round(o.p * 100)}%`).join(" · ");

  return (
    <section className="mt-16 rounded-[28px] border border-accent/30 bg-paper/60 p-6 sm:p-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Battle Pack · Stardust only</p>
      <h2 className="mt-2 font-serif text-4xl italic leading-tight">Three strangers, ready to fight.</h2>
      <p className="mt-3 max-w-xl text-ink-2">
        Three real cards from other people&apos;s skies. They go to your collection to battle, never into your deck. One pack a day, the same pack all day.
      </p>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">Odds per card: {odds || "…"}</p>

      {cards?.length ? (
        <>
          <ul className="mt-8 grid grid-cols-1 justify-items-center gap-8 sm:grid-cols-3">
            {cards.map(({ code, card }, i) => (
              <li key={code} className="rise flex flex-col items-center" style={{ animationDelay: `${i * 140}ms` }}>
                <Link href={`/vs/${code}`} aria-label={`Fight ${card.archetype}`} className="block transition hover:-translate-y-1">
                  <HoloCard card={card} width={200} idle={false} />
                </Link>
                <Link href={`/vs/${code}`} className="mt-3 rounded-full border border-line px-4 py-1.5 text-sm text-ink-2 hover:border-accent hover:text-ink">
                  Fight {card.archetype}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">Today&apos;s pack is open. A new one tomorrow.</p>
        </>
      ) : (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          {info?.on && info.signedIn ? (
            <button type="button" disabled={busy} onClick={() => void open()} className="rounded-full bg-accent px-6 py-2.5 font-semibold text-paper disabled:opacity-50">
              {busy ? "Opening…" : `Open for ${info.cost} Stardust`}
            </button>
          ) : (
            <span className="rounded-full border border-line px-5 py-2 text-sm text-ink-3">{info?.on ? "Sign in to open packs" : "Opens when Stardust is on"}</span>
          )}
          {typeof info?.dust === "number" && <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">You have {info.dust} Stardust</span>}
        </div>
      )}
      {msg && <p className="mt-4 text-sm text-warn">{msg}</p>}
      <p className="mt-6 text-xs text-ink-3">Stardust comes only from retiring or regretting cards. It can&apos;t be bought, sold, traded or cashed out.</p>
    </section>
  );
}
