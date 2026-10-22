"use client";

import { CursorArrow } from "@/components/CursorArrow";
import { BRAND } from "@/lib/brand";
import { LegalLinks } from "@/components/site/LegalLinks";
import { Magnetic, Reveal } from "./primitives";
import s from "./landing.module.css";

export function Footer({ onPick }: { onPick: () => void }) {
  return (
    <footer className="relative overflow-hidden border-t border-line pt-24 sm:pt-32">
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%]"
        style={{ background: "radial-gradient(60% 60% at 50% 100%, rgba(198,255,61,0.07), transparent 70%)" }}
        aria-hidden
      />
      <div className="relative mx-auto max-w-[1320px] px-4 sm:px-8 lg:px-12">
        <Reveal className="flex flex-col items-start gap-8 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-xl font-display text-[clamp(2rem,6vw,3.6rem)] font-semibold leading-[0.95] tracking-[-0.04em] text-ink">
            Send it to the friend who <span className="font-serif font-normal italic text-ink-2">says you have no taste.</span>
          </p>
          <Magnetic
            onClick={onPick}
            className="group inline-flex h-14 shrink-0 items-center gap-3 rounded-full bg-ink pl-6 pr-2 text-[15px] font-semibold text-paper"
          >
            Mint your card
            <CursorArrow className="h-10 w-10 bg-accent text-paper" />
          </Magnetic>
        </Reveal>

        <div className="mt-20 flex flex-col gap-6 border-t border-line py-8 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Powered by Qloo&apos;s taste graph
          </p>
          <p>Built for the Qloo Agentic Hackathon</p>
          <p className="text-ink-3/70">{BRAND.cardSet} · {BRAND.tagline}</p>
        </div>
        <p className="-mt-2 max-w-3xl pb-4 text-xs leading-relaxed text-ink-3">
          {BRAND.name} is a free student project built for the Qloo hackathon. Not for sale. Taste data from Qloo; not affiliated with or endorsed by any brand shown.
        </p>
        <LegalLinks className="pb-8" />
      </div>

      <div className="pointer-events-none select-none px-2 text-center" aria-hidden>
        <p className={`${s.wordmark} -mb-[0.12em] font-display font-bold`}>{BRAND.name}</p>
      </div>
    </footer>
  );
}
