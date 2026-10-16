"use client";

import { BattleLink } from "@/components/battle/BattleLink";
import { useEffect, useMemo, useRef, useState } from "react";
import type { StyleResult } from "@/lib/types";
import { buildCard } from "@/lib/card";
import { BRAND } from "@/lib/brand";
import { FlipCard } from "@/components/card/FlipCard";
import { Sparkle } from "@/components/card/Sigils";
import { BigThree } from "./BigThree";
import { BrandCard } from "./Brands";
import { CapsuleAndBridges, Changes, Critique, Matrix } from "./Sections";
import { SectionHead, Thumb, useWidth, type Vote } from "./ui";

export type { Vote };

const RARITY_TONE: Record<string, string> = {
  common: "linear-gradient(140deg,#e7eaee,#8a929c 40%,#f4f6f8 60%,#6b7280)",
  rare: "linear-gradient(135deg,var(--ta),var(--tb))",
  holo: "linear-gradient(115deg,#ff7773,#ffed5f,#a8ff5f,#83fff7,#7894ff,#d875ff)",
  secret: "linear-gradient(135deg,#fff1b8,#b7791f 35%,#fff6d6 55%,#a16207)",
};

export function ResultsView({
  result,
  votes,
  onVote,
  onShare,
  onReplan,
  pending = false,
}: {
  result: StyleResult;
  votes: Record<string, Vote>;
  onVote: (id: string, v: Vote | null) => void;
  onShare: () => void;
  onReplan?: () => void;
  pending?: boolean;
}) {
  const card = useMemo(() => buildCard(result), [result]);
  const [colRef, colW] = useWidth<HTMLDivElement>();
  const heroRef = useRef<HTMLElement>(null);
  const [navOn, setNavOn] = useState(false);
  const [showBack, setShowBack] = useState(false);
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNavOn(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const main = result.brands.filter((b) => !b.side);
  const sideB = result.brands.filter((b) => b.side);
  const nVotes = Object.keys(votes).length;
  const [t1, t2] = card.types;
  const tone = { "--ta": t1?.a ?? "#a78bfa", "--tb": (t2 ?? t1)?.b ?? "#22d3ee" } as React.CSSProperties;

  return (
    <div className="space-y-16 sm:space-y-24" style={tone}>
      {/* ------------------------------------------------------------ hero */}
      <section ref={heroRef} className="rise relative isolate overflow-hidden rounded-[30px] border border-line bg-card sm:rounded-[36px]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background: `radial-gradient(60% 55% at 22% 35%, color-mix(in oklab, var(--ta) 26%, transparent), transparent 70%),
              radial-gradient(45% 45% at 85% 10%, color-mix(in oklab, var(--tb) 18%, transparent), transparent 70%),
              radial-gradient(40% 50% at 70% 100%, color-mix(in oklab, var(--ta) 10%, transparent), transparent 70%)`,
          }}
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background-image:radial-gradient(1px_1px_at_10%_20%,#fff6,transparent),radial-gradient(1px_1px_at_30%_80%,#fff4,transparent),radial-gradient(1px_1px_at_60%_30%,#fff5,transparent),radial-gradient(1px_1px_at_85%_65%,#fff4,transparent),radial-gradient(1.5px_1.5px_at_45%_55%,#fff6,transparent)] [background-size:220px_220px]" />

        <div className="grid gap-8 px-4 pb-6 pt-6 sm:px-8 sm:pb-10 sm:pt-10 lg:grid-cols-[minmax(0,390px)_minmax(0,1fr)] lg:gap-14 lg:px-12 lg:py-12">
          {/* card column */}
          <div className="mx-auto w-full max-w-[380px] lg:sticky lg:top-6 lg:self-start">
            <div ref={colRef} className="w-full">
              {colW > 0 ? <FlipCard card={card} width={Math.min(380, Math.round(colW))} flipped={showBack} onFlippedChange={setShowBack} /> : <div className="aspect-[63/88] w-full rounded-[18px] shimmer" />}
            </div>
            <p className="mt-4 text-center font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">
              <span className="hidden sm:inline">hover</span>
              <span className="sm:hidden">tilt your phone</span> to catch the foil
            </p>
          </div>

          {/* reading column */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-2">Your taste sign</span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-black"
                style={{ background: RARITY_TONE[card.rarity] }}
              >
                <Sparkle className="h-2.5 w-2.5" />
                {card.rarityLabel}
              </span>
              <span className="font-mono text-[11px] text-ink-3">
                № {card.serial} · {BRAND.cardSet}
              </span>
            </div>

            <h1 className="mt-4 font-serif text-[48px] leading-[0.9] tracking-[-0.02em] text-balance sm:text-[68px] lg:text-[76px]">{result.dna.name}</h1>
            <p className="mt-4 max-w-xl font-serif text-[21px] italic leading-snug text-ink-2 sm:text-[24px]">{result.dna.tagline}</p>

            <p className="mt-4 text-[12.5px] text-ink-3">
              {card.rarityLabel} because: {card.rarityWhy?.join(" · ")}.
            </p>

            <div className="mt-7">
              <p className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.22em] text-ink-3">The Big Three, with receipts</p>
              <BigThree result={result} card={card} />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-2">
              <span className="mr-1 font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Read from</span>
              {result.seeds.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper/50 py-0.5 pl-0.5 pr-3 text-[12.5px] text-ink-2">
                  <Thumb src={s.image} name={s.name} size={22} />
                  <span className="max-w-[160px] truncate">{s.name}</span>
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={onShare}
                className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-accent px-6 py-3.5 text-[15px] font-semibold text-black shadow-[0_10px_40px_-12px_rgba(198,255,61,0.7)] transition hover:brightness-110 active:scale-[0.98]"
              >
                <span aria-hidden className="absolute inset-0 -translate-x-full bg-[linear-gradient(100deg,transparent,rgba(255,255,255,0.6),transparent)] transition duration-700 group-hover:translate-x-full" />
                <Sparkle className="h-3.5 w-3.5" />
                Share my sign
              </button>
              <button
                type="button"
                onClick={() => setShowBack((b) => !b)}
                aria-pressed={showBack}
                className="rounded-full border border-line px-5 py-3.5 text-[14px] text-ink-2 transition hover:border-ink-3 hover:text-ink"
              >
                {showBack ? "Front ⟲" : "Back ⟲"}
              </button>
              <a href="#matches" className="rounded-full border border-line px-5 py-3.5 text-[14px] text-ink-2 transition hover:border-ink-3 hover:text-ink">
                See the receipts ↓
              </a>
              <BattleLink />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ section nav */}
      <nav
        aria-label="Result sections"
        className={`pointer-events-none fixed inset-x-0 top-3 z-30 flex justify-center px-3 transition duration-300 ${navOn ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"}`}
      >
        <div className={`flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-paper/80 p-1 text-[12.5px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)] backdrop-blur-md [scrollbar-width:none] ${navOn ? "pointer-events-auto" : ""}`}>
          {[
            ["matches", "Matches"],
            ["doubts", "Doubts"],
            ["receipts", "Receipts"],
            ["capsule", "Capsule"],
            ["bridges", "Bridges"],
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`} className={`shrink-0 rounded-full px-2.5 py-1.5 text-ink-2 transition hover:bg-paper-2 hover:text-ink sm:px-3.5 ${id === "bridges" ? "hidden sm:block" : ""}`}>
              {label}
            </a>
          ))}
          <button onClick={onShare} className="shrink-0 rounded-full bg-ink px-3 py-1.5 font-medium text-paper sm:px-3.5">
            Share
          </button>
        </div>
      </nav>

      <Changes result={result} />

      {/* ------------------------------------------------------------ matches */}
      <section id="matches" className="scroll-mt-20">
        <SectionHead
          kicker="Brand matches"
          title={
            <>
              {main.length} brands that fit your <em className="text-ink-2">Sun</em>
            </>
          }
          note={
            <>
              Every brand here came back from Qloo&apos;s insights API: nothing invented. Vote <b className="text-ink">↑</b> or <b className="text-ink">↓</b> and the agent
              re-plans with your feedback, then shows you exactly what changed.
            </>
          }
          right={nVotes > 0 ? <span className="rounded-full border border-line px-3 py-1.5 font-mono text-[11px] text-ink-2">{nVotes} vote{nVotes === 1 ? "" : "s"}</span> : undefined}
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {main.map((b, i) => (
            <BrandCard key={b.entity.id} b={b} i={i} seeds={result.seeds} vote={votes[b.entity.id]} onVote={onVote} />
          ))}
        </div>

        {sideB.length > 0 && (
          <div className="mt-10">
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-serif text-[28px] leading-none sm:text-[34px]">
                <span className="text-warn">☽</span> Your Moon side
              </h3>
              <p className="text-[13.5px] text-ink-2">
                Picked by a separate Qloo query for the part of you that doesn&apos;t match the rest ({card.bigThree.moon.name}).
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sideB.map((b, i) => (
                <BrandCard key={b.entity.id} b={b} i={i} seeds={result.seeds} vote={votes[b.entity.id]} onVote={onVote} />
              ))}
            </div>
          </div>
        )}
      </section>

      {(result.critique.length > 0 || result.rejected.length > 0) && <Critique result={result} />}

      <Matrix result={result} />

      <CapsuleAndBridges result={result} />

      {/* ------------------------------------------------------------ footer */}
      <footer className="flex flex-col items-center gap-3 border-t border-line pt-8 pb-4 text-center">
        <p className="font-serif text-[22px] italic text-ink-2">{BRAND.tagline}</p>
        <p className="font-mono text-[11px] leading-relaxed text-ink-3">
          {result.stats.qlooCalls} Qloo API calls · planner: {result.planner === "llm" ? `LLM (${result.stats.llmSteps} steps)` : "autopilot"} · data:{" "}
          {result.mode === "live" ? "live Qloo" : "demo graph (mock)"} · {(result.stats.ms / 1000).toFixed(1)}s{result.cached ? " · cached" : ""}
        </p>
      </footer>

      {/* ------------------------------------------------------------ feedback loop CTA */}
      {pending && onReplan && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:bottom-6">
          <button
            onClick={onReplan}
            className="rise pointer-events-auto flex items-center gap-3 rounded-full border border-accent/50 bg-paper/90 py-2 pl-2 pr-5 text-[14px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9),0_0_40px_-10px_rgba(198,255,61,0.5)] backdrop-blur-md transition hover:border-accent"
          >
            <span className="grid h-9 min-w-9 place-items-center rounded-full bg-accent px-2 font-mono text-[13px] font-semibold text-black">{nVotes}</span>
            <span className="text-left leading-tight">
              <span className="block font-semibold">Re-read my sign</span>
              <span className="block text-[11.5px] text-ink-3">agent re-plans with your votes</span>
            </span>
            <span className="text-accent">→</span>
          </button>
        </div>
      )}
    </div>
  );
}
