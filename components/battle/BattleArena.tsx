"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
  type Easing,
  useAnimate,
  useReducedMotion,
} from "motion/react";
import { getFontEmbedCSS, toBlob } from "html-to-image";
import { HoloCard } from "@/components/card/HoloCard";
import { Sky } from "@/components/reveal/Sky";
import { skyState } from "@/components/reveal/traceModel";
import {
  battle,
  type BattleResult,
  type BattleRound,
  type Side,
} from "@/lib/battle";
import { BRAND } from "@/lib/brand";
import type { StyleResult } from "@/lib/types";
import { useAgentRun } from "@/lib/useAgentRun";
import { loadFighter, ME } from "./data";
import { FightShare } from "./FightShare";
import { Galaxies, IMPACT_MS, VsLens, type Beat } from "./Galaxies";
import { ResultPanel } from "./ResultPanel";

const COL: Record<Side, string> = { a: "#c6ff3d", b: "#d875ff" };
// Timeline (ms): cards in, 4 rounds, the score slam, then the joint-sign reveal.
const T_INTRO = 2600;
const T_ROUND = 2600;
const T_SLAM = 1800;
const PH_SLAM = 5;
const PH_REVEAL = 6;

function useCountUp(target: number, start: boolean, reduce: boolean, ms = 900) {
  const [v, setV] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce) return setV(target);
    if (!start) return setV(0);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, start, reduce, ms]);
  return v;
}

function useCardWidth() {
  const [w, setW] = useState(160);
  useEffect(() => {
    const f = () =>
      setW(
        Math.floor(
          Math.min(210, (Math.min(window.innerWidth, 600) - 32 - 18) / 2),
        ),
      );
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return w;
}

let fontCSS: Promise<string> | null = null;

/** The shared night sky behind every battle screen, with no figures of its own: the galaxies bring those. */
const OPEN_SKY = skyState([], "");

export function BattleArena({ a, b }: { a: string; b: string }) {
  const { run, events, error: runError } = useAgentRun();
  const [res, setRes] = useState<{ a: StyleResult; b: StyleResult } | null>(
    null,
  );
  const [loading, setLoading] = useState<Side | null>("a");
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Sequential: the second run starts once the first is in (both hit the server cache for personas).
  useEffect(() => {
    let alive = true;
    (async () => {
      setErr(null);
      setLoading("a");
      const ra = await loadFighter(a, run);
      if (!alive) return;
      if (!ra)
        return setErr(
          a === ME
            ? "No saved reading on this device yet. Get your sign first."
            : "Couldn't read the first taste.",
        );
      setLoading("b");
      const rb = await loadFighter(b, run);
      if (!alive) return;
      if (!rb)
        return setErr(
          b === ME
            ? "No saved reading on this device yet. Get your sign first."
            : "Couldn't read the second taste.",
        );
      setLoading(null);
      setRes({ a: ra, b: rb });
    })();
    return () => {
      alive = false;
    };
  }, [a, b, run, nonce]);

  const out = useMemo(() => (res ? battle(res.a, res.b) : null), [res]);

  if (err)
    return (
      <Shell>
        <div className="flex flex-col items-start gap-4 py-16">
          <p className="font-serif text-[22px] italic text-ink-2">{err}</p>
          {runError && (
            <p className="font-mono text-[12px] text-bad">{runError}</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setNonce((n) => n + 1)}
              className="rounded-full border border-line px-5 py-3 text-ink"
            >
              Try again
            </button>
            <Link
              href="/"
              className="rounded-full bg-accent px-5 py-3 font-semibold text-paper"
            >
              Get your sign
            </Link>
            <Link
              href="/vs"
              className="rounded-full border border-line px-5 py-3 text-ink-2"
            >
              Pick other tastes
            </Link>
          </div>
        </div>
      </Shell>
    );

  if (!out || !res)
    return (
      <Shell>
        <div
          className="flex min-h-[70vh] flex-col items-center justify-center gap-5 text-center"
          aria-live="polite"
        >
          <div className="relative h-24 w-24">
            <VsLens size={96} label="VS" />
          </div>
          <p className="font-serif text-[20px] italic text-ink-2">
            {loading === "a"
              ? "Reading player one's taste…"
              : "Reading player two's taste…"}
          </p>
          <p className="pulse-dot max-w-xs font-mono text-[11px] uppercase leading-relaxed tracking-[0.16em] text-ink-3">
            {(() => {
              const last = [...events].reverse().find((e) => e.type === "step");
              return last && last.type === "step"
                ? last.label
                : "warming up the judge";
            })()}
          </p>
        </div>
      </Shell>
    );

  return <BattleStage out={out} a={a} b={b} />;
}

/** Order rounds so the biggest margin lands last. Presentation only: battle() is untouched. */
export function biggestLast(out: BattleResult): BattleResult {
  const margin = (r: BattleRound) => (r.winner === "tie" ? -1 : Math.abs(r.a - r.b));
  const rounds = out.rounds.map((r, i) => ({ r, i })).sort((x, y) => margin(x.r) - margin(y.r) || x.i - y.i).map((x) => x.r);
  return { ...out, rounds };
}

/** The cinematic clock plus the sequence, for any BattleResult (client-side or from /api/battle). */
export function BattleStage({ out: raw, a = "a", b = "b", onReplay }: { out: BattleResult; a?: string; b?: string; onReplay?: () => void }) {
  const reduce = useReducedMotion() ?? false;
  const [phase, setPhase] = useState(0);
  const [nonce, setNonce] = useState(0);
  const out = useMemo(() => biggestLast(raw), [raw]);
  // The cinematic clock. Reduced motion jumps straight to the reveal.
  useEffect(() => {
    if (!out) return;
    if (reduce) return setPhase(PH_REVEAL);
    setPhase(0);
    const at = [
      T_INTRO,
      ...[1, 2, 3, 4].map((i) => T_INTRO + i * T_ROUND),
      T_INTRO + 4 * T_ROUND + T_SLAM,
    ];
    const ids = at.map((ms, i) => setTimeout(() => setPhase(i + 1), ms));
    return () => ids.forEach(clearTimeout);
  }, [out, reduce, nonce]);

  return (
    <Sequence
      key={nonce}
      out={out}
      phase={phase}
      reduce={reduce}
      a={a}
      b={b}
      onSkip={() => setPhase(PH_REVEAL)}
      onReplay={() => {
        setNonce((n) => n + 1);
        onReplay?.();
      }}
    />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  return (
    // overflow-x-clip: the entering cards start off-screen and must not widen the mobile viewport.
    <div className="min-h-screen w-full overflow-x-clip">
      <Sky f={OPEN_SKY} reduce={reduce} fixed quiet drawn dim={0.7} />
      <main className="mx-auto w-full max-w-[600px] px-4 pb-16">
        <nav className="flex items-center justify-between py-4 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
          <Link href="/" className="hover:text-ink">
            {BRAND.name}
          </Link>
          <span>Taste battle</span>
        </nav>
        {children}
      </main>
    </div>
  );
}

function Sequence({
  out,
  phase,
  reduce,
  a,
  onSkip,
  onReplay,
}: {
  out: BattleResult;
  phase: number;
  reduce: boolean;
  a: string;
  b: string;
  onSkip: () => void;
  onReplay: () => void;
}) {
  const w = useCardWidth();
  const [scopeA, animA] = useAnimate();
  const [scopeB, animB] = useAnimate();
  const panel = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const [share, setShare] = useState<null | "busy" | "done" | "error">(null);
  const anchorA = useRef<HTMLDivElement>(null);
  const anchorB = useRef<HTMLDivElement>(null);
  const roundWinners = useMemo(() => out.rounds.map((r) => r.winner), [out]);
  const beat: Beat = { phase, rounds: roundWinners, winner: out.winner };
  const final = phase >= PH_SLAM;
  // The lens leans toward whoever took the round in play, then the overall winner.
  const lensSide = final ? out.winner : phase >= 1 && phase <= 4 ? out.rounds[phase - 1].winner : "tie";
  const lensColor = lensSide === "tie" ? "#c6ff3d" : COL[lensSide];

  const roundIdx = phase >= 1 && phase <= 4 ? phase - 1 : -1;
  const decided = out.rounds.filter(
    (_, i) => i < (phase >= PH_SLAM ? 4 : Math.max(0, phase - 1)),
  );
  const live = {
    a: decided.filter((r) => r.winner === "a").length,
    b: decided.filter((r) => r.winner === "b").length,
  };

  // The loser of each round takes the hit.
  useEffect(() => {
    if (reduce || roundIdx < 0) return;
    const r = out.rounds[roundIdx];
    const shake = { x: [0, -7, 7, -4, 3, 0] };
    const opts = { delay: 1.1, duration: 0.45 };
    if (r.winner === "a" && scopeB.current) animB(scopeB.current, shake, opts);
    if (r.winner === "b" && scopeA.current) animA(scopeA.current, shake, opts);
  }, [roundIdx, out, reduce, animA, animB, scopeA, scopeB]);

  useEffect(() => {
    if (phase === PH_REVEAL && !reduce)
      setTimeout(
        () =>
          revealRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        250,
      );
  }, [phase, reduce]);

  const doShare = useCallback(async () => {
    const el = panel.current;
    if (!el) return;
    setShare("busy");
    try {
      await document.fonts.ready;
      fontCSS ??= getFontEmbedCSS(el).catch(() => "");
      const opts = {
        pixelRatio: 3,
        backgroundColor: "#07070a",
        fontEmbedCSS: await fontCSS,
        includeQueryParams: true,
      };
      let blob = await toBlob(el, opts);
      if (!blob || blob.size < 40_000) blob = await toBlob(el, opts); // second pass: images are warm now
      if (!blob) throw new Error("render failed");
      const name = `tastrology-battle-${out.jointSign.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      const file = new File([blob], name, { type: "image/png" });
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      if (coarse && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: BRAND.name,
            text: `Our joint sign: ${out.jointSign.name}. ${out.compatibility}% compatible. ${BRAND.question}`,
          });
        } catch (e) {
          if ((e as Error).name !== "AbortError") throw e;
        }
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      setShare("done");
    } catch {
      setShare("error");
    }
  }, [out]);

  // Each card rides its galaxy in from its own side; they meet at the lens with a small recoil.
  const hit = IMPACT_MS / 1000;
  const enter = (side: Side) =>
    reduce
      ? {
          initial: false as const,
          animate: { rotateY: side === "a" ? 10 : -10 },
        }
      : {
          initial: {
            x: side === "a" ? "-75vw" : "75vw",
            rotateY: side === "a" ? 50 : -50,
            opacity: 0,
          },
          animate: {
            x: side === "a" ? ["-75vw", "1.6vw", "0vw"] : ["75vw", "-1.6vw", "0vw"],
            rotateY: side === "a" ? 10 : -10,
            opacity: 1,
          },
          transition: {
            x: { duration: hit / 0.86, times: [0, 0.86, 1], ease: [[0.3, 0, 0.25, 1], "easeOut"] as Easing[] },
            rotateY: { duration: hit, ease: [0.2, 0.7, 0.2, 1] as Easing },
            opacity: { duration: 0.5 },
          },
        };
  // At the end the winner's card stands tall and the loser's sinks back with its galaxy.
  const stance = (side: Side) =>
    !final || out.winner === "tie"
      ? { scale: 1, opacity: 1 }
      : out.winner === side
        ? { scale: 1.04, opacity: 1 }
        : { scale: 0.93, opacity: 0.72 };
  const cardH = (w * 88) / 63;
  const lensSize = w < 180 ? 62 : 78;
  const bleed = Math.round(cardH * 0.75);

  return (
    <Shell>
      {/* Arena: two galaxies, each carrying its card, meeting at the lens */}
      <section aria-label="The two tastes" className="relative">
        <Galaxies
          reduce={reduce}
          beat={beat}
          sides={[
            { card: out.cards.a, side: "a", anchor: anchorA, colour: COL.a },
            { card: out.cards.b, side: "b", anchor: anchorB, colour: COL.b },
          ]}
          className="absolute left-1/2 -z-10 w-screen -translate-x-1/2"
          style={{ top: -bleed, height: `calc(100% + ${bleed * 2}px)` }}
        />
        <div
          className="flex items-start justify-between gap-[18px]"
          style={{ perspective: 900 }}
        >
          {(["a", "b"] as const).map((side) => (
            <div
              key={side}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <motion.div
                {...enter(side)}
                style={{ transformStyle: "preserve-3d" }}
              >
                <motion.div
                  ref={side === "a" ? anchorA : anchorB}
                  animate={stance(side)}
                  transition={{ type: "spring", stiffness: 120, damping: 16 }}
                >
                  <div ref={side === "a" ? scopeA : scopeB}>
                    <HoloCard card={out.cards[side]} width={w} idle={!reduce} />
                  </div>
                </motion.div>
              </motion.div>
              <div className="flex w-full flex-col items-center gap-1 text-center">
                <p className="line-clamp-2 font-display text-[14px] font-semibold leading-tight text-ink">
                  {out.names[side]}
                </p>
                <div
                  className="flex gap-1"
                  role="img"
                  aria-label={`${live[side]} rounds won`}
                >
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-5 rounded-full transition-colors duration-500"
                      style={{
                        background: i < live[side] ? COL[side] : "var(--line)",
                        boxShadow: i < live[side] ? `0 0 8px ${COL[side]}` : undefined,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        <VsLens
          size={lensSize}
          color={lensColor}
          delay={reduce ? 0 : IMPACT_MS - 120}
          className="left-1/2 -translate-x-1/2"
          style={{ top: cardH / 2 - lensSize / 2 }}
        />
      </section>

      {/* Scoreboard */}
      <ol className="mt-5 grid grid-cols-4 gap-1.5" aria-label="Rounds">
        {out.rounds.map((r, i) => {
          const done = i < decided.length;
          const now = i === roundIdx;
          return (
            <li
              key={r.stat}
              className={`rounded-xl border px-2 py-1.5 text-center transition-colors duration-500 ${now ? "border-ink-3 bg-paper-2" : "border-line"}`}
              style={
                done && r.winner !== "tie"
                  ? {
                      borderColor: COL[r.winner],
                      background: `color-mix(in srgb, ${COL[r.winner]} 10%, transparent)`,
                    }
                  : undefined
              }
            >
              <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-3">
                {r.stat}
              </p>
              <p
                className="font-display text-[13px] font-bold"
                style={{
                  color: done
                    ? r.winner === "tie"
                      ? "var(--ink-2)"
                      : COL[r.winner]
                    : "var(--ink-3)",
                }}
              >
                {done
                  ? r.winner === "tie"
                    ? "Tie"
                    : r.winner === "a"
                      ? "P1"
                      : "P2"
                  : "·"}
              </p>
            </li>
          );
        })}
      </ol>

      {/* Stage: the current round, then the slam */}
      {phase < PH_REVEAL && (
        <div className="relative mt-4 min-h-[250px]">
          <AnimatePresence mode="wait">
            {roundIdx >= 0 && (
              <RoundStage
                key={roundIdx}
                r={out.rounds[roundIdx]}
                n={roundIdx + 1}
                out={out}
                reduce={reduce}
              />
            )}
            {phase === PH_SLAM && <Slam key="slam" out={out} reduce={reduce} />}
            {phase === 0 && (
              <motion.p
                key="intro"
                exit={{ opacity: 0 }}
                className="pt-16 text-center font-serif text-[22px] italic text-ink-2"
              >
                Two skies, four rounds, judged on Qloo data. Every round won steals stars from the other side.
              </motion.p>
            )}
          </AnimatePresence>
          <button
            onClick={onSkip}
            className="absolute -bottom-2 right-0 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3 underline-offset-4 hover:text-ink hover:underline"
          >
            Skip to the result
          </button>
        </div>
      )}

      {phase === PH_REVEAL && (
        <div ref={revealRef} className="scroll-mt-4">
          <Slam out={out} reduce={true} compact />
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 120,
              damping: 18,
              delay: 0.15,
            }}
            className="mt-6"
          >
            <ResultPanel res={out} />
            <FightShare ref={panel} res={out} />
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-5 flex flex-col gap-3 sm:flex-row"
          >
            <button
              onClick={doShare}
              disabled={share === "busy"}
              className="flex-1 rounded-full bg-accent px-6 py-4 font-display text-[16px] font-bold text-paper shadow-[0_10px_40px_-12px_#c6ff3d] transition hover:brightness-110 disabled:opacity-60"
            >
              {share === "busy"
                ? "Rendering…"
                : share === "done"
                  ? "Shared. Post it."
                  : share === "error"
                    ? "Try sharing again"
                    : "Share the result"}
            </button>
            <Link
              href={`/vs?a=${encodeURIComponent(a)}`}
              className="flex-1 rounded-full border border-line px-6 py-4 text-center font-display text-[16px] font-semibold text-ink transition hover:border-ink-3"
            >
              Battle someone else
            </Link>
          </motion.div>

          <details className="group mt-8 rounded-2xl border border-line bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-[14px] font-medium text-ink">
              The judge&apos;s full ruling
              <span className="font-mono text-[11px] text-ink-3 group-open:hidden">
                P1 {out.score.a} – {out.score.b} P2
              </span>
            </summary>
            <ol className="flex flex-col gap-4 border-t border-line px-4 py-4">
              {out.rounds.map((r, i) => (
                <li key={r.stat}>
                  <RoundBody r={r} n={i + 1} out={out} reduce />
                </li>
              ))}
              <li className="border-t border-line pt-3 font-mono text-[11px] leading-relaxed text-ink-3">
                Compatibility = {out.breakdown.formula}.
                {out.breakdown.sharedKeywords.length > 0 && (
                  <>
                    {" "}
                    Shared aesthetic: {out.breakdown.sharedKeywords.join(", ")}.
                  </>
                )}
                {out.breakdown.sharedBrands.length > 0 && (
                  <> Shared brands: {out.breakdown.sharedBrands.join(", ")}.</>
                )}
              </li>
            </ol>
          </details>

          <div className="mt-6 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
            <button onClick={onReplay} className="hover:text-ink">
              ↺ Replay
            </button>
            <Link href="/" className="hover:text-ink">
              Get your own sign →
            </Link>
          </div>
        </div>
      )}
    </Shell>
  );
}

function RoundStage({
  r,
  n,
  out,
  reduce,
}: {
  r: BattleRound;
  n: number;
  out: BattleResult;
  reduce: boolean;
}) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
      className="rounded-2xl border border-line bg-card/85 p-4"
    >
      <RoundBody r={r} n={n} out={out} reduce={reduce} big />
    </motion.div>
  );
}

function RoundBody({
  r,
  n,
  out,
  reduce,
  big = false,
}: {
  r: BattleRound;
  n: number;
  out: BattleResult;
  reduce: boolean;
  big?: boolean;
}) {
  const va = useCountUp(r.a, true, reduce);
  const vb = useCountUp(r.b, true, reduce);
  const winTxt =
    r.winner === "tie"
      ? "Draw"
      : `${r.winner === "a" ? out.names.a : out.names.b} takes it`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p
          className={`font-display font-bold tracking-tight text-ink ${big ? "text-[26px]" : "text-[18px]"}`}
        >
          <span className="mr-2 font-mono text-[11px] font-normal text-ink-3">
            R{n}
          </span>
          {r.stat}
        </p>
        <p className="text-right text-[11.5px] text-ink-3">{r.measures}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        {(["a", "b"] as const).map((s) => (
          <div key={s} className="flex items-center gap-2.5">
            <span className="w-6 font-mono text-[10.5px] text-ink-3">
              {s === "a" ? "P1" : "P2"}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper-2">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: COL[s],
                  opacity: r.winner === s || r.winner === "tie" ? 1 : 0.45,
                }}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${r[s]}%` }}
                transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }}
              />
            </div>
            <span className="w-7 text-right font-mono text-[13px] tabular-nums text-ink">
              {s === "a" ? va : vb}
            </span>
          </div>
        ))}
      </div>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 1, duration: 0.4 }}
        className="flex flex-col gap-1.5"
      >
        <p
          className="font-mono text-[10.5px] uppercase tracking-[0.16em]"
          style={{ color: r.winner === "tie" ? "var(--ink-2)" : COL[r.winner] }}
        >
          {winTxt}
        </p>
        <p
          className={`font-serif italic leading-snug text-ink ${big ? "text-[20px]" : "text-[16px]"}`}
        >
          &ldquo;{r.roast}&rdquo;
        </p>
        <p className="font-mono text-[10.5px] text-ink-3">
          receipt: {r.receipt}
        </p>
      </motion.div>
    </div>
  );
}

function Slam({
  out,
  reduce,
  compact = false,
}: {
  out: BattleResult;
  reduce: boolean;
  compact?: boolean;
}) {
  const v = useCountUp(out.compatibility, true, reduce, 700);
  return (
    <motion.div
      initial={reduce ? false : { scale: 2.4, opacity: 0, rotate: -4 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 520, damping: 17 }}
      className={`flex flex-col items-center text-center ${compact ? "pt-6" : "pt-6"}`}
      aria-live="polite"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">
        Final · {out.score.a}–{out.score.b}
      </p>
      <p className={`mt-1 max-w-md font-display font-bold leading-tight tracking-tight text-ink ${compact ? "text-[24px]" : "text-[28px]"}`}>
        {out.winner === "tie" ? (
          <>
            Dead even. <span className="font-serif font-normal italic text-ink-2">The two skies merge.</span>
          </>
        ) : (
          <>
            <span style={{ color: COL[out.winner] }}>{out.names[out.winner]}</span>{" "}
            <span className="font-serif font-normal italic text-ink-2">pulls</span>{" "}
            {out.names[out.winner === "a" ? "b" : "a"]}{" "}
            <span className="font-serif font-normal italic text-ink-2">in.</span>
          </>
        )}
      </p>
      <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">
        Compatibility
      </p>
      <p
        className={`font-display font-extrabold leading-none tracking-tighter text-accent tabular-nums ${compact ? "text-[72px]" : "text-[104px]"}`}
        style={{ textShadow: "0 0 40px rgb(198 255 61 / 0.35)" }}
      >
        {v}
        <span className="text-[0.45em] align-top">%</span>
      </p>
      <p className="mt-1 font-display text-[20px] font-semibold text-ink">
        {out.verdict.label}
      </p>
      {!compact && (
        <p className="mt-1 max-w-sm font-serif text-[16px] italic text-ink-2">
          {out.verdict.line}
        </p>
      )}
      {!compact && (
        <p className="mt-3 font-mono text-[10.5px] text-ink-3">
          {out.breakdown.sharedKeywords.length} shared aesthetic word
          {out.breakdown.sharedKeywords.length === 1 ? "" : "s"} ·{" "}
          {out.breakdown.sharedBrands.length} shared brand
          {out.breakdown.sharedBrands.length === 1 ? "" : "s"}
        </p>
      )}
    </motion.div>
  );
}
