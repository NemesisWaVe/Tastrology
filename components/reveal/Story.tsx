"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { proxied, type CardData, type CardType } from "@/lib/card";
import type { StyleResult } from "@/lib/types";
import { KIND_LABEL, overlapFigures } from "./traceModel";
import s from "./reveal.module.css";

const EASE = [0.2, 0.7, 0.2, 1] as const;
const DUR = 4200;

interface Beat {
  key: string;
  dur: number;
  tint: [string, string];
  render: (reduce: boolean) => React.ReactNode;
}

/**
 * Phase 2: Wrapped-style stories built only from the run's real data.
 * Tap right/left, swipe, arrow keys; hold to pause; Skip jumps to the pack.
 */
export function Story({ result, card, reduce, onFinish }: { result: StyleResult; card: CardData; reduce: boolean; onFinish: () => void }) {
  const beats = useMemo(() => buildBeats(result, card), [result, card]);
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
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let t = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!paused && !document.hidden) t += dt;
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
      {/* colour field */}
      <motion.div
        className={s.orb}
        style={{ width: "80vmax", height: "80vmax", left: "-30vmax", top: "-35vmax" }}
        animate={{ background: beat.tint[0], x: reduce ? 0 : i * 18, scale: reduce ? 1 : 1 + (i % 2) * 0.08 }}
        transition={{ duration: 1.4, ease: EASE }}
      />
      <motion.div
        className={s.orb}
        style={{ width: "70vmax", height: "70vmax", right: "-30vmax", bottom: "-35vmax" }}
        animate={{ background: beat.tint[1], y: reduce ? 0 : -i * 14 }}
        transition={{ duration: 1.4, ease: EASE }}
      />

      {/* progress */}
      <div className="absolute inset-x-0 top-0 z-20 px-3 pt-3 sm:px-6 sm:pt-5">
        <div className="mx-auto flex max-w-xl gap-1">
          {beats.map((b, k) => (
            <div key={b.key} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                ref={k === i ? fill : undefined}
                className="h-full origin-left rounded-full bg-white"
                style={{ transform: `scaleX(${k < i ? 1 : 0})` }}
              />
            </div>
          ))}
        </div>
        <div className="mx-auto mt-3 flex max-w-xl items-center justify-between">
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
            className="w-full max-w-xl"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -16, filter: "blur(10px)" }}
            transition={{ duration: 0.45, ease: EASE }}
          >
            {beat.render(reduce)}
          </motion.div>
        </AnimatePresence>
      </div>

      <p className="absolute inset-x-0 bottom-4 z-20 text-center font-mono text-[10px] tracking-[0.18em] text-ink-3">
        {paused ? "PAUSED" : "TAP · SWIPE · ← →"}
      </p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ beats */

function Eyebrow({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <p className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.26em] text-ink-3" style={color ? { color } : undefined}>
      {children}
    </p>
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
  const seedName = (id: string) => r.seeds.find((x) => x.id === id)?.name ?? "";
  const beats: Beat[] = [];
  const n = r.seeds.length;

  // 1. The input
  beats.push({
    key: "loves",
    dur: DUR,
    tint: [`color-mix(in oklab, ${sun.a} 45%, transparent)`, `color-mix(in oklab, ${moon.a} 35%, transparent)`],
    render: (reduce) => (
      <div className="text-center">
        <Eyebrow>01 · the input</Eyebrow>
        <motion.p {...rise(reduce, 0.05)} className="font-serif text-[clamp(28px,7vw,40px)] italic leading-none text-ink-2">
          We read your
        </motion.p>
        <motion.h2 {...rise(reduce, 0.2)} className="mt-1 font-display text-[clamp(64px,19vw,128px)] font-bold leading-[0.9] tracking-[-0.04em]">
          {n} loves
        </motion.h2>
        <div className="relative mx-auto mt-8 flex h-[150px] max-w-md items-center justify-center sm:h-[180px]">
          {r.seeds.map((seed, k) => {
            const off = k - (n - 1) / 2;
            return (
              <motion.figure
                key={seed.id}
                className="absolute w-[88px] sm:w-[108px]"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 120, rotate: 0, x: 0 }}
                animate={{ opacity: 1, y: Math.abs(off) * 8, rotate: off * 7, x: off * (n > 4 ? 56 : 66) }}
                transition={{ duration: reduce ? 0.3 : 0.8, delay: reduce ? 0 : 0.45 + k * 0.09, ease: EASE }}
                style={{ zIndex: 10 - Math.abs(Math.round(off)) }}
              >
                <Duo
                  src={seed.image ? proxied(seed.image) : undefined}
                  a={k % 2 ? moon.a : sun.a}
                  b={k % 2 ? moon.b : sun.b}
                  className="aspect-[3/4] rounded-xl shadow-[0_18px_40px_-12px_rgb(0_0_0/0.8)] ring-1 ring-white/15"
                />
              </motion.figure>
            );
          })}
        </div>
        <motion.p {...rise(reduce, 1.0, 10)} className="mx-auto mt-6 max-w-md text-[13px] leading-relaxed text-ink-2">
          {r.seeds.map((x, k) => (
            <span key={x.id}>
              {k > 0 && <span className="text-ink-3"> · </span>}
              {x.name}
              <span className="ml-1 font-mono text-[9.5px] uppercase text-ink-3">{KIND_LABEL[x.kind] ?? x.kind}</span>
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
    render: (reduce) => (
      <div>
        <Eyebrow color={sun.a}>☀ your sun · main aesthetic</Eyebrow>
        <motion.p {...rise(reduce, 0.05)} className="font-serif text-[clamp(26px,6.6vw,38px)] italic leading-tight text-ink-2">
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
                <span className="block font-display text-[clamp(26px,8vw,48px)] font-semibold leading-[1.02] tracking-[-0.02em] text-ink">{w}</span>
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
    const oddNames = odd.map((x) => x.name).join(" + ");
    beats.push({
      key: "except",
      dur: DUR + 600,
      tint: [`color-mix(in oklab, ${moon.a} 55%, transparent)`, "color-mix(in oklab, #fb7185 35%, transparent)"],
      render: (reduce) => (
        <div className="text-center">
          <Eyebrow color="var(--bad)">the plot twist</Eyebrow>
          <motion.h2 {...rise(reduce, 0.05)} className="font-serif text-[clamp(48px,14vw,96px)] italic leading-[0.95]">
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
          <motion.p {...rise(reduce, 1.2, 10)} className="mt-6 font-display text-[clamp(20px,5.4vw,28px)] font-semibold leading-tight">
            {oddNames}
          </motion.p>
          {ov && (
            <motion.div {...rise(reduce, 1.6, 8)} className="mx-auto mt-4 max-w-xs space-y-2 text-left font-mono text-[11px] text-ink-2">
              <OverlapBar label={`${odd[0]?.name.split(" ").slice(0, 3).join(" ")} ↔ the rest`} value={ov.odd} color="var(--bad)" reduce={reduce} delay={1.8} />
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
      render: (reduce) => (
        <div>
          <Eyebrow color={moon.a}>☾ your moon · the hidden side</Eyebrow>
          <motion.p {...rise(reduce, 0.05)} className="font-serif text-[clamp(24px,6.2vw,36px)] italic leading-tight text-ink-2">
            So we didn&apos;t average it away. {oddNames.split(" ").length > 4 ? "It" : oddNames} gets its own side:
          </motion.p>
          <motion.div {...rise(reduce, 0.5, 40)} className="mt-6">
            <Big t={moon} size="clamp(56px,17vw,120px)">
              {moon.name}
            </Big>
          </motion.div>
          <motion.p {...rise(reduce, 0.9, 12)} className="mt-3 font-display text-[clamp(18px,5vw,26px)] text-ink-2">
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
      render: (reduce) => (
        <div>
          <Eyebrow color={moon.a}>☾ your moon · the hidden side</Eyebrow>
          <motion.p {...rise(reduce, 0.05)} className="font-serif text-[clamp(24px,6.2vw,36px)] italic leading-tight text-ink-2">
            Underneath it, a quieter thread:
          </motion.p>
          <motion.div {...rise(reduce, 0.45, 40)} className="mt-6">
            <Big t={moon} size="clamp(56px,17vw,120px)">
              {moon.name}
            </Big>
          </motion.div>
          {rest.length > 0 && (
            <motion.p {...rise(reduce, 0.9, 12)} className="mt-4 font-display text-[clamp(18px,5vw,26px)] text-ink-2">
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
      render: (reduce) => (
        <div>
          <Eyebrow color="var(--bad)">the self-critique</Eyebrow>
          <motion.h2 {...rise(reduce, 0.05)} className="font-display text-[clamp(38px,11vw,72px)] font-bold leading-[0.95] tracking-[-0.03em]">
            We threw <span className="font-serif font-normal italic">these</span> out.
          </motion.h2>
          <ul className="mt-7 space-y-4">
            {shown.map((rj, k) => (
              <motion.li key={rj.entity.id} {...rise(reduce, 0.4 + k * 0.28, 14)}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="relative font-display text-[clamp(22px,6.4vw,32px)] font-semibold leading-tight text-ink-2">
                    {rj.entity.name}
                    <motion.span
                      className={s.strike}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: reduce ? 0 : 0.45, delay: reduce ? 0 : 0.85 + k * 0.28, ease: EASE }}
                    />
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-3">{rj.affinity.toFixed(2)}</span>
                </div>
                <p className="mt-0.5 font-mono text-[10.5px] leading-snug text-ink-3">{rj.reason}</p>
              </motion.li>
            ))}
          </ul>
          <motion.p {...rise(reduce, 0.6 + shown.length * 0.28, 6)} className="mt-6 font-serif text-[19px] italic text-ink-2">
            {kept} kept, {r.rejected.length} rejected. One-seed flukes don&apos;t count.
          </motion.p>
        </div>
      ),
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
    render: (reduce) => (
      <div>
        <Eyebrow color={rising.a}>↑ your rising · how you come across</Eyebrow>
        <motion.p {...rise(reduce, 0.05)} className="font-serif text-[clamp(24px,6.2vw,36px)] italic leading-tight text-ink-2">
          To everyone else, you read as
        </motion.p>
        <motion.div {...rise(reduce, 0.4, 40)} className="mt-5">
          <Big t={rising} size="clamp(56px,17vw,120px)">
            {rising.name}
          </Big>
        </motion.div>
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
              {b.entity.name}
              <span className="ml-1.5 font-mono text-[10px] text-ink-3">{b.affinity.toFixed(2)}</span>
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
    render: (reduce) => (
      <div className="text-center">
        <Eyebrow>{card.rarity === "secret" || card.rarity === "holo" ? "this one's rare" : "fresh off the press"}</Eyebrow>
        <motion.p {...rise(reduce, 0.05)} className="font-serif text-[clamp(30px,8vw,48px)] italic leading-tight text-ink-2">
          Sun, Moon, Rising.
        </motion.p>
        <motion.h2 {...rise(reduce, 0.35)} className="mt-2 font-display text-[clamp(40px,12vw,84px)] font-bold leading-[0.95] tracking-[-0.03em]">
          Your sign has been <Big t={sun} size="1em">minted.</Big>
        </motion.h2>
        <motion.div {...rise(reduce, 0.9, 10)} className="mt-8 flex justify-center gap-3 text-[13px] text-ink-2">
          {[
            ["☀", sun],
            ["☾", moon],
            ["↑", rising],
          ].map(([g, t]) => (
            <span key={(t as CardType).name + g} className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full" style={{ background: `linear-gradient(135deg, ${(t as CardType).a}, ${(t as CardType).b})` }} />
              {g as string} {(t as CardType).name}
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
