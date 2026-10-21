"use client";

import { motion } from "motion/react";
import { BattleLink } from "@/components/battle/BattleLink";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { StyleResult } from "@/lib/types";
import { buildCard, cardNo, setOf } from "@/lib/card";
import { BRAND } from "@/lib/brand";
import { FlipCard } from "@/components/card/FlipCard";
import { ReceiptBody, ReceiptPrinter } from "@/components/card/Receipt";
import { Sparkle } from "@/components/card/Sigils";
import { BigThree } from "./BigThree";
import { TasteCensus } from "./TasteCensus";
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
  fight,
  flight = false,
  verified,
  onPull,
  after,
}: {
  /** Set when the visitor arrived from someone's /vs link: answers that fighter. */
  fight?: { href: string; name: string };
  result: StyleResult;
  votes: Record<string, Vote>;
  onVote: (id: string, v: Vote | null) => void;
  onShare: () => void;
  onReplan?: () => void;
  pending?: boolean;
  /** The card is flying in from the pack (shared layout): the hero skips its own rise so the card lands on a still page. */
  flight?: boolean;
  /** On the card's home (/c): the server holds it (true) or only this device does (false). */
  verified?: boolean;
  /** Opens this week's pull for the card (the brand sheet). */
  onPull?: () => void;
  /** Rendered right under the hero (the card page puts the passport here). */
  after?: ReactNode;
}) {
  const card = useMemo(() => buildCard(result), [result]);
  const [colRef, colW] = useWidth<HTMLDivElement>();
  const heroRef = useRef<HTMLElement>(null);
  const [navOn, setNavOn] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const [math, setMath] = useState(false);
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
      {/* translucent, so your sky shows faintly through the hero panel */}
      <section ref={heroRef} className={`${flight ? "" : "rise "}relative isolate overflow-hidden rounded-[30px] border border-line bg-card/55 sm:rounded-[36px]`}>
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

        <div className="grid grid-cols-1 gap-8 px-4 pb-6 pt-6 sm:px-8 sm:pb-10 sm:pt-10 lg:grid-cols-[minmax(0,390px)_minmax(0,1fr)] lg:gap-14 lg:px-12 lg:py-12">
          {/* card column */}
          <div className="mx-auto w-full max-w-[380px] lg:sticky lg:top-6 lg:self-start">
            {/* layoutId: the same card the pack revealed, carried here instead of cut to */}
            <motion.div ref={colRef} layoutId="minted-card" className="relative z-10 w-full">
              {colW > 0 ? <FlipCard card={card} width={Math.min(380, Math.round(colW))} flipped={showBack} onFlippedChange={setShowBack} /> : <div className="aspect-[63/88] w-full rounded-[18px] shimmer" />}
            </motion.div>
            <p className="mt-4 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">
              <span className="hidden sm:inline">hover</span>
              <span className="sm:hidden">tilt your phone</span> to catch the foil
            </p>
          </div>

          {/* reading column */}
          <div className="min-w-0">
            {result.mode === "live" && <TasteCensus score={card.rarityScore} />}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-2">Your taste sign</span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-black"
                style={{ background: RARITY_TONE[card.rarity] }}
              >
                <Sparkle className="h-2.5 w-2.5" />
                {card.rarityLabel}
              </span>
              {card.deepCut && (
                <span title={`Your loves average ${card.avgPop}% popularity on Qloo`} className="inline-flex -rotate-3 items-center rounded-[5px] border-2 border-accent px-2 py-0.5 font-mono text-[11px] font-extrabold uppercase tracking-[0.18em] text-accent">
                  Deep Cut
                </span>
              )}
              <span className="font-mono text-[11px] text-ink-3">
                № {cardNo(card)} · {setOf(card)}
              </span>
              {verified !== undefined && (
                <span className={`font-mono text-[10.5px] uppercase tracking-[0.18em] ${verified ? "text-good" : "text-warn"}`}>
                  {verified ? "✓ Verified original" : "Saved on this device"}
                </span>
              )}
            </div>

            <h1 className="mt-4 font-serif text-[48px] leading-[0.9] tracking-[-0.02em] text-balance sm:text-[68px] lg:text-[76px]">{result.dna.name}</h1>
            <p className="mt-4 max-w-xl font-serif text-[21px] italic leading-snug text-ink-2 sm:text-[24px]">{result.dna.tagline}</p>

            <div className="mt-5 max-w-xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2">
                {result.roll ? (
                  <>
                    {card.rarityLabel} · rolled ·{" "}
                    <a href="/odds" className="underline decoration-dotted underline-offset-2 hover:text-ink">
                      odds
                    </a>
                  </>
                ) : (
                  <>
                    {card.rarityLabel} · {result.showcase ? "demo card · taste marks " : ""}{card.rarityScore}/100
                  </>
                )}
              </p>
              {result.roll && (
                <>
                  <p className="mt-1.5 text-[13.5px] leading-snug text-ink-2">
                    Rolled {result.roll.u.toFixed(4)} on the published odds. Rarity is a roll. Your taste isn&apos;t.
                  </p>
                  <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3">Taste marks · {card.rarityScore}/100</p>
                </>
              )}
              <ul className="mt-1.5 space-y-1 text-[13.5px] leading-snug text-ink-3">
                {card.rarityWhy.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              {card.weak && (
                <p className="mt-3 text-[14px] leading-snug text-ink-2">
                  <b className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-accent">Weak to:</b> {card.weak.name}. Moved {card.weak.pct}% of your picks.
                </p>
              )}
            </div>

            <div className="mt-7">
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-3">The Big Three, with receipts</p>
              <BigThree result={result} card={card} />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-2">
              <span className="mr-1 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">Read from</span>
              {result.seeds.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper/50 py-0.5 pl-0.5 pr-3 text-[12.5px] text-ink-2">
                  <Thumb src={s.image} name={s.name} size={22} />
                  <span className="max-w-[160px] truncate">{s.name}</span>
                </span>
              ))}
              {result.vibes?.map((v) => (
                <span
                  key={v.id}
                  title={v.via?.length ? `Read through ${v.via.join(" and ")}` : "Read as a taste signal"}
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-3 py-0.5 text-[12.5px] text-ink-2"
                >
                  <span className="text-ink-3">∿</span>
                  {v.name}
                  {!!v.via?.length && <span className="text-ink-3">· via {v.via[0]}</span>}
                </span>
              ))}
            </div>

            {/* One lime move: answer the challenge when there is one, otherwise share. The rest are quiet links. */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {fight && (
                <a href={fight.href} className="rounded-full bg-accent px-6 py-3.5 text-[15px] font-semibold text-black shadow-[0_10px_40px_-12px_rgba(198,255,61,0.7)] transition hover:brightness-110">
                  Fight {fight.name}
                </a>
              )}
              <button
                onClick={onShare}
                className={
                  fight
                    ? "inline-flex items-center gap-2 rounded-full border border-line px-5 py-3.5 text-[14px] text-ink transition hover:border-ink-3"
                    : "group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-accent px-6 py-3.5 text-[15px] font-semibold text-black shadow-[0_10px_40px_-12px_rgba(198,255,61,0.7)] transition hover:brightness-110 active:scale-[0.98]"
                }
              >
                {!fight && <span aria-hidden className="absolute inset-0 -translate-x-full bg-[linear-gradient(100deg,transparent,rgba(255,255,255,0.6),transparent)] transition duration-700 group-hover:translate-x-full" />}
                <Sparkle className="h-3.5 w-3.5" />
                {/* the share is a question, not a brag: a friend answers it by minting theirs (the /vs link) */}
                Are we taste twins?
              </button>
              <BattleLink />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2">
              <button type="button" onClick={() => setShowBack((b) => !b)} aria-pressed={showBack} className="underline-offset-4 hover:text-ink hover:underline">
                {showBack ? "Front ⟲" : "Flip ⟲"}
              </button>
              <a href="#receipt" className="underline-offset-4 hover:text-ink hover:underline">
                Receipts ↓
              </a>
              {onPull && (
                <button type="button" onClick={onPull} className="underline-offset-4 hover:text-ink hover:underline">
                  This week&apos;s pull ↗
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {after}

      {/* ------------------------------------------------------------ section nav */}
      <nav
        aria-label="Result sections"
        className={`pointer-events-none fixed inset-x-0 top-[64px] z-30 flex justify-center px-3 transition duration-300 ${navOn ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"}`}
      >
        <div className={`flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-paper/95 p-1 text-[12.5px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)] backdrop-blur-md [scrollbar-width:none] ${navOn ? "pointer-events-auto" : ""}`}>
          {[
            ["matches", "Matches"],
            ["doubts", "Doubts"],
            ["receipt", "Receipt"],
            ["capsule", "Capsule"],
            ["bridges", "Bridges"],
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`} className={`shrink-0 rounded-full px-2.5 py-1.5 text-ink-2 transition hover:bg-paper-2 hover:text-ink sm:px-3.5 ${id === "bridges" ? "hidden sm:block" : ""}`}>
              {label}
            </a>
          ))}
          <button onClick={onShare} className="shrink-0 rounded-full bg-accent px-3 py-1.5 font-semibold text-black sm:px-3.5">
            Share
          </button>
        </div>
      </nav>

      {/* ------------------------------------------------------------ the receipt */}
      <section id="receipt" className="scroll-mt-20">
        <SectionHead
          kicker="The receipt"
          title={
            <>
              Every line, <em className="text-ink-2">itemised</em>
            </>
          }
          note={<>Your loves in, brands out, the critic&apos;s voids crossed off. Tap any brand line for the agent&apos;s reason and which loves drove it.</>}
        />
        <ReceiptPrinter total={card.power}>
          <ReceiptBody card={card} result={result} stagger={false} faded />
        </ReceiptPrinter>
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => setMath((m) => !m)}
            aria-expanded={math}
            className="rounded-full border border-line px-5 py-2.5 font-mono text-[12px] uppercase tracking-[0.16em] text-ink-2 transition hover:border-ink-3 hover:text-ink"
          >
            {math ? "Hide the math" : "Show the math"}
          </button>
        </div>
        {math && (
          <div className="mt-10">
            <Matrix result={result} />
          </div>
        )}
      </section>

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
              Each one came straight from Qloo, ranked by how strongly your loves pull toward it. Vote <b className="text-ink">↑</b> or <b className="text-ink">↓</b> and
              your sign re-reads itself.
            </>
          }
          right={nVotes > 0 ? <span className="rounded-full border border-line px-3 py-1.5 font-mono text-[11px] text-ink-2">{nVotes} vote{nVotes === 1 ? "" : "s"}</span> : undefined}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {main.map((b, i) => (
            <BrandCard key={b.entity.id} b={b} i={i} seeds={result.seeds} vote={votes[b.entity.id]} onVote={onVote} hero={i === 0} />
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sideB.map((b, i) => (
                <BrandCard key={b.entity.id} b={b} i={i} seeds={result.seeds} vote={votes[b.entity.id]} onVote={onVote} />
              ))}
            </div>
          </div>
        )}
      </section>

      {(result.critique.length > 0 || result.rejected.length > 0) && <Critique result={result} />}

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
