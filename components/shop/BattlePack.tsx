"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HoloCard } from "@/components/card/HoloCard";
import type { CardData } from "@/lib/card";
import { sfx } from "@/lib/sound";
import { whenAuthReady } from "@/lib/authBridge";
import { MarketHead, ResetClock, walletChanged } from "./Market";

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
const SKIN: Record<Kind, { box: string; ink: string; btn: string; foil: string; glyph: string; badge: string }> = {
  star: {
    box: "border-line bg-card",
    ink: "text-ink",
    btn: "border border-line text-ink hover:border-ink-3",
    foil: "radial-gradient(120% 90% at 30% 10%, #3a3a46, #15151b 70%)",
    glyph: "✦",
    badge: "Starter",
  },
  flare: {
    box: "border-[#83fff7]/30 bg-card",
    ink: "text-[#83fff7]",
    btn: "bg-[#83fff7] text-paper",
    foil: "radial-gradient(120% 90% at 30% 10%, #2bb5b0, #0c2b3a 55%, #0b0b12)",
    glyph: "✸",
    badge: "Brighter odds",
  },
  supernova: {
    box: "border-accent/50 bg-card shadow-[0_0_60px_-24px_rgba(198,255,61,0.55)]",
    ink: "text-accent",
    btn: "bg-accent text-paper",
    foil: "conic-gradient(from 200deg at 50% 60%, #c6ff3d, #83fff7, #7894ff, #d875ff, #ff7773, #c6ff3d)",
    glyph: "✺",
    badge: "Best odds",
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
    walletChanged();
  };

  const packs = info?.packs ?? [];
  const dust = typeof info?.dust === "number" ? info.dust : null;

  return (
    <section id="packs" className="mt-14 scroll-mt-36">
      <MarketHead
        kicker="Battle Packs"
        pay="dust"
        title={<>One stranger, <span className="text-accent">ready to fight.</span></>}
        blurb="Each pack holds one real card from someone else's sky. It joins your collection to battle, never your deck. One pack a day, whichever you pick."
        aside={<ResetClock />}
      />

      {cards?.length ? (
        <div className="mt-8 rounded-[24px] border border-line bg-paper/60 p-6">
          <ul className="flex justify-center">
            {cards.map(({ code, card }, i) => (
              <li key={code} className="rise flex flex-col items-center" style={{ animationDelay: `${i * 140}ms` }}>
                <Link href={`/vs/${code}`} aria-label={`Fight ${card.archetype}`} className="block transition hover:-translate-y-1">
                  <HoloCard card={card} width={200} idle={false} copy />
                </Link>
                <Link href={`/vs/${code}`} className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-paper transition hover:brightness-110">
                  Fight {card.archetype}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">Today&apos;s pack is open. The next one restocks at midnight UTC.</p>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {packs.map((p) => {
            const afford = dust !== null && dust >= p.cost;
            const sk = SKIN[p.kind];
            return (
              <li key={p.kind} className={`group relative flex flex-col overflow-hidden rounded-[22px] border transition hover:-translate-y-0.5 ${sk.box}`}>
                {/* the pack itself: a crimped foil sleeve in the pack's own light */}
                <div className="relative grid h-28 place-items-center sm:h-36 overflow-hidden border-b border-white/[0.06]" style={{ background: sk.foil }}>
                  <div aria-hidden className="absolute inset-x-0 top-0 h-2.5 opacity-60" style={{ background: "repeating-linear-gradient(90deg, rgba(255,255,255,.35) 0 4px, transparent 4px 9px)" }} />
                  <div aria-hidden className="absolute inset-0 bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.18)_45%,transparent_60%)] transition-transform duration-700 group-hover:translate-x-1/3" />
                  <span aria-hidden className="relative font-display text-[56px] leading-none text-white drop-shadow-[0_6px_20px_rgba(0,0,0,0.45)]">{sk.glyph}</span>
                  <span className="absolute left-3 top-4 rounded-full bg-black/45 px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white backdrop-blur-sm">{sk.badge}</span>
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-display text-[19px] font-semibold tracking-tight text-ink">{p.name}</p>
                    <p className={`font-display text-[22px] font-bold tabular-nums ${sk.ink}`}>
                      <span aria-hidden className="mr-1 text-[15px]">✦</span>
                      {p.cost}
                    </p>
                  </div>
                  <p className="mt-1 text-[13.5px] text-ink-2">{p.blurb}</p>

                  {/* odds as one bar, so packs compare at a glance */}
                  <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={p.odds.map((o) => `${LABEL[o.tier] ?? o.tier} ${Math.round(o.p * 100)}%`).join(", ")}>
                    {p.odds.map((o) => (
                      <span key={o.tier} style={{ width: `${o.p * 100}%`, background: BAR[o.tier] }} />
                    ))}
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                    {p.odds.map((o) => (
                      <li key={o.tier} className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: BAR[o.tier] }} />
                        {LABEL[o.tier] ?? o.tier} <span className="tabular-nums text-ink-2">{Math.round(o.p * 100)}%</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-5">
                    {info?.on && info.signedIn ? (
                      <button type="button" disabled={busy || !afford} onClick={() => void open(p.kind, p.cost)} className={`w-full rounded-full py-3 text-sm font-semibold transition disabled:opacity-40 ${sk.btn}`}>
                        {busy ? "Opening…" : afford ? `Open for ✦ ${p.cost}` : `Need ✦ ${p.cost - (dust ?? 0)} more`}
                      </button>
                    ) : info?.on ? (
                      <button type="button" onClick={() => void whenAuthReady().then((b) => b?.openSignIn())} className="w-full rounded-full border border-line py-3 text-sm text-ink-2 transition hover:border-ink-3 hover:text-ink">
                        Sign in to open
                      </button>
                    ) : (
                      <span className="block rounded-full border border-line py-3 text-center text-sm text-ink-3">Opens when Stardust is on</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {msg && <p className="mt-4 text-sm text-warn">{msg}</p>}
      <p className="mt-4 text-xs text-ink-3">
        {info?.sale
          ? "Stardust comes from retiring or regretting cards, or from a bundle. It also pays for recasts and living sigils. It can't be sold, traded or cashed out."
          : "Stardust comes only from retiring or regretting cards. It can't be bought, sold, traded or cashed out."}
      </p>
    </section>
  );
}
