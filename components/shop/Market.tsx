"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CardData } from "@/lib/card";
import { whenAuthReady } from "@/lib/authBridge";

/** Fired after anything in the shop spends Stardust, so the wallet in the market bar re-reads it. */
export const WALLET_EVENT = "tastrology:wallet";
export const walletChanged = () => window.dispatchEvent(new Event(WALLET_EVENT));

const TABS = [
  ["packs", "Packs"],
  ["atelier", "Atelier"],
  ["readings", "Readings"],
] as const;

/**
 * The market's sticky strip under the site nav: aisles on the left (the one in view lit), your wallet on the right.
 * The wallet waits for the session (see BattlePack) and re-reads on sign-in changes and on WALLET_EVENT.
 */
export function MarketBar() {
  const [at, setAt] = useState<string>("packs");
  const [me, setMe] = useState<{ signedIn: boolean; dust: number | null; credits: number | null } | null>(null);
  // Sits flush under the site nav, whose height changes with the screen (and the avatar), so measure it.
  const [top, setTop] = useState(57);
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>("body nav.sticky");
    if (!nav) return;
    const ro = new ResizeObserver(() => setTop(Math.round(nav.getBoundingClientRect().height)));
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => {
        const hit = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setAt(hit.target.id);
      },
      { rootMargin: "-140px 0px -55% 0px" },
    );
    for (const [id] of TABS) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const load = () =>
      fetch("/api/me", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((m: { signedIn?: boolean; credits?: number | null; stardust?: { dust: number | null } | null } | null) =>
          setMe(m ? { signedIn: Boolean(m.signedIn), dust: m.stardust?.dust ?? null, credits: m.credits ?? null } : null),
        )
        .catch(() => {});
    let off: (() => void) | undefined;
    void whenAuthReady().then((b) => {
      void load();
      off = b?.onChange(() => void load());
    });
    window.addEventListener(WALLET_EVENT, load);
    return () => {
      off?.();
      window.removeEventListener(WALLET_EVENT, load);
    };
  }, []);

  const chip = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-paper/70 px-3 py-1.5 font-mono text-[11px] tabular-nums text-ink";
  return (
    <div style={{ top }} className="sticky z-30 -mx-4 mt-8 border-y border-line/70 bg-paper/80 px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <nav aria-label="Market aisles" className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]">
          {TABS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={at === id ? "true" : undefined}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${at === id ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2 hover:text-ink"}`}
            >
              {label}
            </a>
          ))}
        </nav>
        {me?.signedIn ? (
          <div className="flex shrink-0 items-center gap-2" aria-label="Your wallet">
            {me.dust !== null && (
              <span className={chip} title="Stardust">
                <span aria-hidden className="text-accent">✦</span>
                {me.dust}
              </span>
            )}
            {me.credits !== null && (
              <Link href="/account" className={`${chip} hidden hover:border-ink-3 sm:inline-flex`} title="Readings left">
                {me.credits} {me.credits === 1 ? "reading" : "readings"}
              </Link>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const TIER: Record<string, string> = { secret: "#c6ff3d", holo: "#d875ff", rare: "#83fff7", common: "#b9b5ad" };

/** A slow marquee of real Holo and Secret pulls from the Hall: what's out there, one tap from each card. */
export function MarketTicker() {
  const [cards, setCards] = useState<{ code: string; card: CardData }[]>([]);
  useEffect(() => {
    fetch("/api/rares")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { cards?: { code: string; card: CardData }[] } | null) => setCards(j?.cards ?? []))
      .catch(() => {});
  }, []);
  if (cards.length < 2) return null;
  // twice over, so the loop has no seam
  const row = [...cards, ...cards];
  return (
    <div className="group relative -mx-4 mt-8 overflow-hidden border-y border-line/60 py-2.5 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)] sm:-mx-6">
      <ul className="market-ticker flex w-max gap-8 group-hover:[animation-play-state:paused]" style={{ animationDuration: `${cards.length * 7}s` }}>
        {row.map(({ code, card }, i) => (
          <li key={`${code}-${i}`} aria-hidden={i >= cards.length || undefined}>
            <Link href={`/c/${code}`} tabIndex={i >= cards.length ? -1 : undefined} className="flex items-center gap-2.5 whitespace-nowrap text-[13px] text-ink-2 transition hover:text-ink">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: TIER[card.rarity] ?? "#b9b5ad" }}>
                {card.rarityLabel}
              </span>
              <span className="font-display font-semibold text-ink">{card.archetype}</span>
              <span className="font-mono text-[10.5px] text-ink-3">No. {card.serial}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Time left until the next UTC day, when packs restock. */
export function ResetClock() {
  const [left, setLeft] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const ms = 86_400_000 - (now % 86_400_000);
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setLeft(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
      Restocks in <span className="tabular-nums">{left ?? "--:--:--"}</span>
    </span>
  );
}

/** Every aisle opens the same way: what it is, how you pay, and anything live (a clock, a balance). */
export function MarketHead({ kicker, title, blurb, pay, aside }: { kicker: string; title: React.ReactNode; blurb?: React.ReactNode; pay: "dust" | "usd"; aside?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-xl">
        <p className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-3">
          {kicker}
          <span className={`rounded-full border px-2 py-0.5 text-[9.5px] tracking-[0.16em] ${pay === "dust" ? "border-accent/40 text-accent" : "border-line text-ink-2"}`}>
            {pay === "dust" ? "✦ Stardust" : "$ USD"}
          </span>
        </p>
        <h2 className="mt-2 font-serif text-4xl italic leading-[1.02] sm:text-5xl">{title}</h2>
        {blurb && <p className="mt-3 text-[15px] text-ink-2">{blurb}</p>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  );
}
