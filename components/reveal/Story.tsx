"use client";

import { AnimatePresence, motion, type TargetAndTransition } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sigil, type SigilKind } from "@/components/card/Sigils";
import { displayName, proxied, type CardData, type CardType } from "@/lib/card";
import type { StyleResult } from "@/lib/types";
import { Sky } from "./Sky";
import { KIND_LABEL, overlapFigures, skyState } from "./traceModel";
import s from "./reveal.module.css";
import { maskRude } from "@/lib/guard";

const EASE = [0.2, 0.7, 0.2, 1] as const;

type Enter = "rise" | "wipe" | "iris" | "drop" | "zoom";
const ENTER: Record<Enter, { initial: TargetAndTransition; animate: TargetAndTransition; exit: TargetAndTransition }> = {
  rise: { initial: { opacity: 0, y: 24, filter: "blur(10px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" }, exit: { opacity: 0, y: -16, filter: "blur(10px)" } },
  wipe: { initial: { opacity: 1, clipPath: "inset(-60% 160% -60% -60%)" }, animate: { opacity: 1, clipPath: "inset(-60% -60% -60% -60%)" }, exit: { opacity: 0, x: -40 } },
  iris: { initial: { opacity: 1, clipPath: "circle(0% at 50% 40%)" }, animate: { opacity: 1, clipPath: "circle(300% at 50% 40%)" }, exit: { opacity: 0, scale: 0.94 } },
  drop: { initial: { opacity: 0, y: -60 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 60, rotate: 3 } },
  zoom: { initial: { opacity: 0, scale: 1.18 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.9 } },
};
const DUR = 4200;

interface Beat {
  key: string;
  dur: number;
  tint: [string, string];
  /** How the slide enters: each beat gets its own visual device, not the same blur-fade. */
  enter?: Enter;
  render: (reduce: boolean) => React.ReactNode;
}

/**
 * Phase 2: Wrapped-style stories built only from the run's real data.
 * Tap right/left, swipe, arrow keys; hold to pause; Skip jumps to the pack.
 */
export function Story({ result, card, reduce, onFinish }: { result: StyleResult; card: CardData; reduce: boolean; onFinish: () => void }) {
  const beats = useMemo(() => buildBeats(result, card), [result, card]);
  const sky = useMemo(
    () => skyState(result.seeds, result.dna.name, result.dna.lobes.map((l) => l.seedIds), (result.inert ?? []).map((x) => x.id), result.vibes),
    [result],
  );
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const fill = useRef<HTMLDivElement>(null);
  const beat = beats[i];

  const at = useRef(0);
  at.current = i;
  const next = useCallback(() => {
    if (at.current + 1 >= beats.length) onFinish();
    else setI(at.current + 1);
  }, [beats.length, onFinish]);
  const prev = useCallback(() => setI(Math.max(0, at.current - 1)), []);

  // Clock: drives the active progress bar directly (no re-render per frame), pauses on hold/hidden tab.
  // Elapsed time on the current beat survives pause/resume; it only resets when the beat changes.
  const elapsed = useRef(0);
  const bars = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    elapsed.current = 0;
    // Bars are driven imperatively, so re-sync all of them (going back must empty the later ones).
    bars.current.forEach((b, k) => b && (b.style.transform = `scaleX(${k < i ? 1 : 0})`));
  }, [i]);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!paused && !document.hidden) elapsed.current += dt;
      const t = elapsed.current;
      if (fill.current) fill.current.style.transform = `scaleX(${Math.min(1, t / beat.dur)})`;
      if (t >= beat.dur) next();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [i, paused, beat.dur, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") onFinish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onFinish]);

  // Tap zones + swipe + hold-to-pause.
  const press = useRef<{ x: number; y: number; t: number } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onDown = (e: React.PointerEvent) => {
    press.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    holdTimer.current = setTimeout(() => setPaused(true), 220);
  };
  const onUp = (e: React.PointerEvent) => {
    clearTimeout(holdTimer.current);
    const p = press.current;
    press.current = null;
    if (!p) return;
    const wasHold = paused;
    setPaused(false);
    const dx = e.clientX - p.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - p.y)) return dx < 0 ? next() : prev();
    if (wasHold || performance.now() - p.t > 300) return;
    const w = (e.currentTarget as HTMLElement).getBoundingClientRect().width;
    if (e.clientX < w * 0.3) prev();
    else next();
  };

  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* your sky, carried over from the reading (replaces the colour washes) */}
      <Sky f={sky} reduce={reduce} dim={0.75} drawn />

      {/* progress */}
      <div className="absolute inset-x-0 top-0 z-20 px-3 pt-3 sm:px-6 sm:pt-5">
        <div className="mx-auto flex max-w-xl lg:max-w-4xl gap-1">
          {beats.map((b, k) => (
            <div key={b.key} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                ref={(el) => {
                  bars.current[k] = el;
                  if (k === i) fill.current = el;
                }}
                className="h-full origin-left rounded-full bg-white"
              />
            </div>
          ))}
        </div>
        <div className="mx-auto mt-3 flex max-w-xl lg:max-w-4xl items-center justify-between">
          <span className="font-display text-[14px] font-semibold tracking-tight">
            Tastrology<span className="text-accent">.</span>
            <span className="ml-2 font-mono text-[10px] font-normal tracking-[0.2em] text-ink-3">
              {String(i + 1).padStart(2, "0")}/{String(beats.length).padStart(2, "0")}
            </span>
          </span>
          <button
            onClick={onFinish}
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1 font-mono text-[11px] text-ink-2 backdrop-blur hover:text-ink"
          >
            Skip ›
          </button>
        </div>
      </div>

      {/* stage */}
      <div
        className="absolute inset-0 z-10 flex cursor-pointer select-none items-center justify-center px-6 pb-10 pt-24"
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={() => {
          clearTimeout(holdTimer.current);
          setPaused(false);
        }}
        role="button"
        tabIndex={-1}
        aria-label="Next"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={beat.key}
            className="w-full max-w-xl lg:max-w-4xl"
            initial={reduce ? { opacity: 0 } : ENTER[beat.enter ?? "rise"].initial}
            animate={reduce ? { opacity: 1 } : ENTER[beat.enter ?? "rise"].animate}
            exit={reduce ? { opacity: 0 } : ENTER[beat.enter ?? "rise"].exit}
            transition={{ duration: beat.enter === "wipe" || beat.enter === "iris" ? 0.7 : 0.45, ease: EASE }}
          >
            {beat.render(reduce)}
          </motion.div>
        </AnimatePresence>
      </div>

      <p className="absolute inset-x-0 bottom-4 z-20 text-center font-mono text-[10px] tracking-[0.18em] text-ink-3">
        {paused ? "❚❚ PAUSED · RELEASE TO PLAY" : "HOLD TO PAUSE · TAP LEFT TO GO BACK"}
      </p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ beats */

function Eyebrow({ children, color, sigil }: { children: React.ReactNode; color?: string; sigil?: SigilKind }) {
  return (
    <p className="mb-4 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.26em] text-ink-3" style={color ? { color } : undefined}>
      {sigil && <Sigil kind={sigil} className="h-4 w-4" />}
      {children}
    </p>
  );
}

/** Oversized line sigil behind a slide: the slide's visual device. */
function Watermark({ kind, color, reduce, className = "" }: { kind: SigilKind; color: string; reduce: boolean; className?: string }) {
  return (
    <motion.div
      aria-hidden
      className={`pointer-events-none absolute -z-10 ${className}`}
      style={{ color, filter: `drop-shadow(0 0 24px ${color})` }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, rotate: -40 }}
      animate={reduce ? { opacity: 0.2 } : { opacity: 0.2, scale: 1, rotate: 0 }}
      transition={{ duration: 1.4, ease: EASE }}
    >
      <Sigil kind={kind} className="h-full w-full" />
    </motion.div>
  );
}

const rise = (reduce: boolean, delay: number, y = 28) => ({
  initial: reduce ? { opacity: 0 } : { opacity: 0, y, filter: "blur(8px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: reduce ? 0.3 : 0.7, delay: reduce ? 0 : delay, ease: EASE },
});

function Duo({ src, a, b, className = "", style }: { src?: string; a: string; b: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`${s.duo} ${className}`} style={{ ["--da" as string]: a, ["--db" as string]: b, ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" />}
    </div>
  );
}

function Big({ t, children, size = "clamp(44px,13vw,92px)" }: { t: CardType; children: React.ReactNode; size?: string }) {
  return (
    <span
      className={`${s.gradText} block font-display font-bold leading-[0.92] tracking-[-0.03em]`}
      style={{ ["--ta" as string]: t.a, ["--tb" as string]: t.b, fontSize: size }}
    >
      {children}
    </span>
  );
}

function buildBeats(r: StyleResult, card: CardData): Beat[] {
  const { sun, moon, rising } = card.bigThree;
  const seedName = (id: string) => displayName(r.seeds.find((x) => x.id === id)?.name ?? "");
  const beats: Beat[] = [];
  const n = r.seeds.length;
  // the vibes were read too (they steer the brands), so they count here and join the fan as words: a vibe's Qloo
  // picture is just whatever entity anchored the tag, which can be off ("ramen" came back as a noodle-brand packet)
  const vibes = r.vibes ?? [];
  const fan = [
    ...r.seeds.map((x) => ({ key: x.id, src: x.image ? proxied(x.image) : undefined, word: undefined as string | undefined })),
    ...vibes.map((v) => ({ key: `vibe:${v.name}`, src: undefined as string | undefined, word: v.name as string | undefined })),
  ];
  const m = fan.length;

  // 1. The input
  beats.push({
    key: "loves",
    dur: DUR,
    tint: [`color-mix(in oklab, ${sun.a} 45%, transparent)`, `color-mix(in oklab, ${moon.a} 35%, transparent)`],
    render: (reduce) => (
      <div className="text-center">
        <Eyebrow>01 · the input</Eyebrow>
        <motion.p {...rise(reduce, 0.05)} className="font-serif text-[clamp(28px,7vw,64px)] italic leading-none text-ink-2">
          We read your
        </motion.p>
        <motion.h2 {...rise(reduce, 0.2)} className="mt-1 font-display text-[clamp(64px,19vw,205px)] font-bold leading-[0.9] tracking-[-0.04em]">
          {n} loves
        </motion.h2>
        {vibes.length > 0 && (
          <motion.p
            {...rise(reduce, 0.32)}
            className="mt-2 bg-[linear-gradient(90deg,#ff7ab6,#ffd36e,#c6ff3d,#6ee7ff,#b18cff)] bg-clip-text font-display text-[clamp(26px,6vw,52px)] font-bold leading-none tracking-[-0.03em] text-transparent"
          >
            + {vibes.length} vibe{vibes.length > 1 ? "s" : ""}
          </motion.p>
        )}
        <div className="relative mx-auto mt-8 flex h-[150px] max-w-md items-center justify-center sm:h-[180px]">
          {fan.map((it, k) => {
            const off = k - (m - 1) / 2;
            return (
              <motion.figure
                key={it.key}
                className="absolute w-[88px] sm:w-[108px]"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 120, rotate: 0, x: 0 }}
                animate={{ opacity: 1, y: Math.abs(off) * 8, rotate: off * 7, x: off * (m > 4 ? 56 : 66) }}
                transition={{ duration: reduce ? 0.3 : 0.8, delay: reduce ? 0 : 0.45 + k * 0.09, ease: EASE }}
                style={{ zIndex: 10 - Math.abs(Math.round(off)) }}
              >
                <Duo
                  src={it.src}
                  a={k % 2 ? moon.a : sun.a}
                  b={k % 2 ? moon.b : sun.b}
                  className="aspect-[3/4] rounded-xl shadow-[0_18px_40px_-12px_rgb(0_0_0/0.8)] ring-1 ring-white/15"
                />
                {it.word && (
                  <span
                    className="absolute inset-0 grid place-items-center p-2 text-center font-serif italic leading-none text-ink [container-type:inline-size]"
                  >
                    {/* sized to the tile and the longest word, so "Cryptocurrency" stays one word */}
                    <span style={{ fontSize: `min(26cqi, calc(165cqi / ${Math.max(4, ...it.word.split(/\s+/).map((w) => w.length))}))` }}>{it.word}</span>
                  </span>
                )}
              </motion.figure>
            );
          })}
        </div>
        <motion.p {...rise(reduce, 1.0, 10)} className="mx-auto mt-6 max-w-md text-[13px] leading-relaxed text-ink-2">
          {r.seeds.map((x, k) => (
            <span key={x.id}>
              {k > 0 && <span className="text-ink-3"> · </span>}
              {displayName(x.name)}
              <span className="ml-1 font-mono text-[9.5px] uppercase text-ink-3">{KIND_LABEL[x.kind] ?? x.kind}</span>
            </span>
          ))}
          {vibes.map((v) => (
            <span key={v.name}>
              <span className="text-ink-3"> · </span>
              {v.name}
              <span className="ml-1 font-mono text-[9.5px] uppercase text-ink-3">vibe</span>
            </span>
          ))}
        </motion.p>
        <motion.p {...rise(reduce, 1.3, 6)} className="mt-4 font-mono text-[11px] text-ink-3">
          {r.stats.qlooCalls} Qloo calls · {(r.stats.ms / 1000).toFixed(1)}s · {r.stats.llmSteps} agent steps
        </motion.p>
      </div>
    ),
  });

  // 2. Sun
  const main = r.dna.lobes[0]?.keywords.length ? r.dna.lobes[0].keywords : r.dna.keywords;
  const sunWords = [sun.name, ...main.map((k) => k.name).filter((k) => k !== sun.name)].slice(0, 4);
  const sunSeeds = r.dna.lobes[0]?.seedIds.length ?? n;
  beats.push({
    key: "sun",
    dur: DUR + 400,
    tint: [`color-mix(in oklab, ${sun.a} 60%, transparent)`, `color-mix(in oklab, ${sun.b} 45%, transparent)`],
    enter: "wipe",
    render: (reduce) => (
      <div className="relative isolate">
        <Watermark kind="sun" color={sun.a} reduce={reduce} className="-right-16 -top-24 h-[78vw] max-h-[420px] w-[78vw] max-w-[420px]" />
        <Eyebrow color={sun.a} sigil="sun">your sun · main aesthetic</Eyebrow>
        <motion.p {...rise(reduce, 0.05)} className="font-serif text-[clamp(26px,6.6vw,61px)] italic leading-tight text-ink-2">
          Qloo says they share…
        </motion.p>
        <div className="mt-5 space-y-1">
          {sunWords.map((w, k) => (
            <motion.div
              key={w}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: k % 2 ? 60 : -60, filter: "blur(12px)" }}
              animate={{ opacity: k === 0 ? 1 : 0.9 - k * 0.15, x: 0, filter: "blur(0px)" }}
              transition={{ duration: reduce ? 0.3 : 0.75, delay: reduce ? 0 : 0.5 + k * 0.32, ease: EASE }}
            >
              {k === 0 ? (
                <Big t={sun} size="clamp(48px,15vw,104px)">
                  {w}
                </Big>
              ) : (
                <span className="block font-display text-[clamp(26px,8vw,77px)] font-semibold leading-[1.02] tracking-[-0.02em] text-ink">{w}</span>
              )}
            </motion.div>
          ))}
        </div>
        <motion.p {...rise(reduce, 1.9, 6)} className="mt-7 font-mono text-[11px] leading-relaxed text-ink-3">
          consensus across {sunSeeds} of your {n} loves · Qloo tag graph, aesthetic + personal style
        </motion.p>
      </div>
    ),
  });

  // 3. Moon: contradiction drama, or the quieter second aesthetic.
  const sideB = r.dna.lobes[1];
  if (card.bigThree.moonIsContradiction && sideB) {
    const odd = sideB.seedIds.map((id) => r.seeds.find((x) => x.id === id)).filter((x) => x != null);
    const ov = overlapFigures(r);
    const oddNames = odd.map((x) => displayName(x.name)).join(" + ");
    beats.push({
      key: "except",
      dur: DUR + 600,
      tint: [`color-mix(in oklab, ${moon.a} 55%, transparent)`, "color-mix(in oklab, #fb7185 35%, transparent)"],
      enter: "zoom",
      render: (reduce) => (
        <div className="text-center">
          <Eyebrow color="var(--bad)">the plot twist</Eyebrow>
          <motion.h2 {...rise(reduce, 0.05)} className="font-serif text-[clamp(48px,14vw,154px)] italic leading-[0.95]">
            …except one.
          </motion.h2>
          <div className="relative mx-auto mt-8 w-[150px] sm:w-[180px]">
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.25, rotate: 0 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: [0, -4, 3, -2, 4] }}
              transition={{ duration: reduce ? 0.3 : 1.1, delay: reduce ? 0 : 0.6, ease: EASE }}
            >
              <Duo
                src={odd[0]?.image ? proxied(odd[0].image) : undefined}
                a={moon.a}
                b={moon.b}
                className="aspect-[3/4] rounded-2xl shadow-[0_24px_60px_-16px_rgb(0_0_0/0.9)] ring-2"
                style={{ boxShadow: `0 0 70px -14px ${moon.a}`, ["--tw-ring-color" as string]: moon.a }}
              />
              {/* crack */}
              <motion.svg
                viewBox="0 0 100 133"
                className="pointer-events-none absolute inset-0 h-full w-full"
                initial="hide"
                animate="show"
                aria-hidden
              >
                <motion.path
                  d="M58 -2 L46 30 L60 46 L40 74 L54 92 L44 135"
                  fill="none"
                  stroke="white"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  style={{ filter: "drop-shadow(0 0 4px white)" }}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 1.3, ease: "easeIn" }}
                />
              </motion.svg>
            </motion.div>
          </div>
          <motion.p {...rise(reduce, 1.2, 10)} className="mt-6 font-display text-[clamp(20px,5.4vw,45px)] font-semibold leading-tight">
            {oddNames}
          </motion.p>
          {ov && (
            <motion.div {...rise(reduce, 1.6, 8)} className="mx-auto mt-4 max-w-xs space-y-2 text-left font-mono text-[11px] text-ink-2">
              <OverlapBar label="this one ↔ the rest" value={ov.odd} color="var(--bad)" reduce={reduce} delay={1.8} />
              {ov.rest != null && <OverlapBar label="among the rest" value={ov.rest} color={sun.a} reduce={reduce} delay={2.0} />}
              <p className="pt-1 text-center text-[10px] text-ink-3">aesthetic tag overlap · Qloo tag graph</p>
            </motion.div>
          )}
        </div>
      ),
    });
    const sideBrands = r.brands.filter((b) => b.side).map((b) => b.entity.name);
    beats.push({
      key: "moon",
      dur: DUR + 400,
      tint: [`color-mix(in oklab, ${moon.a} 60%, transparent)`, `color-mix(in oklab, ${moon.b} 50%, transparent)`],
      enter: "iris",
      render: (reduce) => (
        <div className="relative isolate">
          <Watermark kind="moon" color={moon.a} reduce={reduce} className="-left-20 -top-16 h-[70vw] max-h-[380px] w-[70vw] max-w-[380px]" />
          <Eyebrow color={moon.a} sigil="moon">your moon · the hidden side</Eyebrow>
          <motion.p {...rise(reduce, 0.05)} className="font-serif text-[clamp(24px,6.2vw,58px)] italic leading-tight text-ink-2">
            So we didn&apos;t average it away. {oddNames.split(" ").length > 4 ? "It" : oddNames} gets its own side:
          </motion.p>
          <motion.div {...rise(reduce, 0.5, 40)} className="mt-6">
            <Big t={moon} size="clamp(56px,17vw,120px)">
              {moon.name}
            </Big>
          </motion.div>
          <motion.p {...rise(reduce, 0.9, 12)} className="mt-3 font-display text-[clamp(18px,5vw,42px)] text-ink-2">
            {sideB.keywords
              .slice(1, 4)
              .map((k) => k.name)
              .join(" · ")}
          </motion.p>
          {sideBrands.length > 0 && (
            <motion.div {...rise(reduce, 1.4, 8)} className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3">side B · separate Qloo query</p>
              <p className="mt-1.5 font-display text-[17px] font-medium">{sideBrands.join("  ·  ")}</p>
            </motion.div>
          )}
        </div>
      ),
    });
  } else {
    const rest = r.dna.keywords.map((k) => k.name).filter((k) => k !== sun.name && k !== moon.name).slice(0, 3);
    beats.push({
      key: "moon",
      dur: DUR,
      tint: [`color-mix(in oklab, ${moon.a} 55%, transparent)`, `color-mix(in oklab, ${moon.b} 45%, transparent)`],
      enter: "iris",
      render: (reduce) => (
        <div className="relative isolate">
          <Watermark kind="moon" color={moon.a} reduce={reduce} className="-left-20 -top-16 h-[70vw] max-h-[380px] w-[70vw] max-w-[380px]" />
          <Eyebrow color={moon.a} sigil="moon">your moon · the hidden side</Eyebrow>
          <motion.p {...rise(reduce, 0.05)} className="font-serif text-[clamp(24px,6.2vw,58px)] italic leading-tight text-ink-2">
            Underneath it, a quieter thread:
          </motion.p>
          <motion.div {...rise(reduce, 0.45, 40)} className="mt-6">
            <Big t={moon} size="clamp(56px,17vw,120px)">
              {moon.name}
            </Big>
          </motion.div>
          {rest.length > 0 && (
            <motion.p {...rise(reduce, 0.9, 12)} className="mt-4 font-display text-[clamp(18px,5vw,42px)] text-ink-2">
              with notes of {rest.join(", ")}
            </motion.p>
          )}
          <motion.p {...rise(reduce, 1.4, 6)} className="mt-7 font-mono text-[11px] text-ink-3">
            your loves agree: no contradiction found
          </motion.p>
        </div>
      ),
    });
  }

  // 4. Self-critique: what got thrown out.
  if (r.rejected.length) {
    const shown = r.rejected.slice(0, 4);
    const kept = r.brands.length;
    beats.push({
      key: "rejected",
      dur: DUR + 800,
      tint: ["color-mix(in oklab, #fb7185 32%, transparent)", `color-mix(in oklab, ${sun.b} 30%, transparent)`],
      enter: "drop",
      render: (reduce) => <ReceiptSlide r={r} shown={shown} kept={kept} reduce={reduce} />,
    });
  }

  // 5. Rising
  const rl = rising.name.toLowerCase();
  const carriers = r.brands.filter((b) => !b.side && b.entity.style?.some((x) => x.toLowerCase() === rl)).slice(0, 4);
  const carriersOrTop = carriers.length ? carriers : r.brands.filter((b) => !b.side).slice(0, 3);
  beats.push({
    key: "rising",
    dur: DUR,
    tint: [`color-mix(in oklab, ${rising.a} 55%, transparent)`, `color-mix(in oklab, ${rising.b} 45%, transparent)`],
    enter: "drop",
    render: (reduce) => (
      <div>
        <Eyebrow color={rising.a} sigil="rising">your rising · how you come across</Eyebrow>
        <motion.p {...rise(reduce, 0.05)} className="font-serif text-[clamp(24px,6.2vw,58px)] italic leading-tight text-ink-2">
          To everyone else, you read as
        </motion.p>
        {/* horizon: the word rises from below a line, like a sign clearing the horizon */}
        <div className="relative mt-5 overflow-hidden pb-1">
          <motion.div initial={reduce ? { opacity: 0 } : { y: "105%" }} animate={reduce ? { opacity: 1 } : { y: 0 }} transition={{ duration: reduce ? 0.3 : 1.1, delay: reduce ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}>
            <Big t={rising} size="clamp(56px,17vw,120px)">
              {rising.name}
            </Big>
          </motion.div>
        </div>
        <motion.div
          className="h-px origin-left"
          style={{ background: `linear-gradient(90deg, ${rising.a}, ${rising.b}, transparent)`, boxShadow: `0 0 18px ${rising.a}` }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: reduce ? 0 : 0.8, ease: EASE }}
        />
        <motion.p {...rise(reduce, 1.0, 8)} className="mt-8 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3">
          {carriers.length ? "the personal style Qloo tags on" : "read from your top brands"}
        </motion.p>
        <div className="mt-2 flex flex-wrap gap-2">
          {carriersOrTop.map((b, k) => (
            <motion.span
              key={b.entity.id}
              {...rise(reduce, 1.15 + k * 0.12, 10)}
              className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[14px] font-medium backdrop-blur"
            >
              {maskRude(b.entity.name)}
              <span className="ml-1.5 font-mono text-[10px] text-ink-3">{b.affinity.toFixed(3)}</span>
            </motion.span>
          ))}
        </div>
        {carriersOrTop[0]?.because.length ? (
          <motion.p {...rise(reduce, 1.7, 6)} className="mt-4 font-mono text-[10.5px] text-ink-3">
            {carriersOrTop[0].entity.name} ← {carriersOrTop[0].because.map(seedName).filter(Boolean).join(" + ")}
          </motion.p>
        ) : null}
      </div>
    ),
  });

  // 6. Minted
  beats.push({
    key: "minted",
    dur: 3000,
    tint: [`color-mix(in oklab, ${sun.a} 55%, transparent)`, `color-mix(in oklab, ${moon.a} 50%, transparent)`],
    enter: "zoom",
    render: (reduce) => (
      <div className="text-center">
        <Eyebrow>{card.rarity === "secret" || card.rarity === "holo" ? "this one's rare" : "fresh off the press"}</Eyebrow>
        <motion.p {...rise(reduce, 0.05)} className="font-serif text-[clamp(30px,8vw,77px)] italic leading-tight text-ink-2">
          Sun, Moon, Rising.
        </motion.p>
        <motion.h2 {...rise(reduce, 0.35)} className="mt-2 font-display text-[clamp(40px,12vw,134px)] font-bold leading-[0.95] tracking-[-0.03em]">
          Your sign has been <span className="font-serif font-normal italic text-accent">minted.</span>
        </motion.h2>
        <motion.div {...rise(reduce, 0.9, 10)} className="mt-8 flex justify-center gap-3 text-[13px] text-ink-2">
          {(
            [
              ["sun", sun],
              ["moon", moon],
              ["rising", rising],
            ] as [SigilKind, CardType][]
          ).map(([g, t]) => (
            <span key={t.name + g} className="flex items-center gap-1.5">
              <Sigil kind={g} className="h-3.5 w-3.5" />
              <span style={{ color: t.a }}>{t.name}</span>
            </span>
          ))}
        </motion.div>
      </div>
    ),
  });

  return beats;
}

function OverlapBar({ label, value, color, reduce, delay }: { label: string; value: number; color: string; reduce: boolean; delay: number }) {
  return (
    <div>
      <div className="flex justify-between">
        <span className="truncate">{label}</span>
        <b style={{ color }}>{value}%</b>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(2, Math.min(100, value * 4))}%` }}
          transition={{ duration: reduce ? 0 : 0.8, delay: reduce ? 0 : delay, ease: EASE }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the self-critique, as a receipt */

const STAMP_AT = 1.05;
const STAMP_GAP = 0.42;

function ReceiptSlide({ r, shown, kept, reduce }: { r: StyleResult; shown: StyleResult["rejected"]; kept: number; reduce: boolean }) {
  const when = new Date(r.createdAt || Date.now());
  const stamp = when.toISOString().slice(0, 16).replace("T", " ");
  return (
    <div>
      <Eyebrow color="var(--bad)">the self-critique</Eyebrow>
      <motion.h2 {...rise(reduce, 0.05, 14)} className="font-display text-[clamp(32px,9vw,96px)] font-bold leading-[0.95] tracking-[-0.03em]">
        We threw <span className="font-serif font-normal italic">these</span> out.
      </motion.h2>

      <div className="relative mx-auto mt-6 max-w-[340px]">
        {/* printer slot */}
        <div className="relative z-10 mx-[-10px] h-3 rounded-full bg-black/80 shadow-[inset_0_2px_4px_rgb(0_0_0/0.9),0_1px_0_rgb(255_255_255/0.08)]" />
        <motion.div
          className={s.receipt}
          initial={reduce ? { opacity: 0 } : { clipPath: "inset(0 0 100% 0)", y: -18 }}
          animate={reduce ? { opacity: 1 } : { clipPath: "inset(0 0 0% 0)", y: 0 }}
          transition={{ duration: reduce ? 0.3 : 0.9, delay: reduce ? 0 : 0.2, ease: [0.3, 0.1, 0.2, 1] }}
        >
          <div className="flex justify-between text-[9.5px] tracking-[0.18em]">
            <span>TASTROLOGY · QC</span>
            <span>RUN {r.runId.slice(0, 6).toUpperCase()}</span>
          </div>
          <p className="mt-0.5 text-[9px] tracking-[0.12em] opacity-60">{stamp} · AGENT SELF-CRITIQUE</p>
          <div className={s.rule} />
          <ul className="space-y-2.5">
            {shown.map((rj, k) => (
              <motion.li
                key={rj.entity.id}
                className="relative pr-14"
                animate={reduce ? undefined : { x: [0, -2, 2, -1, 0] }}
                transition={{ duration: 0.22, delay: STAMP_AT + k * STAMP_GAP + 0.08 }}
              >
                <div className="flex items-baseline gap-2 text-[12.5px] font-semibold">
                  <span className="min-w-0 flex-1 truncate">{displayName(rj.entity.name)}</span>
                  <span className={s.dotLeader} />
                  <span className="tabular-nums">{rj.affinity.toFixed(2)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[9.5px] leading-snug opacity-65">{rj.reason}</p>
                <motion.span
                  className={s.void}
                  style={{ rotate: k % 2 ? 9 : -11 }}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={reduce ? { duration: 0.2 } : { type: "spring", stiffness: 700, damping: 22, mass: 0.6, delay: STAMP_AT + k * STAMP_GAP }}
                >
                  VOID
                </motion.span>
              </motion.li>
            ))}
          </ul>
          <div className={s.rule} />
          <div className="flex justify-between text-[11px] font-semibold tracking-[0.1em]">
            <span>KEPT {kept}</span>
            <span>VOID {r.rejected.length}</span>
          </div>
          <p className="mt-1 text-[9.5px] opacity-65">One-seed flukes don&apos;t count. Thank you for your taste.</p>
          <div className={s.barcode} aria-hidden />
        </motion.div>
      </div>
    </div>
  );
}
