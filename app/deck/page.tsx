"use client";

import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BurnButton } from "@/components/card/BurnButton";
import { dissolve, playBurnSound } from "@/components/card/dissolve";
import { HoloCard, RARITY_GLOW } from "@/components/card/HoloCard";
import { Collection } from "@/components/deck/Collection";
import { DailyOpponent } from "@/components/deck/DailyOpponent";
import { DustCounter } from "@/components/deck/DustCounter";
import { NextCard, type Me } from "@/components/deck/NextCard";
import { Timeline } from "@/components/deck/Timeline";
import { Sky } from "@/components/reveal/Sky";
import { skyState } from "@/components/reveal/traceModel";
import { CursorArrow } from "@/components/CursorArrow";
import { SkyBackdrop } from "@/components/site/SkyBackdrop";
import c from "@/components/site/celestial.module.css";
import { SiteNav } from "@/components/site/SiteShell";
import { whenAuthReady } from "@/lib/authBridge";
import { buildCard, cardCode, SEASON } from "@/lib/card";
import { burnFromDeck, claimDeviceDeck, loadDeck, type BurnReply, type DeckBurn, type DeckEntry } from "@/lib/deck";
import { isPersonaRequest } from "@/lib/personas";
import type { AgentRequest, StyleResult } from "@/lib/types";

/** The card saved in this browser (last reading), if any. */
function savedCard(): { req?: AgentRequest; mock: boolean; entry: DeckEntry } | null {
  try {
    const saved = JSON.parse(localStorage.getItem("tastrology:v1") ?? "null") as { req?: AgentRequest; result?: StyleResult } | null;
    const card = saved?.result ? buildCard(saved.result) : null;
    return card ? { req: saved?.req, mock: saved?.result?.mode === "mock", entry: { code: cardCode(card), card, addedAt: 0 } } : null;
  } catch {
    return null;
  }
}

/**
 * Signed-in visit: move this device's anonymous deck into the account (server, write-once per device),
 * and file the card saved in this browser too. Returns how many device cards moved.
 */
async function claimOnce(): Promise<number> {
  const b = await whenAuthReady();
  if (!b?.signedIn()) return 0;
  const moved = await claimDeviceDeck();
  const local = savedCard();
  if (local && !local.mock && !isPersonaRequest(local.req)) {
    await fetch("/api/deck", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: local.entry.code }) }).catch(() => {});
  }
  return moved;
}

/** Every card this device has minted. Server deck (DynamoDB) when it's on; otherwise the one card saved in this browser. */
export default function DeckPage() {
  const [cards, setCards] = useState<DeckEntry[] | null>(null);
  const [local, setLocal] = useState(false);
  const [error, setError] = useState<string>();
  const [owner, setOwner] = useState<"user" | "device">("device");
  const [toast, setToast] = useState<string>();
  const [burn, setBurn] = useState<DeckBurn | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [hasLocal, setHasLocal] = useState(false);

  useEffect(() => {
    let off = false;
    (async () => {
      const moved = await claimOnce();
      if (off) return;
      if (moved > 0) setToast("Cards from this device moved to your account.");
      const [d, m] = await Promise.all([loadDeck(), fetch("/api/me", { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<Me>) : null)).catch(() => null)]);
      if (off) return;
      setMe(m);
      setHasLocal(savedCard() !== null);
      if (d.owner) setOwner(d.owner);
      if (d.burn?.on) setBurn(d.burn);
      if (d.enabled && !d.error) return setCards(d.cards);
      // No server deck (or it's unreachable): fall back to the card saved on this device.
      setError(d.error);
      setLocal(true);
      const local = savedCard();
      setCards(local ? [local.entry] : []);
    })();
    return () => {
      off = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const reduce = Boolean(useReducedMotion());
  const sky = useMemo(() => (cards?.[0] ? skyState(cards[0].card.evolvesFrom, cards[0].card.archetype) : null), [cards]);

  // ---- Burning (docs/design/burn.md). Only for signed-in accounts, only on your own mints.
  const [armed, setArmed] = useState<string | null>(null);
  const [burning, setBurning] = useState<string | null>(null);
  const counterRef = useRef<HTMLDivElement>(null);
  const cardEls = useRef(new Map<string, HTMLDivElement>());

  /** Hold heat: the edges char inward and the foil runs hot. */
  const heat = useCallback(
    (code: string, p: number) => {
      const el = cardEls.current.get(code);
      if (!el || reduce) return;
      const mask = p > 0 ? `radial-gradient(140% 120% at 50% 50%, #000 ${100 - p * 40}%, transparent ${118 - p * 34}%)` : "";
      el.style.maskImage = mask;
      el.style.webkitMaskImage = mask;
      el.style.filter = p > 0 ? `sepia(${p * 0.45}) saturate(${1 + p * 0.9}) brightness(${1 + p * 0.12}) drop-shadow(0 0 ${p * 18}px rgb(198 255 61 / ${p * 0.5}))` : "";
    },
    [reduce],
  );

  /** Whether the armed card is being retired or regretted. */
  const [regretting, setRegretting] = useState(false);

  const doBurn = async (entry: DeckEntry) => {
    const regret = regretting;
    const { code, card } = entry;
    setBurning(code);
    if (!reduce) playBurnSound();
    const el = cardEls.current.get(code);
    const colors = [...card.types.flatMap((t) => [t.a, t.b]), RARITY_GLOW[card.rarity], RARITY_GLOW[card.rarity]];
    const fx = el ? dissolve(el, { target: burn?.dustOn ? counterRef.current : null, colors, reduce }) : null;
    const [res] = await Promise.all([burnFromDeck(code, regret), fx?.done]);
    if (!res.httpOk || !res.status) {
      fx?.restore();
      heat(code, 0);
      setBurning(null);
      setArmed(null);
      setToast(res.error ?? "Couldn't burn it just now. Try again in a moment.");
      return;
    }
    setCards((cs) => cs?.filter((c) => c.code !== code) ?? cs);
    // The sign saved in this browser was this card: forget it, so home doesn't bring it back and the deck doesn't re-file it.
    if (savedCard()?.entry.code === code) {
      try {
        localStorage.removeItem("tastrology:v1");
      } catch {}
    }
    cardEls.current.delete(code);
    setBurning(null);
    setArmed(null);
    if (res.status === "regretted") {
      setBurn((b) => (b ? { ...b, regretsLeft: res.regretsLeft ?? 0, dust: typeof res.balance === "number" ? res.balance : b.dust } : b));
      // A regret credit is a card in hand: the next-card slot lights up.
      if (res.kind === "credit") setMe((m) => (m ? { ...m, credits: (m.credits ?? 0) + 1 } : m));
      setCards((cs) => cs?.map((c) => ({ ...c, regret: false })) ?? cs);
      setToast(res.kind === "credit" ? "Let go. Your next card is ready: pick different loves." : `Let go. +${res.dust ?? 0} Stardust.`);
      return;
    }
    if (burn?.dustOn && typeof res.balance === "number") {
      const bal = res.balance;
      setBurn((b) => (b ? { ...b, dust: bal, weekLeft: b.weekLeft === null ? null : Math.max(0, b.weekLeft - (res.dust ?? 0)) } : b));
    }
    setToast(burnToast(res, Boolean(burn?.dustOn)));
  };

  return (
    <div className="relative isolate min-h-screen">
      {sky ? <Sky f={sky} reduce={reduce} drawn fixed quiet dim={0.4} /> : <SkyBackdrop dim={0.6} focus={[0.4, 0.5]} />}
      <SiteNav />
      {toast && (
        <div role="status" className="rise fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2.5 rounded-full border border-accent/40 bg-paper/95 px-5 py-2.5 text-sm text-ink shadow-lg backdrop-blur-md">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          {toast}
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">Season {SEASON}</p>
        <h1 className="mt-2 font-serif text-5xl italic leading-[0.95] sm:text-6xl">Your deck</h1>
        <p className="mt-3 max-w-xl text-ink-2">
          {cards === null
            ? "Shuffling…"
            : local
              ? "Only your latest card is kept in this browser."
              : `${cards.length} ${cards.length === 1 ? "card" : "cards"}, kept ${owner === "user" ? "in your account" : "for this device"}. Every one is a verified original you can share.`}
        </p>
        {error && <p className="mt-2 font-mono text-[11px] text-warn">{error}</p>}
        {burn?.on && !local && (
          <div className="mt-6 flex flex-wrap items-center gap-4">
            {burn.dustOn && <DustCounter ref={counterRef} value={burn.dust ?? 0} weekLeft={burn.weekLeft} reduce={reduce} />}
          </div>
        )}

        {cards?.length === 0 && (
          <div className="mt-14 flex flex-col items-start gap-10 sm:flex-row sm:items-center">
            {/* ghost slots: where your cards will live, already traced in starlight */}
            <div className="relative h-[260px] w-[300px] shrink-0" aria-hidden>
              {[-12, 0, 12].map((r, k) => (
                <div key={r} className={c.slot} style={{ position: "absolute", left: 70 + k * 40, top: 10 + Math.abs(r), width: 150, rotate: `${r}deg`, animationDelay: `${k * -2}s` }}>
                  {[[0, 0], [100, 0], [100, 100], [0, 100], [50, 38]].map(([x, y], j) => (
                    <i key={j} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(j + k) * 0.4}s` }} />
                  ))}
                </div>
              ))}
            </div>
            <div className="max-w-md">
            <p className="font-serif text-3xl italic leading-tight text-ink">Your sky is still empty.</p>
            <p className="mt-2 text-ink-2">Name three to eight things you love and get your card. It&apos;s yours alone, and a new one comes each new moon.</p>
            <Link href="/" className="mt-6 inline-flex items-center gap-3 rounded-full bg-accent py-2 pl-6 pr-2 font-semibold text-paper">
              Get your sign
              <CursorArrow className="h-9 w-9 bg-paper text-accent" />
            </Link>
            </div>
          </div>
        )}

        {!!cards?.length && <DailyOpponent hasCard={hasLocal} />}

        {!!cards?.length && (
          <ul className="mt-12 grid grid-cols-1 justify-items-center gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((entry, i) => {
              const { code, card } = entry;
              const burnable = Boolean(burn?.on && !local && entry.minted);
              return (
                <li key={code} className="rise flex flex-col items-center" style={{ animationDelay: `${Math.min(i, 9) * 60}ms` }}>
                  <div
                    ref={(el) => {
                      if (el) cardEls.current.set(code, el);
                    }}
                  >
                    <Link href={`/c/${code}`} aria-label={`Open ${card.archetype}`} className="block transition duration-300 hover:-translate-y-1">
                      <HoloCard card={card} width={260} idle={false} still={reduce} />
                    </Link>
                  </div>
                  <p className="mt-4 text-center font-serif text-xl italic leading-tight">{card.archetype}</p>
                  <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">
                    No. {card.serial} · {card.rarityLabel} · {code}
                  </p>
                  {burnable && armed !== code && (
                    <div className="mt-3 flex items-center gap-5">
                      {entry.regret && (
                        <button
                          type="button"
                          disabled={Boolean(burning)}
                          onClick={() => {
                            setRegretting(true);
                            setArmed(code);
                          }}
                          className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-accent transition hover:text-ink disabled:opacity-40"
                        >
                          Regret this card
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={Boolean(burning)}
                        onClick={() => {
                          setRegretting(false);
                          setArmed(code);
                        }}
                        className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3 transition hover:text-accent disabled:opacity-40"
                      >
                        Retire this card
                      </button>
                    </div>
                  )}
                  {burnable && burn && armed === code && (
                    <div className="mt-4 flex flex-col items-center gap-3">
                      <p className="max-w-[260px] text-center font-serif text-base italic leading-snug text-ink-2">{regretting ? regretLine(burn) : confirmLine(entry, burn)}</p>
                      <BurnButton disabled={burning !== null} onProgress={(p) => heat(code, p)} onBurn={() => void doBurn(entry)} />
                      {burning !== code && (
                        <button
                          type="button"
                          onClick={() => {
                            heat(code, 0);
                            setArmed(null);
                          }}
                          className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3 transition hover:text-ink"
                        >
                          Keep it
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
            {!local && me && (
              <li className="rise flex flex-col items-center">
                <NextCard me={me} count={cards.length} />
              </li>
            )}
          </ul>
        )}

        {!!cards?.length && !local && <Timeline cards={cards} />}
        {owner === "user" && <Collection />}
      </main>
    </div>
  );
}

/** What a regret gives back: the first brings a new card, the second 50 Stardust (docs/design/regret-burn.md). */
function regretLine(burn: DeckBurn): string {
  const left = burn.regretsLeft ?? 0;
  if (left >= 2) return "Let it go and make a new card from different loves. You get one more regret after this.";
  return "Let it go for 50 Stardust. This is your last regret.";
}

/** The one plain line above the hold button. Never promises dust the burn won't pay. */
function confirmLine(entry: DeckEntry, burn: DeckBurn): string {
  if (!burn.dustOn) return "Permanent. Its share link stops working, and it doesn't bring your next card sooner.";
  const earns = entry.earns ?? 0;
  const label = entry.card.rarityLabel;
  if (earns <= 0) return `${label} · earns no dust · permanent`;
  const left = burn.weekLeft ?? earns;
  if (left <= 0) return `${label} · weekly dust cap reached, earns 0 · permanent`;
  return `${label} · ${Math.min(earns, left)} dust · permanent`;
}

function burnToast(res: BurnReply, dustOn: boolean): string {
  if (!dustOn) return "Retired. Its link is gone.";
  const d = res.dust ?? 0;
  if (d > 0) return res.capped ? `Ash. +${d} dust. That's the weekly cap.` : `Ash. +${d} dust.`;
  if (res.reason === "cap") return "Burned. Weekly dust cap reached, so no dust this time.";
  if (res.reason === "burned-before") return "Burned. This sign was burned before, so no dust.";
  if (res.reason === "uncharged") return "Burned. This one didn't cost a credit, so no dust.";
  return "Retired. Its link is gone.";
}
