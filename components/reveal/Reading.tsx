"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { shortSeed } from "@/lib/grounding";
import type { SceneData, TraceEvent } from "@/lib/types";
import { Orrery } from "./Orrery";
import { Sky } from "./Sky";
import { buildScene, foldBeats, KIND_LABEL, pullShares, type FeedRow, type Folded, type SceneModel, type SeedHint, type SeedNode, type ToolEvent } from "./traceModel";
import s from "./reveal.module.css";

const EASE = [0.2, 0.7, 0.2, 1] as const;

/** How long each beat holds the stage. A finished run (or a replay) plays the backlog fast instead. */
const DWELL: Record<SceneData["kind"], number> = { seeds: 1000, tags: 1700, brands: 1600, ablation: 1150, critique: 1900, bridges: 1300 };

/**
 * Plays streamed scene data one beat at a time, so a burst (prefetched steps, parallel calls, a cached replay)
 * still reads as a sequence. Once the run is done and every beat has played, the well collapses and `settled` fires.
 */
function useBeats(beats: SceneData[], done: boolean, reduce: boolean, onSettled?: () => void) {
  const [applied, setApplied] = useState(0);
  const [collapsing, setCollapsing] = useState(false);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  const beatsRef = useRef(beats);
  beatsRef.current = beats;
  const lastAt = useRef(0);
  const n = beats.length;
  useEffect(() => {
    if (applied < n) {
      const prev = beatsRef.current[applied - 1];
      // The critique is the payoff (bet result, noun lock, flukes flung), so it keeps its hold even on a fast finish.
      const hold = !prev ? 0 : done ? (prev.kind === "critique" ? 1600 : 300) : DWELL[prev.kind];
      // Measured from the previous beat, so new trace events arriving mid-hold don't restart the clock.
      const wait = Math.max(0, (reduce ? Math.min(hold, 400) : hold) - (performance.now() - lastAt.current));
      const t = setTimeout(() => {
        lastAt.current = performance.now();
        setApplied((x) => x + 1);
      }, wait);
      return () => clearTimeout(t);
    }
    if (!done) return;
    if (!n) {
      settledRef.current?.(); // a replay recorded before scene data existed: nothing to play
      return;
    }
    if (!collapsing) {
      const t = setTimeout(() => setCollapsing(true), reduce ? 600 : 1800);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => settledRef.current?.(), reduce ? 200 : 1000);
    return () => clearTimeout(t);
  }, [applied, n, done, reduce, collapsing]);
  return { applied, collapsing };
}

/**
 * Phase 1: "reading your taste". A constellation of the user's loves with the agent's live Qloo
 * calls lighting it up, plus an inspectable trace feed. Honest by construction: every label is
 * a real trace event, every lit line is a real call's signal entities.
 */
export function Reading({
  events,
  seeds: hints,
  done,
  error,
  elapsed,
  totalMs,
  cachedRun,
  reduce,
  onRetry,
  onSkip,
  finalName,
  onSettled,
}: {
  events: TraceEvent[];
  seeds?: SeedHint[];
  done: boolean;
  error: string | null;
  elapsed: number;
  totalMs?: number;
  cachedRun?: boolean;
  reduce: boolean;
  onRetry?: () => void;
  onSkip?: () => void;
  /** The sign's name once the result is in; the slot plate locks its noun to it. */
  finalName?: string;
  /** The Gravity Well has played every beat and collapsed: safe to move on. */
  onSettled?: () => void;
}) {
  const m = useMemo(() => buildScene(events, hints), [events, hints]);
  const { applied, collapsing } = useBeats(m.beats, done, reduce, onSettled);
  const beatsRef = useRef(m.beats);
  beatsRef.current = m.beats;
  const f = useMemo(() => foldBeats(beatsRef.current.slice(0, applied)), [applied]);
  const [bet, setBet] = useState<string>();
  // The well from the first frame of a live run; the old constellation only for replays recorded before scene data existed.
  const well = m.beats.length > 0 || (!done && !error);
  const pickable = f.seeds.length > 1 && !f.critique && !bet && !done && !error;
  // Until Qloo resolves them, your loves show as unlit placeholder stars (names you typed, no ids, no bets).
  const shownF = useMemo(
    () => (f.seeds.length ? f : { ...f, seeds: m.seeds.filter((x) => x.name).map((x, i) => ({ id: `pending-${i}`, name: x.name, kind: x.kind ?? "" })) }),
    [f, m.seeds],
  );
  const wellRef = useRef<HTMLDivElement>(null);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: reduce ? 1 : 1.04, filter: reduce ? "none" : "blur(8px)" }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      {well && <Sky f={shownF} anchor={wellRef} reduce={reduce} travel={!done && !error} pulse={applied} />}
      <header className="relative z-10 flex items-center justify-between px-5 pt-4 sm:px-8 sm:pt-6">
        <span className="font-display text-[15px] font-semibold tracking-tight">
          Tastrology<span className="text-accent">.</span>
        </span>
        <span className="flex items-center gap-2 font-mono text-[11px] tracking-wide text-ink-3">
          {error ? (
            <span className="h-1.5 w-1.5 rounded-full bg-bad" />
          ) : done ? (
            <span className="h-1.5 w-1.5 rounded-full bg-good" />
          ) : (
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
          )}
          {error ? "STOPPED" : done ? "DONE" : "LIVE"} · {((done && totalMs ? totalMs : elapsed) / 1000).toFixed(1)}s
          {done && cachedRun ? " · replay" : ""}
          {onSkip && !error && (
            <button
              onClick={onSkip}
              className="ml-2 rounded-full border border-line bg-paper-2/80 px-3 py-1 font-mono text-[11px] text-ink-2 backdrop-blur hover:text-ink"
            >
              skip ›
            </button>
          )}
        </span>
      </header>

      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col items-center justify-center px-5 pb-16 pt-2 sm:px-8">
        <div className="flex flex-col items-center">
          <p className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.28em] text-ink-3">reading your taste</p>
          {well ? (
            <>
              <div ref={wellRef}>
                <Orrery
                  f={shownF}
                  collapsing={collapsing}
                  reduce={reduce}
                  bet={bet}
                  pickable={pickable}
                  onPick={setBet}
                  center={<Core calls={m.calls} done={done} reduce={reduce} />}
                />
              </div>
              <BetLine f={f} bet={bet} pickable={pickable} />
              <SignSlots f={f} finalName={done ? finalName : undefined} reduce={reduce} />
              <Headline m={m} done={done} error={error} small />
            </>
          ) : (
            <>
              <Constellation m={m} done={done || Boolean(error)} reduce={reduce} />
              <Headline m={m} done={done} error={error} />
              <Words m={m} />
            </>
          )}
        </div>
      </div>
      <UnderTheHood m={m} running={!done && !error} reduce={reduce} />

      {error && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center p-5">
          <div className="w-full max-w-md rounded-2xl border border-bad/40 bg-bad-soft/90 p-4 backdrop-blur">
            <p className="text-sm font-medium text-bad">The agent hit a wall</p>
            <p className="mt-1 text-[13px] text-ink-2">{error}</p>
            {onRetry && (
              <button onClick={onRetry} className="mt-3 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper">
                Try again
              </button>
            )}
          </div>
        </div>
      )}

    </motion.div>
  );
}

/* ------------------------------------------------------------------ constellation */

function useTicker(on: boolean, ms: number) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setT((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [on, ms]);
  return t;
}

/** Which seeds the current tool call is touching, and which one a leave-one-out call has removed. */
function useActivity(active: ToolEvent | undefined, seeds: SeedNode[], done: boolean) {
  const cycling = Boolean(active && !done && (active.name === "ablate_seeds" || active.name === "get_tags"));
  const t = useTicker(cycling, 520);
  if (!active || done) return { lit: new Set<string>(), out: undefined as string | undefined, note: "" };
  const ids = (i: number) => (active.calls[i]?.params["signal.interests.entities"] ?? "").split(",").filter(Boolean);
  if (active.name === "ablate_seeds" && active.calls.length) {
    const i = t % active.calls.length;
    const inCall = new Set(ids(i));
    const out = seeds.find((x) => x.id && !inCall.has(x.id) && !x.odd)?.id;
    return { lit: inCall, out, note: `leave-one-out ${i + 1}/${active.calls.length}` };
  }
  if (active.name === "get_tags" && active.calls.length) {
    const i = t % active.calls.length;
    return { lit: new Set(ids(i)), out: undefined, note: `${active.calls[i].count} tags` };
  }
  const lit = new Set<string>();
  active.calls.forEach((_, i) => ids(i).forEach((x) => lit.add(x)));
  return { lit, out: undefined, note: "" };
}

function Constellation({ m, done, reduce }: { m: SceneModel; done: boolean; reduce: boolean }) {
  const n = Math.max(1, m.seeds.length);
  const { lit, out, note } = useActivity(m.active, m.seeds, done);
  const pos = m.seeds.map((seed, i) => {
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = seed.odd ? 45 : 35;
    return { x: 50 + Math.cos(ang) * r, y: 50 + Math.sin(ang) * r };
  });

  return (
    <div className="relative aspect-square w-[min(82vw,34vh,440px)] lg:w-[min(46vw,58vh,480px)]">
      {/* scan + rings */}
      <div className="absolute inset-[6%] rounded-full border border-line/70" />
      <div className="absolute inset-[16%] rounded-full border border-dashed border-line/60" />
      {!done && !reduce && <div className={`${s.scan} inset-[6%]`} />}

      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        {/* polygon between seeds that agree */}
        {pos.map((p, i) => {
          const j = (i + 1) % pos.length;
          if (pos.length < 3) return null;
          const a = m.seeds[i];
          const b = m.seeds[j];
          const agree = a.read && b.read && !a.odd && !b.odd;
          return (
            <line
              key={`e${i}`}
              x1={p.x}
              y1={p.y}
              x2={pos[j].x}
              y2={pos[j].y}
              stroke={agree ? "var(--ink-3)" : "var(--line)"}
              strokeWidth={0.25}
              strokeDasharray={a.odd || b.odd ? "1 1.6" : undefined}
              style={{ transition: "stroke .6s" }}
            />
          );
        })}
        {pos.map((p, i) => {
          const seed = m.seeds[i];
          const on = seed.id ? lit.has(seed.id) : false;
          const isOut = Boolean(seed.id) && seed.id === out;
          const color = seed.odd ? "var(--m)" : on ? "var(--accent)" : seed.read ? "var(--ink-3)" : "var(--line)";
          return (
            <line
              key={`s${i}`}
              x1={p.x}
              y1={p.y}
              x2={50}
              y2={50}
              stroke={color}
              strokeWidth={on ? 0.7 : 0.35}
              opacity={isOut ? 0.12 : 1}
              strokeDasharray={seed.odd ? "1.2 1.8" : undefined}
              className={on && !reduce ? s.flow : undefined}
              style={{ transition: "stroke .4s, opacity .3s, stroke-width .3s" }}
            />
          );
        })}
      </svg>

      {/* core: live call counter */}
      <div className="absolute left-1/2 top-1/2 h-[34%] w-[34%] -translate-x-1/2 -translate-y-1/2">
        <Core calls={m.calls} done={done} reduce={reduce} />
      </div>

      {/* seed nodes */}
      {m.seeds.map((seed, i) => {
        const on = seed.id ? lit.has(seed.id) : false;
        const isOut = Boolean(seed.id) && seed.id === out;
        return (
          <motion.div
            key={i}
            className="absolute w-[19%] -translate-x-1/2 -translate-y-1/2"
            initial={reduce ? { opacity: 0, left: `${pos[i].x}%`, top: `${pos[i].y}%` } : { opacity: 0, scale: 0.4, left: `${pos[i].x}%`, top: `${pos[i].y}%` }}
            animate={{ opacity: isOut ? 0.35 : 1, scale: on && !reduce ? 1.08 : 1, left: `${pos[i].x}%`, top: `${pos[i].y}%` }}
            transition={{ duration: 0.5, ease: EASE, delay: reduce ? 0 : i * 0.06 }}
          >
            <SeedOrb seed={seed} on={on} />
            <div className="pointer-events-none absolute left-1/2 top-full mt-1 w-[150%] -translate-x-1/2 text-center">
              <p className="truncate text-[10px] font-medium leading-tight text-ink-2 sm:text-[11px]">{seed.name || "…"}</p>
              <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-ink-3">
                {isOut ? <span className="text-warn">removed</span> : seed.odd ? <span style={{ color: "var(--m)" }}>side B</span> : (KIND_LABEL[seed.kind ?? ""] ?? seed.kind ?? "")}
              </p>
            </div>
          </motion.div>
        );
      })}

      {note && (
        <motion.span
          key={note.split(" ")[0]}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute left-1/2 top-[63%] -translate-x-1/2 whitespace-nowrap rounded-full bg-paper-2/90 px-2 py-0.5 font-mono text-[9px] text-ink-2"
        >
          {note}
        </motion.span>
      )}
    </div>
  );
}

/** Live Qloo call counter at the centre of the scene. Fills its parent. */
function Core({ calls, done, reduce }: { calls: number; done: boolean; reduce: boolean }) {
  return (
    <div className="absolute inset-0">
      <motion.div
        className={`${s.core} absolute inset-0 rounded-full`}
        animate={done ? { scale: [1, 1.18, 1], opacity: 1 } : { scale: 1, opacity: 0.9 }}
        transition={{ duration: 0.8, ease: EASE }}
        style={{ boxShadow: "0 0 60px -10px var(--a)" }}
      />
      <div className="absolute inset-[5%] grid place-items-center rounded-full bg-paper/95 text-center [container-type:inline-size]">
        <div>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.b
              key={calls}
              className="block font-display text-[clamp(20px,34cqi,46px)] font-bold leading-none tabular-nums"
              initial={reduce ? { opacity: 0 } : { y: 14, opacity: 0, filter: "blur(4px)" }}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              exit={reduce ? { opacity: 0 } : { y: -14, opacity: 0, filter: "blur(4px)" }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              {calls}
            </motion.b>
          </AnimatePresence>
          <span className="mt-1 block font-mono text-[8px] uppercase tracking-[0.2em] text-ink-3 sm:text-[9px]">Qloo calls</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ bet + sign slots */

/** "Which love steers your taste?" Tap a star; the leave-one-out numbers settle the bet. */
function BetLine({ f, bet, pickable }: { f: Folded; bet?: string; pickable: boolean }) {
  const name = (id?: string) => f.seeds.find((x) => x.id === id)?.name ?? "";
  let text: React.ReactNode = null;
  let key = "none";
  if (f.critique) {
    const { shares, top } = pullShares(f);
    const p = top ? Math.round((shares[top] ?? 0) * 100) : 0;
    const pct = p > 0 ? <b className="font-semibold text-accent">{p}%</b> : null;
    key = "result";
    text = !top ? null : bet === top ? (
      <>
        Called it. <b className="font-semibold text-ink">{name(top)}</b> carries {pct ?? "most"} of your brand pull.
      </>
    ) : bet ? (
      <>
        You said {name(bet)}. Qloo says <b className="font-semibold text-ink">{name(top)}</b>
        {pct ? <>: {pct} of the pull.</> : "."}
      </>
    ) : (
      <>
        <b className="font-semibold text-ink">{name(top)}</b> steers it{pct ? <>: {pct} of your brand pull.</> : "."}
      </>
    );
  } else if (bet) {
    key = "bet";
    text = (
      <>
        Your bet: <b className="font-semibold text-accent">{name(bet)}</b>. Qloo is pulling each love out to check.
      </>
    );
  } else if (pickable) {
    key = "ask";
    text = (
      <>
        Which love steers your taste? <span className="text-accent">Tap one.</span>
      </>
    );
  }
  return (
    <div className="mt-1 flex min-h-[2.6em] max-w-md items-center justify-center text-center" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        {text && (
          <motion.p
            key={key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="text-balance text-[13.5px] leading-snug text-ink-2"
          >
            {text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * THE ______ WHO ______. The noun reel spins only through your own loves, drops the quiet ones once the
 * critique lands, and locks on the strongest (then on the sign's real noun). The verb stays blank for the pack.
 */
function SignSlots({ f, finalName, reduce }: { f: Folded; finalName?: string; reduce: boolean }) {
  const inert = new Set(f.critique?.inert ?? []);
  const reel = [...new Set(f.seeds.filter((x) => !inert.has(x.id)).map((x) => shortSeed(x.name)))];
  const struck = f.seeds.filter((x) => inert.has(x.id)).map((x) => shortSeed(x.name));
  const finalNoun = finalName?.match(/^The\s+(.+?)\s+Who\s/)?.[1];
  const strongest = f.critique ? pullShares(f).top : undefined;
  const locked = finalNoun ?? (strongest ? shortSeed(f.seeds.find((x) => x.id === strongest)?.name ?? "") : undefined);
  const speed = f.ablated.length ? 330 : f.brands.length ? 240 : 160;
  const [i, setI] = useState(0);
  const spinning = !locked && reel.length > 1 && !reduce;
  useEffect(() => {
    if (!spinning) return;
    const t = setInterval(() => setI((x) => x + 1), speed);
    return () => clearInterval(t);
  }, [spinning, speed]);
  if (!f.seeds.length) return null;
  const noun = locked || (reduce ? "" : reel[i % Math.max(1, reel.length)]);
  return (
    <div className="mt-1 flex flex-col items-center">
      <div className="flex max-w-full items-baseline gap-2 rounded-xl border border-line/80 bg-paper-2/60 px-4 py-2 font-display text-[clamp(15px,4.2vw,22px)] font-semibold tracking-tight backdrop-blur">
        <span className="text-ink-3">THE</span>
        <span className="relative inline-flex min-w-[5.5em] justify-center overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={noun || "blank"}
              initial={reduce ? { opacity: 0 } : { y: "-100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { y: "100%", opacity: 0 }}
              transition={{ duration: locked ? 0.45 : speed / 1000, ease: EASE }}
              className={`truncate font-serif font-normal italic ${locked ? "text-accent" : "text-ink-2"}`}
            >
              {noun || "______"}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="text-ink-3">WHO</span>
        <span className="pulse-dot font-mono text-ink-3">______</span>
      </div>
      <p className="mt-1 h-4 font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-3">
        {locked ? (
          "the rest is in the pack"
        ) : struck.length ? (
          <>
            struck: <s>{struck.join(", ")}</s>
          </>
        ) : (
          "narrowing it down"
        )}
      </p>
    </div>
  );
}

function SeedOrb({ seed, on }: { seed: SeedNode; on: boolean }) {
  const [broken, setBroken] = useState(false);
  const ring = seed.odd ? "var(--m)" : on ? "var(--accent)" : seed.read ? "rgb(255 255 255 / .35)" : "var(--line)";
  return (
    <div
      className="relative aspect-square rounded-full p-[3px] transition-shadow duration-300"
      style={{ background: ring, boxShadow: on ? "0 0 24px -2px var(--accent)" : seed.odd ? "0 0 26px -4px var(--m)" : "none" }}
    >
      <div
        className={`${s.duo} h-full w-full rounded-full`}
        style={seed.odd ? ({ "--da": "var(--m)", "--db": "#2a0f2a" } as React.CSSProperties) : undefined}
      >
        {seed.image && !broken && (
          <motion.img
            src={seed.image}
            alt=""
            onError={() => setBroken(true)}
            initial={{ opacity: 0, scale: 1.3 }}
            animate={{ opacity: 0.95, scale: 1 }}
            transition={{ duration: 1.1, ease: EASE }}
          />
        )}
        {(!seed.image || broken) && (
          <span className="absolute inset-0 z-10 grid place-items-center font-serif text-[clamp(16px,5vw,26px)] italic text-paper/80">
            {seed.name ? seed.name[0] : <span className="pulse-dot">·</span>}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ headline + words */

function Headline({ m, done, error, small }: { m: SceneModel; done: boolean; error: string | null; small?: boolean }) {
  const text = error ? "Something broke mid-read" : done ? "Your taste sign is ready" : m.headline;
  return (
    <div
      className={
        small
          ? "mt-2 flex min-h-[2.4em] w-full max-w-xl items-start justify-center text-center [&_h2]:text-[clamp(13px,3.4vw,16px)] [&_h2]:font-medium [&_h2]:text-ink-2"
          : "mt-8 flex min-h-[3.6em] w-full max-w-xl items-start justify-center text-center lg:mt-10"
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.h2
          key={text}
          initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
          transition={{ duration: 0.4, ease: EASE }}
          className="text-balance font-display text-[clamp(19px,4.6vw,28px)] font-semibold leading-[1.15] tracking-tight"
        >
          {done ? (
            <>
              Your taste sign is <span className="font-serif font-normal italic text-accent">ready</span>
            </>
          ) : (
            <>
              {text}
              {!error && <span className="pulse-dot text-accent">…</span>}
            </>
          )}
        </motion.h2>
      </AnimatePresence>
    </div>
  );
}

function Words({ m }: { m: SceneModel }) {
  const words = m.words.slice(-6);
  const tone = {
    tag: "border-accent/40 text-accent",
    brand: "border-line text-ink-2",
    side: "border-[color:var(--m)]/50 text-[color:var(--m)]",
    bridge: "border-line text-ink-3",
  };
  return (
    <ul className="mt-2 flex min-h-7 max-w-xl flex-wrap justify-center gap-1.5">
      <AnimatePresence initial={false}>
        {words.map((w) => (
          <motion.li
            key={w.text}
            layout
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.35, ease: EASE }}
            className={`rounded-full border px-2.5 py-0.5 text-[11.5px] ${tone[w.tone]}`}
            style={w.tone === "side" ? { borderColor: "color-mix(in oklab, var(--m) 50%, transparent)", color: "var(--m)" } : undefined}
          >
            {w.text}
            {w.sub && <span className="ml-1 font-mono text-[9.5px] opacity-60">{w.sub}</span>}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

/* ------------------------------------------------------------------ feed */

/**
 * The agent trace, tucked away: a small pill shows it's live (calls, current step). Opening it slides the full
 * dashboard in (a right panel on desktop, a bottom sheet on phones) for anyone who wants to see the work.
 */
function UnderTheHood({ m, running, reduce }: { m: SceneModel; running: boolean; reduce: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const spring = reduce ? { duration: 0.2 } : { type: "spring" as const, stiffness: 320, damping: 32 };
  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            key="pill"
            type="button"
            onClick={() => setOpen(true)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={spring}
            aria-expanded={false}
            className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-line/80 bg-paper-2/80 py-2 pl-3.5 pr-3 font-mono text-[11px] text-ink-2 backdrop-blur-md transition-colors hover:border-ink-3 hover:text-ink lg:left-auto lg:right-6 lg:translate-x-0"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${running ? "pulse-dot bg-accent" : "bg-good"}`} />
            <span className="uppercase tracking-[0.16em]">Under the hood</span>
            <span className="tabular-nums text-ink-3">{m.calls} Qloo calls</span>
            <span aria-hidden className="text-ink-3">▴</span>
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="scrim"
              className="absolute inset-0 z-30 bg-black/40 lg:bg-transparent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              key="drawer"
              role="dialog"
              aria-label="Agent trace"
              className="absolute inset-x-2 bottom-2 z-40 flex h-[62%] flex-col lg:inset-x-auto lg:bottom-6 lg:right-6 lg:top-20 lg:h-auto lg:w-[420px]"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, x: 0 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 40 }}
              transition={spring}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute -top-3 right-3 z-10 rounded-full border border-line bg-paper-2 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-2 hover:text-ink"
              >
                close ▾
              </button>
              <Feed m={m} running={running} className="h-full flex-1" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function Feed({ m, running, className = "" }: { m: SceneModel; running: boolean; className?: string }) {
  const box = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [m.rows.length, m.rows]);

  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line/80 bg-card/85 backdrop-blur-md ${className}`}
      aria-label="Agent trace"
      aria-live="polite"
    >
      <header className="flex items-center justify-between gap-3 border-b border-line/80 px-4 py-2.5">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className={`h-1.5 w-1.5 rounded-full ${running ? "pulse-dot bg-accent" : "bg-good"}`} />
          <h3 className="text-[12.5px] font-semibold tracking-tight">Agent trace</h3>
          {m.planner && <span className="hidden rounded bg-paper-2 px-1.5 py-px font-mono text-[9px] text-ink-3 sm:inline">LLM planner</span>}
        </div>
        <span className="whitespace-nowrap font-mono text-[10.5px] tabular-nums text-ink-3">
          {m.calls} Qloo call{m.calls === 1 ? "" : "s"}
          {m.cached ? ` · ${m.cached} cached` : ""}
        </span>
      </header>
      <ol
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className={`${s.feed} min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3`}
      >
        {m.rows.length === 0 && <li className="px-2 py-1 font-mono text-[11px] text-ink-3">{running ? "connecting to the agent…" : "no trace events"}</li>}
        <AnimatePresence initial={false}>
          {m.rows.map((r) => (
            <motion.li
              key={r.key}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <Row r={r} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
}

function Row({ r }: { r: FeedRow }) {
  const [open, setOpen] = useState(false);
  if (r.kind === "thought")
    return <p className="ml-5 border-l border-line py-0.5 pl-2.5 font-serif text-[13px] italic leading-snug text-ink-3">{r.text}</p>;
  if (r.kind === "step") {
    const dot =
      r.status === "run" ? (
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
      ) : r.status === "warn" ? (
        <span className="text-[9px] font-bold text-warn">!</span>
      ) : (
        <span className="text-[9px] font-bold text-good">✓</span>
      );
    return (
      <div className="flex items-start gap-2 px-1 py-1">
        <span className={`mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full ${r.status === "warn" ? "bg-warn-soft" : r.status === "done" ? "bg-good-soft" : "bg-accent-soft"}`}>
          {dot}
        </span>
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium leading-snug text-ink">{r.label}</p>
          {r.detail && <p className="truncate text-[11px] text-ink-3">{r.detail}</p>}
        </div>
      </div>
    );
  }
  const e = r.e;
  const ms = e.calls.reduce((t, c) => t + c.ms, 0);
  const cached = e.calls.every((c) => c.cached);
  return (
    <div className="ml-5">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left hover:bg-paper-2/80"
        aria-expanded={open}
      >
        <code className="shrink-0 rounded bg-ink px-1.5 py-px font-mono text-[10px] text-paper">{e.name}</code>
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink-2">{e.summary}</span>
        <span className="shrink-0 font-mono text-[9.5px] text-ink-3">
          {e.calls.length}× {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div className="mb-1 ml-1.5 space-y-1 border-l border-line pl-2.5">
          <p className="font-mono text-[10px] text-ink-3">
            {e.args} · {cached ? "cached" : `${ms}ms`}
          </p>
          {e.calls.map((c, i) => (
            <div key={i} className="rounded-md bg-paper-2/80 px-2 py-1 font-mono text-[9.5px] leading-relaxed text-ink-3">
              <span className="text-accent">GET</span> <span className="text-ink-2">{c.endpoint}</span> → {c.count} results{" "}
              {c.cached ? <span className="text-ink-3">· cached</span> : <span>· {c.ms}ms</span>}
              <div className="break-all">
                {Object.entries(c.params)
                  .map(([k, v]) => `${k}=${v.length > 60 ? `${v.slice(0, 60)}…` : v}`)
                  .join("  ")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
