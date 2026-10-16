"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { HoloCard } from "@/components/card/HoloCard";
import { CursorArrow } from "@/components/CursorArrow";
import { BRAND } from "@/lib/brand";
import { buildCard, cardCode, SEASON, type CardData } from "@/lib/card";
import type { StyleResult } from "@/lib/types";

/** Digital twin of a printed or shared card: /c/<code>, the URL in the card-back QR. */
export default function TwinPage({ params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent(use(params).code).toUpperCase();
  const [card, setCard] = useState<CardData | null | undefined>(undefined);
  const [source, setSource] = useState<"server" | "device" | null>(null);

  useEffect(() => {
    let off = false;
    (async () => {
      const res = await fetch(`/api/card?code=${encodeURIComponent(code)}`).catch(() => null);
      const j = res?.ok ? ((await res.json()) as { card: CardData | null }) : null;
      if (off) return;
      if (j?.card && cardCode(j.card) === code) {
        setCard(j.card);
        setSource("server");
        return;
      }
      // Not registered on the server yet: the minting device may still hold it.
      try {
        const saved = JSON.parse(localStorage.getItem("tastrology:v1") ?? "null") as { result?: StyleResult } | null;
        const local = saved?.result ? buildCard(saved.result) : null;
        if (local && cardCode(local) === code) {
          setCard(local);
          setSource("device");
          return;
        }
      } catch {}
      setCard(null);
    })();
    return () => {
      off = true;
    };
  }, [code]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center gap-10 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-center lg:gap-16">
      {card === undefined && <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-3">Looking up No. {code}…</p>}

      {card === null && (
        <div className="max-w-md text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-bad">Not found</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">No card with code {code}</h1>
          <p className="mt-3 text-ink-2">Check the code under the QR on the back of the card. Every code is a checksum of the card it belongs to, so a typo won&apos;t match anything.</p>
          <CTA />
        </div>
      )}

      {card && (
        <>
          <HoloCard card={card} width={340} idle />
          <section className="max-w-md">
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
            <CTA />
          </section>
        </>
      )}
    </main>
  );
}

function CTA() {
  return (
    <Link href="/" className="group mt-8 inline-flex items-center gap-3 rounded-full bg-accent py-2 pl-6 pr-2 font-semibold text-paper">
      Get your own {BRAND.name} sign
      <CursorArrow className="h-9 w-9 bg-paper text-accent" />
    </Link>
  );
}
