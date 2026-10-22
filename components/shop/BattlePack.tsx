"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HoloCard } from "@/components/card/HoloCard";
import type { CardData } from "@/lib/card";
import { sfx } from "@/lib/sound";
import { whenAuthReady } from "@/lib/authBridge";

type Odds = { tier: string; p: number }[];
type Kind = "star" | "flare" | "supernova";
interface PackInfo {
  on: boolean;
  signedIn?: boolean;
  cost: number;
  odds: Odds;
  packs?: { kind: Kind; name: string; cost: number; blurb: string; odds: Odds }[];
  /** Stardust bundles are on sale (payments live). */
  sale?: boolean;
  dust?: number | null;
  today?: { day: string; cards: { code: string; card: CardData }[] } | null;
}

const LABEL: Record<string, string> = { common: "Common", rare: "Rare", holo: "Holo", secret: "Secret" };
const BAR: Record<string, string> = { common: "#b9b5ad", rare: "#83fff7", holo: "#d875ff", secret: "#c6ff3d" };
/** Each pack wears its own light: plain starlight, a cool flare, and a full holo burst. */
const SKIN: Record<Kind, { box: string; glow: string; ink: string; btn: string }> = {
  star: { box: "border-line bg-card", glow: "bg-white/10", ink: "text-ink-2", btn: "border border-line text-ink hover:border-ink-3" },
  flare: { box: "border-[#83fff7]/30 bg-card", glow: "bg-[#83fff7]/25", ink: "text-[#83fff7]", btn: "bg-[#83fff7] text-paper" },
  supernova: {
    box: "border-accent/50 bg-[linear-gradient(160deg,rgba(198,255,61,0.10),rgba(216,117,255,0.06)_60%,transparent)] shadow-[0_0_60px_-20px_rgba(198,255,61,0.5)]",
    glow: "bg-[conic-gradient(from_90deg,#c6ff3d,#83fff7,#d875ff,#c6ff3d)] opacity-50",
    ink: "text-accent",
    btn: "bg-accent text-paper",
  },
};

/**
 * The one thing Stardust buys: one card from someone else's sky, to fight, in three packs with published odds. One
 * pack a day across all three. Stardust is earned, or bought in bundles once payments are live (lib/products.ts dustSaleOn).
 */
export function BattlePack() {
  const [info, setInfo] = useState<PackInfo | null>(null);
  const [cards, setCards] = useState<{ code: string; card: CardData }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  useEffect(() => {
    const load = () =>
      fetch("/api/pack", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<PackInfo>) : null))
        .then((j) => {
          if (!j) return;
          setInfo(j);
          if (j.today?.cards.length) setCards(j.today.cards);
        })
        .catch(() => {});
    // Asked before Clerk has refreshed the session, the server sees nobody and says "Sign in to open": wait for it,
    // and ask again whenever the sign-in state changes.
    let off: (() => void) | undefined;
    void whenAuthReady().then((b) => {
      void load();
      off = b?.onChange(() => void load());
    });
    return () => off?.();
  }, []);

  const open = async (kind: Kind, cost: number) => {
    setBusy(true);
    setMsg(undefined);
    sfx("tear");
    const res = await fetch("/api/pack", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { cards?: { code: string; card: CardData }[]; error?: string } | null;
    setBusy(false);
    if (!res?.ok || !j?.cards) return setMsg(j?.error ?? "Couldn't open it just now.");
    sfx("reveal");
    setCards(j.cards);
    setInfo((i) => (i && typeof i.dust === "number" ? { ...i, dust: Math.max(0, i.dust - cost) } : i));
  };

  const packs = info?.packs ?? [];

  return (
    <section className="mt-16 rounded-[28px] border border-accent/30 bg-paper/60 p-6 sm:p-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Battle Packs · Stardust only</p>
      <h2 className="mt-2 font-serif text-4xl italic leading-tight">One stranger, ready to fight.</h2>
      <p className="mt-3 max-w-xl text-ink-2">
        Each pack holds one real card from someone else&apos;s sky. It goes to your collection to battle, never into your deck. One pack a day, whichever you pick.
      </p>

      {cards?.length ? (
        <>
          <ul className="mt-8 flex justify-center">
            {cards.map(({ code, card }, i) => (
              <li key={code} className="rise flex flex-col items-center" style={{ animationDelay: `${i * 140}ms` }}>
                <Link href={`/vs/${code}`} aria-label={`Fight ${card.archetype}`} className="block transition hover:-translate-y-1">
                  <HoloCard card={card} width={200} idle={false} copy />
                </Link>
                <Link href={`/vs/${code}`} className="mt-3 rounded-full border border-line px-4 py-1.5 text-sm text-ink-2 hover:border-accent hover:text-ink">
                  Fight {card.archetype}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">Today&apos;s pack is open. A new one tomorrow.</p>
        </>
      ) : (
        <>
          <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {packs.map((p) => {
              const afford = typeof info?.dust === "number" && info.dust >= p.cost;
              return (
                <li key={p.kind} className={`relative flex flex-col overflow-hidden rounded-[22px] border p-5 ${SKIN[p.kind].box}`}>
                  <div aria-hidden className={`pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full blur-3xl ${SKIN[p.kind].glow}`} />
                  <p className={`relative font-mono text-[10.5px] uppercase tracking-[0.22em] ${SKIN[p.kind].ink}`}>{p.name}</p>
                  <p className="relative mt-2 font-display text-4xl font-semibold tracking-[-0.03em] text-ink">
                    {p.cost}
                    <span className="ml-1.5 align-middle text-sm font-normal text-ink-3">dust</span>
                  </p>
                  <p className="relative mt-1 text-sm text-ink-2">{p.blurb}</p>
                  <ul className="relative mt-4 flex flex-col gap-1.5">
                    {p.odds.map((o) => (
                      <li key={o.tier} className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3">
                        <span className="w-12">{LABEL[o.tier] ?? o.tier}</span>
                        <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                          <span className="block h-full rounded-full" style={{ width: `${Math.max(3, o.p * 100)}%`, background: BAR[o.tier] }} />
                        </span>
                        <span className="w-8 text-right tabular-nums text-ink-2">{Math.round(o.p * 100)}%</span>
                      </li>
                    ))}
                  </ul>
                  <div className="relative mt-5">
                    {info?.on && info.signedIn ? (
                      <button type="button" disabled={busy || !afford} onClick={() => void open(p.kind, p.cost)} className={`w-full rounded-full py-2.5 text-sm font-semibold transition disabled:opacity-40 ${SKIN[p.kind].btn}`}>
                        {busy ? "Opening…" : afford ? "Open" : `Need ${p.cost - (info.dust ?? 0)} more`}
                      </button>
                    ) : (
                      info?.on ? (
                        <button type="button" onClick={() => void whenAuthReady().then((b) => b?.openSignIn())} className="w-full rounded-full border border-line py-2.5 text-sm text-ink-2 transition hover:border-ink-3 hover:text-ink">
                          Sign in to open
                        </button>
                      ) : (
                        <span className="block rounded-full border border-line py-2.5 text-center text-sm text-ink-3">Opens when Stardust is on</span>
                      )
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {typeof info?.dust === "number" && <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">You have {info.dust} Stardust</p>}
        </>
      )}
      {msg && <p className="mt-4 text-sm text-warn">{msg}</p>}
      <p className="mt-6 text-xs text-ink-3">
        {info?.sale
          ? "Stardust comes from retiring or regretting cards, or from a bundle. It also pays for recasts and living sigils. It can't be sold, traded or cashed out."
          : "Stardust comes only from retiring or regretting cards. It can't be bought, sold, traded or cashed out."}
      </p>
    </section>
  );
}
