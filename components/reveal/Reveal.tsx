"use client";

import { AnimatePresence, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildCard } from "@/lib/card";
import type { StyleResult, TraceEvent } from "@/lib/types";
import { Pack } from "./Pack";
import { Reading } from "./Reading";
import { Story } from "./Story";
import type { SeedHint } from "./traceModel";
import s from "./reveal.module.css";

export type { SeedHint } from "./traceModel";

export interface RevealProps {
  /** Straight from useAgentRun(). */
  events: TraceEvent[];
  result: StyleResult | null;
  running: boolean;
  error: string | null;
  /** Go to the results page. */
  onDone: () => void;
  /** Shown on the error card. */
  onRetry?: () => void;
  /** Back to the landing page (offered next to retry when the run fails). */
  onBack?: () => void;
  /** Optional: the seeds the user picked (with images), so the constellation is populated before Qloo resolves them. */
  seeds?: SeedHint[];
  /** Dev/lab: jump straight to a phase once the result is in. */
  startAt?: "story" | "pack";
}

type Phase = "reading" | "story" | "pack";

/**
 * The reveal: live "reading your taste" scene → Wrapped-style story → booster pack opening.
 * Fullscreen fixed overlay (z-60). Everything shown is read from the real agent trace and result.
 */
export function Reveal({ events, result, running, error, onDone, onRetry, onBack, seeds, startAt }: RevealProps) {
  const reduce = Boolean(useReducedMotion());
  const [phase, setPhase] = useState<Phase>(() => (result && !running && events.length === 0 ? "story" : "reading"));

  // Pace the trace: a cached replay arrives in one burst, so release it one event at a time.
  // Live runs are slower than the pace, so they show in real time.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown > events.length) {
      setShown(0);
      setPhase("reading");
      return;
    }
    if (shown === events.length) return;
    const backlog = events.length - shown;
    const t = setTimeout(() => setShown((x) => x + 1), backlog > 12 ? 150 : 230);
    return () => clearTimeout(t);
  }, [shown, events.length]);

  const done = Boolean(result) && !running && shown >= events.length;
  useEffect(() => {
    if (phase !== "reading") return;
    if (startAt && result && !running) return setPhase(startAt);
    if (!done) return;
    const t = setTimeout(() => setPhase("story"), reduce ? 900 : 2000);
    return () => clearTimeout(t);
  }, [done, phase, reduce, startAt, result, running]);

  // Wall clock while reading.
  const t0 = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (running && !t0.current) t0.current = performance.now();
    if (!running && !t0.current) return;
    if (done || error) return;
    const id = setInterval(() => setElapsed(performance.now() - t0.current), 100);
    return () => clearInterval(id);
  }, [running, done, error]);
  useEffect(() => {
    if (running && events.length === 0) t0.current = performance.now();
  }, [running, events.length]);

  // Lock page scroll under the overlay.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const card = useMemo(() => (result ? buildCard(result) : null), [result]);
  const visible = useMemo(() => events.slice(0, shown), [events, shown]);
  const vars = card
    ? ({ "--a": card.bigThree.sun.a, "--b": card.bigThree.sun.b, "--m": card.bigThree.moon.a } as React.CSSProperties)
    : undefined;

  return (
    <div className={s.stage} style={vars} role="dialog" aria-modal="true" aria-label="Your taste sign">
      {phase === "reading" && (
        <>
          <div className={s.orb} style={{ width: "60vmax", height: "60vmax", left: "-28vmax", top: "-30vmax", background: "color-mix(in oklab, var(--a) 30%, transparent)" }} />
          <div className={s.orb} style={{ width: "55vmax", height: "55vmax", right: "-28vmax", bottom: "-30vmax", background: "color-mix(in oklab, var(--m) 22%, transparent)" }} />
        </>
      )}
      <AnimatePresence mode="wait">
        {phase === "reading" && (
          <Reading
            key="reading"
            events={visible}
            seeds={seeds}
            done={done}
            error={error}
            elapsed={elapsed}
            totalMs={result?.stats.ms}
            cachedRun={result?.cached}
            reduce={reduce}
            onRetry={onRetry}
            onSkip={result && !running ? () => setPhase("story") : undefined}
          />
        )}
        {phase === "story" && result && card && <Story key="story" result={result} card={card} reduce={reduce} onFinish={() => setPhase("pack")} />}
        {phase === "pack" && card && result && <Pack key="pack" card={card} loves={result.seeds.length} reduce={reduce} onDone={onDone} />}
      </AnimatePresence>
      {error && onBack && phase === "reading" && (
        <button
          onClick={onBack}
          className="absolute left-[8.25rem] top-[0.95rem] z-30 rounded-full border border-line bg-paper-2/90 px-3 py-1 font-mono text-[11px] text-ink-2 backdrop-blur hover:text-ink sm:left-[10rem] sm:top-[1.5rem]"
        >
          &larr; back
        </button>
      )}
      <div className={s.vignette} />
      <div className={s.grain} />
    </div>
  );
}
