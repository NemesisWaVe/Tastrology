"use client";

import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { FlipCard } from "@/components/card/FlipCard";
import { Sky } from "@/components/reveal/Sky";
import { skyState } from "@/components/reveal/traceModel";
import { Burned } from "@/components/card/Burned";
import { Passport } from "@/components/card/Passport";
import { BrandSheet } from "@/components/deck/BrandSheet";
import { ShareSheet } from "@/components/card/ShareSheet";
import { loadDeck } from "@/lib/deck";
import { CursorArrow } from "@/components/CursorArrow";
import { OwnedReading } from "@/components/results/OwnedReading";
import { buildCard, cardCode, SEASON, type CardData } from "@/lib/card";
import { forgetReading, latestCode, loadReading, type Reading } from "@/lib/readings";
import type { StyleResult } from "@/lib/types";

/** Digital twin of a printed or shared card: /c/<code>, the URL in the card-back QR. */
export default function TwinPage({ params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent(use(params).code).toUpperCase();
  const [card, setCard] = useState<CardData | null | undefined>(undefined);
  const [source, setSource] = useState<"server" | "device" | null>(null);
  /** The server couldn't answer (storage blip or offline), so "not found" would be a lie. */
  const [unavailable, setUnavailable] = useState(false);
  /** The owner burned it (410): gone on purpose, so no device fallback either. */
  const [burned, setBurned] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [brands, setBrands] = useState(false);
  const [share, setShare] = useState(false);
  /** This device made the card: the reading it came from is saved here, or it sits in this device's or account's deck as a mint. */
  const [mine, setMine] = useState(false);
  /** The reading behind this card, when this device minted it: the owner gets the full reading here, not just the card. */
  const [reading, setReading] = useState<{ r: Reading & { result: StyleResult }; latest: boolean } | null>(null);
  const router = useRouter();
  useEffect(() => {
    const r = loadReading(code);
    setReading(r?.result ? { r: r as Reading & { result: StyleResult }, latest: latestCode() === code } : null);
  }, [code]);
  // ?b=1 (from the deck or a share) opens the brand sheet straight away; ?share=1 (the laptop share sheet's QR) the share sheet.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("b") === "1") setBrands(true);
    // Only the sharer's own laptop shows that QR, so the phone shares in the first person ("I pulled").
    if (q.get("share") === "1") {
      setShare(true);
      setMine(true);
    }
    // One-shot: a reload, Back, or a forwarded link shouldn't reopen the sheet.
    if (q.has("b") || q.has("share")) {
      q.delete("b");
      q.delete("share");
      // a fresh state (not history.state, which carries Next's marker), so Next's router takes the cleaned URL as its own
      history.replaceState({}, "", window.location.pathname + (q.size ? `?${q}` : ""));
    }
  }, []);

  useEffect(() => {
    let off = false;
    (async () => {
      const res = await fetch(`/api/card?code=${encodeURIComponent(code)}`, { cache: "no-store" }).catch(() => null);
      const j = res?.ok ? ((await res.json().catch(() => null)) as { card: CardData | null } | null) : null;
      if (off) return;
      if (res?.status === 410) {
        forgetReading(code);
        setReading(null);
        setBurned(true);
        setCard(null);
        return;
      }
      if (j?.card && cardCode(j.card) === code) {
        setCard(j.card);
        setSource("server");
        return;
      }
      // Not registered on the server yet: the minting device may still hold it.
      try {
        const saved = loadReading(code);
        if (saved?.result) {
          setCard(buildCard(saved.result));
          setSource("device");
          return;
        }
      } catch {}
      setUnavailable(!res || (!res.ok && res.status !== 404 && res.status !== 400));
      setCard(null);
    })();
    return () => {
      off = true;
    };
  }, [code, attempt]);

  useEffect(() => {
    if (!card) return;
    let off = false;
    if (loadReading(code)) {
      setMine(true);
      return;
    }
    loadDeck().then((d) => {
      if (!off && d.cards.some((c) => c.code === code && c.minted !== false)) setMine(true);
    });
    return () => {
      off = true;
    };
  }, [card, code]);

  const retry = () => {
    setCard(undefined);
    setUnavailable(false);
    setAttempt((n) => n + 1);
  };

  // The card hangs in its owner's sky: one constellation per love, the one it's named after lit.
  const reduce = Boolean(useReducedMotion());
  const cardRef = useRef<HTMLDivElement>(null);
  const sky = useMemo(() => (card ? skyState(card.evolvesFrom, card.archetype) : null), [card]);

  // The owner, on the device that minted it: the card's home is the whole reading (receipts, matches, capsule, re-plan).
  // It shows straight away from this device; the server check only adds the verified mark, or takes it down if burned.
  if (reading && !burned)
    return (
      <>
        <OwnedReading
          initial={reading.r}
          latest={reading.latest}
          onNew={() => router.push("/?new=1")}
          verified={source ? source === "server" : undefined}
          onPull={source === "server" ? () => setBrands(true) : undefined}
          after={source === "server" ? <Passport code={code} /> : undefined}
        />
        {share && card && <ShareSheet card={card} mine linkable={source === "server"} onClose={() => setShare(false)} />}
        {card && <BrandSheet code={code} card={card} open={brands} onClose={() => setBrands(false)} src="share" />}
      </>
    );

  return (
    <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center gap-10 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-center lg:gap-16">
      {sky && <Sky f={sky} anchor={cardRef} reduce={reduce} drawn fixed dim={0.8} />}
      {card === undefined && <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-3">Looking up No. {code}…</p>}

      {card === null && burned && <Burned code={code} />}

      {card === null && !burned && unavailable && (
        <div className="max-w-md text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-warn">Temporarily unavailable</p>
          <h1 className="mt-3 font-serif text-5xl italic leading-[0.95]">The vault is stuck for a moment.</h1>
          <p className="mt-3 text-ink-2">We couldn&apos;t reach the card archive just now, so we can&apos;t say yet whether No. {code} is on file. It&apos;s usually back within seconds.</p>
          <button type="button" onClick={retry} className="mt-8 rounded-full bg-accent px-6 py-3.5 font-semibold text-paper">
            Try again
          </button>
        </div>
      )}

      {card === null && !burned && !unavailable && (
        <div className="max-w-md text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-bad">Not found</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">No card with code {code}</h1>
          <p className="mt-3 text-ink-2">Check the code under the QR on the back of the card. Every code is a checksum of the card it belongs to, so a typo won&apos;t match anything.</p>
          <CTA />
        </div>
      )}

      {card && (
        <>
          <div ref={cardRef} className="relative">
            <FlipCard card={card} width={340} idle flipButton />
          </div>
          <section className="relative max-w-md">
            <p className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] ${source === "server" ? "border-good/40 text-good" : "border-warn/40 text-warn"}`}>
              {source === "server" ? "✓ Verified original" : "Saved on this device"}
            </p>
            <h1 className="mt-4 font-serif text-5xl italic leading-[0.95]">{card.archetype}</h1>
            <p className="mt-3 text-ink-2">{card.flavor}</p>
            <dl className="mt-6 grid grid-cols-3 gap-3 border-y border-line py-4 text-sm">
              {(
                [
                  ["Sun", card.bigThree.sun.name],
                  ["Moon", card.bigThree.moon.name],
                  ["Rising", card.bigThree.rising.name],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3">{k}</dt>
                  <dd className="mt-1 font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
              No. {card.serial} · Season {SEASON} · {card.rarityLabel} · code {code}
            </p>
            {card.moves.length > 0 && <p className="mt-4 text-sm text-ink-2">Signature brands: {card.moves.map((m) => m.name).join(" · ")}</p>}
            {/* Owner: sharing is the main move. Visitor: answering it is (mint yours, fight this one). */}
            {mine ? (
              <Primary onClick={() => setShare(true)} title="Share your card" sub="instagram, snapchat, or x" />
            ) : source === "server" ? (
              <Primary href={`/vs/${encodeURIComponent(code)}`} title="Fight this card" sub="mint yours, then battle it" />
            ) : null}
            {source === "server" && (
              <Secondary onClick={() => setBrands(true)} title={mine ? "See what your taste pulled in" : "See what this taste pulled in"} sub="brands, and why each one" />
            )}
            {!mine && <Secondary onClick={() => setShare(true)} title="Share this card" sub="instagram, snapchat, or x" arrow="↗" />}
            {source === "server" && <Passport code={code} challenge={mine} />}
            {mine ? (
              <Link href="/deck" className="mt-8 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                Your deck →
              </Link>
            ) : (
              <CTA />
            )}
          </section>
          {share && <ShareSheet card={card} mine={mine} linkable={source === "server"} onClose={() => setShare(false)} />}
          <BrandSheet code={code} card={card} open={brands} onClose={() => setBrands(false)} src="share" visitor={!mine} />
        </>
      )}
    </main>
  );
}

function Primary({ title, sub, onClick, href }: { title: string; sub: string; onClick?: () => void; href?: string }) {
  const inner = (
    <>
      <span>
        <span className="block font-serif text-xl italic">{title}</span>
        <span className="mt-0.5 block font-mono text-[10.5px] uppercase tracking-[0.18em] opacity-70">{sub}</span>
      </span>
      <span aria-hidden className="text-2xl">→</span>
    </>
  );
  const cls = "mt-6 flex w-full items-center justify-between rounded-2xl bg-accent px-5 py-4 text-left text-paper transition hover:brightness-105";
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function Secondary({ title, sub, onClick, arrow = "→" }: { title: string; sub: string; onClick: () => void; arrow?: string }) {
  return (
    <button type="button" onClick={onClick} className="mt-3 flex w-full items-center justify-between rounded-2xl border border-line bg-card/60 px-5 py-4 text-left transition hover:border-accent/50">
      <span>
        <span className="block font-serif text-xl italic text-ink">{title}</span>
        <span className="mt-0.5 block font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3">{sub}</span>
      </span>
      <span aria-hidden className="text-2xl text-ink-2">{arrow}</span>
    </button>
  );
}

function CTA() {
  return (
    <Link href="/" className="group mt-8 inline-flex items-center gap-3 rounded-full bg-accent py-2 pl-6 pr-2 font-semibold text-paper">
      Mint your own card
      <CursorArrow className="h-9 w-9 bg-paper text-accent" />
    </Link>
  );
}
