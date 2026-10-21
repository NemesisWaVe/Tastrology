"use client";

import type { Teaser } from "@/lib/brandOpen";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BurnButton } from "@/components/card/BurnButton";
import { dissolve, playBurnSound } from "@/components/card/dissolve";
import { HoloCard, RARITY_GLOW } from "@/components/card/HoloCard";
import { BrandSheet } from "@/components/deck/BrandSheet";
import { Collection } from "@/components/deck/Collection";
import { StardustTable } from "@/components/shop/StardustTable";
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
import { buildCard, cardCode, cardNo, proxied, SEASON } from "@/lib/card";
import { burnFromDeck, claimDeviceDeck, loadDeck, type BurnReply, type DeckBurn, type DeckEntry } from "@/lib/deck";
import { isPersonaRequest } from "@/lib/personas";
import { forgetReading } from "@/lib/readings";
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

/** The reading saved in this browser carries the full receipt: hand it to the server once, so the card keeps its brands. */
function backfillReceipt() {
  try {
    if (sessionStorage.getItem("tastrology:receipt-sent")) return;
    const saved = JSON.parse(localStorage.getItem("tastrology:v1") ?? "null") as { result?: StyleResult } | null;
    if (!saved?.result || saved.result.mode === "mock") return;
    const code = cardCode(buildCard(saved.result));
    sessionStorage.setItem("tastrology:receipt-sent", "1");
    void fetch(`/api/card/${encodeURIComponent(code)}/receipt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ result: saved.result }) }).catch(() => {});
  } catch {}
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
  backfillReceipt();
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
  const [sheet, setSheet] = useState<DeckEntry | null>(null);
  // Brand teasers (lib/brandOpen.ts): the brand peeking out, this week's fresh count, and whether the seal is broken.
  const [teas, setTeas] = useState<Record<string, Teaser>>({});
  const closeSheet = useCallback(() => setSheet(null), []);

  useEffect(() => {
    let off = false;
    (async () => {
      const moved = await claimOnce();
      if (off) return;
      if (moved > 0) setToast("Cards from this device moved to your account.");
      const [d, m] = await Promise.all([loadDeck(), fetch("/api/me", { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<Me>) : null)).catch(() => null)]);
      if (off) return;
      setMe(m);
      if (d.owner === "user")
        void fetch("/api/deck/teasers", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((j: { teasers?: Record<string, Teaser> } | null) => j?.teasers && setTeas(j.teasers))
          .catch(() => {});
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
  // Prints of one reading (same loves): which copy each card is, oldest first. Only set when there's more than one.
  const prints = useMemo(() => {
    const runs = new Map<string, DeckEntry[]>();
    for (const e of cards ?? []) {
      const k = `${e.card.serial}|${e.card.archetype}`;
      runs.set(k, [...(runs.get(k) ?? []), e]);
    }
    const at = new Map<string, { n: number; of: number }>();
    for (const run of runs.values()) {
      if (run.length < 2) continue;
      [...run].sort((a, b) => a.addedAt - b.addedAt).forEach((e, i) => at.set(e.code, { n: i + 1, of: run.length }));
    }
    return at;
  }, [cards]);
  const sky = useMemo(() => (cards?.[0] ? skyState(cards[0].card.evolvesFrom, cards[0].card.archetype, [], [], cards[0].card.vibes) : null), [cards]);

  // ---- Burning (docs/design/burn.md). Only for signed-in accounts, only on your own mints.
  const [armed, setArmed] = useState<string | null>(null);
  const [burning, setBurning] = useState<string | null>(null);
  const counterRef = useRef<HTMLDivElement>(null);
  // While a burn plays and the header counter is off screen, a copy docks at the top so the dust has somewhere to land.
  const dockRef = useRef<HTMLDivElement>(null);
  const [dock, setDock] = useState(false);
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
    let target: HTMLElement | null = burn?.dustOn ? counterRef.current : null;
    const tr = target?.getBoundingClientRect();
    if (target && tr && (tr.bottom < 8 || tr.top > window.innerHeight - 8)) {
      setDock(true);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      target = dockRef.current ?? target;
    }
    const fx = el ? dissolve(el, { target, colors, reduce }) : null;
    const [res] = await Promise.all([burnFromDeck(code, regret), fx?.done]);
    setTimeout(() => setDock(false), 1400);
    if (!res.httpOk || !res.status) {
      fx?.restore();
      heat(code, 0);
      setBurning(null);
      setArmed(null);
      setToast(res.error ?? "Couldn't burn it just now. Try again in a moment.");
      return;
    }
    setCards((cs) => cs?.filter((c) => c.code !== code) ?? cs);
    // Forget its reading on this device (and the latest sign when it was this card), so home doesn't bring it back and
    // the deck doesn't re-file it.
    forgetReading(code);
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
  // Stardust shows after the 2nd card or first fight; a burn that just earned some shows it too.
  const econ = me?.economyOpen !== false || (burn?.dust ?? 0) > 0;

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
            {burn.dustOn && econ && <DustCounter ref={counterRef} value={burn.dust ?? 0} weekLeft={burn.weekLeft} reduce={reduce} />}
            {burn.dustOn && dock && (
              <div className="fixed inset-x-0 top-20 z-[70] flex justify-center">
                <DustCounter ref={dockRef} value={burn.dust ?? 0} weekLeft={null} reduce={reduce} />
              </div>
            )}
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
              const run = prints.get(code);
              const burnable = Boolean(burn?.on && !local && entry.minted);
              return (
                <li key={code} className="rise flex flex-col items-center" style={{ animationDelay: `${Math.min(i, 9) * 60}ms` }}>
                  <div
                    className="relative"
                    ref={(el) => {
                      if (el) cardEls.current.set(code, el);
                    }}
                  >
                    {teas[code]?.top?.image && (
                      <button
                        type="button"
                        onClick={() => setSheet(entry)}
                        aria-label={`See ${teas[code].top!.name} and the rest`}
                        className="absolute -right-5 top-14 z-0 h-14 w-14 rotate-[8deg] overflow-hidden rounded-xl border border-line bg-paper-2 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)] transition hover:-right-8 hover:rotate-[4deg]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={proxied(teas[code].top!.image!)} alt="" className="h-full w-full object-cover" loading="lazy" onError={(e) => (e.currentTarget.parentElement!.style.display = "none")} />
                      </button>
                    )}
                    <Link href={`/c/${code}`} aria-label={`Open ${card.archetype}`} className="relative z-10 block transition duration-300 hover:-translate-y-1">
                      <HoloCard card={card} width={260} idle={false} still={reduce} />
                    </Link>
                  </div>
                  {teas[code] && !teas[code].opened ? (
                    <button
                      type="button"
                      onClick={() => setSheet(entry)}
                      className="mt-4 inline-flex items-center gap-2.5 rounded-full border border-accent bg-accent/15 py-1.5 pl-1.5 pr-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-accent shadow-[0_0_24px_-6px_rgba(198,255,61,0.55)] transition hover:bg-accent hover:text-paper"
                    >
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-[9px] text-paper ring-2 ring-accent/30" aria-hidden>
                        ✦
                      </span>
                      {teas[code].fresh ? `${teas[code].fresh} new · sealed` : "Sealed this week"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSheet(entry)}
                      className="mt-4 inline-flex items-center gap-2 rounded-full border border-accent/50 bg-accent/10 px-4 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-accent transition hover:bg-accent hover:text-paper"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                      What it pulled in
                    </button>
                  )}
                  <p className="mt-3 text-center font-serif text-xl italic leading-tight">{card.archetype}</p>
                  <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">
                    No. {cardNo(card)} · {card.rarityLabel}
                  </p>
                  {run && <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3">Print {run.n} of {run.of} of this reading</p>}
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
                          {(burn?.regretsLeft ?? 0) >= 2 ? "Regret this card" : "Last regret · 50 Stardust"}
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
                      <p className="max-w-[260px] text-center font-serif text-base italic leading-snug text-ink-2">{regretting ? regretLine(burn, (cards?.filter((c) => c.minted).length ?? 0) <= 1, me, entry.card.rarityLabel) : confirmLine(entry, burn)}</p>
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
        {owner === "user" && econ && me?.stardust?.economy && (
          <section className="mt-20">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">Stardust</p>
            <h2 className="mb-8 mt-2 font-serif text-4xl italic leading-tight">What a card is worth</h2>
            <StardustTable e={me.stardust.economy} dust={burn?.dust ?? me.stardust.dust} weekLeft={burn?.weekLeft ?? me.stardust.weekLeft} />
          </section>
        )}
      </main>
      {sheet && (
        <BrandSheet
          code={sheet.code}
          card={sheet.card}
          open
          onClose={closeSheet}
          sealed={Boolean(teas[sheet.code] && !teas[sheet.code].opened)}
          owned={Boolean(sheet.minted && owner === "user")}
          onOpened={(dust) => {
            setTeas((t) => (t[sheet.code] ? { ...t, [sheet.code]: { ...t[sheet.code], opened: true } } : t));
            if (dust) setBurn((b) => (b && typeof b.dust === "number" ? { ...b, dust: b.dust + dust } : b));
          }}
        />
      )}
    </div>
  );
}

/** What a regret gives back: the first brings a new card, the second 50 Stardust (docs/design/regret-burn.md). */
function regretLine(burn: DeckBurn, lastCard: boolean, me: Me | null, tier: string): string {
  const left = burn.regretsLeft ?? 0;
  if (left >= 2) return `Let it go and make a new card from different loves. The new one is marked Second draw and can rank up to ${tier === "Common" ? "Rare" : tier}${tier === "Common" ? ", one step up" : ""}. One more regret after this.`;
  const days = me?.refillAt ? Math.max(1, Math.ceil((me.refillAt - Date.now()) / 86_400_000)) : null;
  const wait = days ? `Your next card comes at the new moon, in ${days} day${days === 1 ? "" : "s"}.` : "Your next card comes at the new moon.";
  return `Last regret, and it does not give you a new card: you get 50 Stardust instead. ${wait}${lastCard ? " Until then your deck will be empty." : ""}`;
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
