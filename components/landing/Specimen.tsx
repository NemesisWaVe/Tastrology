"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { HoloCard } from "@/components/card/HoloCard";
import type { CardData, CardType } from "@/lib/card";
import type { Persona } from "@/lib/personas";
import type { TraceEvent } from "@/lib/types";
import { EASE } from "./primitives";
import { lookOf } from "./personaStyle";
import s from "./landing.module.css";

function useCardWidth() {
  const [w, setW] = useState(340);
  useEffect(() => {
    const f = () => setW(window.innerWidth <= 360 ? 220 : window.innerWidth <= 480 ? 240 : window.innerWidth < 640 ? 280 : window.innerWidth < 1280 ? 320 : 350);
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return w;
}

/* Where the "evolves from" seeds orbit the card (desktop only). */
const ORBIT: React.CSSProperties[] = [
  { right: "calc(100% - 8px)", top: "14%" },
  { left: "calc(100% - 8px)", top: "30%" },
  { right: "calc(100% - 10px)", top: "58%" },
  { left: "calc(100% - 10px)", top: "74%" },
  { right: "calc(100% - 40px)", top: "90%" },
];

export function Specimen({
  card,
  runId,
  events,
  error,
  running,
  archived,
  personas,
  active,
  onSwap,
}: {
  card: CardData | null;
  runId?: string;
  events: TraceEvent[];
  error: string | null;
  running: boolean;
  archived?: boolean;
  personas: Persona[];
  active: string;
  onSwap: (key: string) => void;
}) {
  const width = useCardWidth();
  const reduce = useReducedMotion();
  const sun = card?.bigThree.sun;
  const moon = card?.bigThree.moon;
  const rising = card?.bigThree.rising;
  const halo = {
    "--ha": sun?.a ?? "#7894ff",
    "--hb": moon?.a ?? "#d875ff",
    "--hc": rising?.a ?? "#83fff7",
  } as React.CSSProperties;

  return (
    <div className="flex flex-col items-center">
      <div className="mb-5 flex items-center gap-2 font-mono max-[480px]:mb-3 text-[10px] uppercase tracking-[0.24em] text-ink-3">
        <span className={`h-1.5 w-1.5 rounded-full ${card ? "bg-accent" : "bg-warn pulse-dot"}`} />
        {card ? (archived ? "Archived specimen · read from Qloo" : "Live specimen · minted from Qloo") : "Minting specimen"}
        {card && running && <span className="text-ink-2"> · re-reading…</span>}
      </div>

      <div className="relative" style={{ width, ...halo }}>
        <div className={s.halo} aria-hidden />

        <AnimatePresence mode="wait" initial={false}>
          {card ? (
            <motion.div
              key={runId ?? "card"}
              initial={reduce ? { opacity: 0 } : { opacity: 0, rotateY: -80, scale: 0.92 }}
              animate={{ opacity: 1, rotateY: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, rotateY: 80, scale: 0.92 }}
              transition={{ duration: 0.75, ease: EASE }}
              style={{ transformPerspective: 1200 }}
            >
              <HoloCard card={card} width={width} idle />
            </motion.div>
          ) : (
            <motion.div key="ph" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.4 }}>
              <Placeholder width={width} events={events} error={error} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Orbiting seeds: what this card evolved from. */}
        {card && (
          <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden>
            {card.evolvesFrom.slice(0, ORBIT.length).map((e, i) => (
              <motion.div
                key={`${runId}-${e.name}`}
                className="absolute"
                style={ORBIT[i]}
                initial={{ opacity: 0, scale: 0.8, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.09, duration: 0.7, ease: EASE }}
              >
                <div>
                  <div className="flex max-w-[190px] items-center gap-2 rounded-full border border-white/10 py-1 pl-1 pr-3 bg-paper/90 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)]">
                    {e.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.image} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover grayscale-[0.3]" />
                    ) : (
                      <span className="h-6 w-6 shrink-0 rounded-full bg-paper-2" />
                    )}
                    <span className="min-w-0">
                      <span className="block font-mono text-[8.5px] uppercase leading-none tracking-[0.18em] text-ink-3">{e.kind}</span>
                      <span className="block truncate text-[12px] leading-tight text-ink">{e.name.replace(/\s*\(.*\)$/, "")}</span>
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Big Three */}
      <div className="mt-8 grid w-full max-w-[420px] grid-cols-3 gap-2 max-[480px]:hidden">
        <BigThreeCell label="Sun" sym="☉" t={sun} hint="main aesthetic" />
        <BigThreeCell label="Moon" sym="☽" t={moon} hint={card?.bigThree.moonIsContradiction ? "contradiction" : "hidden side"} flag={card?.bigThree.moonIsContradiction} />
        <BigThreeCell label="Rising" sym="↑" t={rising} hint="how you read" />
      </div>

      {/* Specimen switcher */}
      <div className="mt-5 flex items-center gap-3 max-[480px]:hidden">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3">Shuffle</span>
        <div className="flex gap-1.5 rounded-full border border-line bg-white/[0.02] p-1">
          {personas.map((p) => {
            const look = lookOf(p);
            const on = p.key === active;
            return (
              <button
                key={p.key}
                onClick={() => onSwap(p.key)}
                aria-label={`Show ${p.name}`}
                aria-pressed={on}
                className={`grid h-8 w-8 place-items-center rounded-full text-sm transition ${on ? "text-paper" : "text-ink-2 hover:bg-white/5 hover:text-ink"}`}
                style={on ? { background: `linear-gradient(135deg, ${look.a}, ${look.b})` } : undefined}
              >
                {look.glyph}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BigThreeCell({ label, sym, t, hint, flag }: { label: string; sym: string; t?: CardType; hint: string; flag?: boolean }) {
  return (
    <div className="relative min-w-0 rounded-2xl border border-line bg-white/[0.02] px-2.5 py-2.5 sm:px-3">
      <div className="flex items-center gap-1.5">
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] text-paper"
          style={{ background: t ? `linear-gradient(135deg, ${t.a}, ${t.b})` : "var(--line)" }}
        >
          {sym}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-3">{label}</span>
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={t?.name ?? "none"}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="mt-1.5 truncate font-serif text-[17px] italic leading-none text-ink"
          title={t?.name}
        >
          {t ? t.name : <span className="inline-block h-3.5 w-16 rounded shimmer align-middle" />}
        </motion.p>
      </AnimatePresence>
      <p className={`mt-1 truncate font-mono text-[8px] uppercase tracking-[0.08em] sm:text-[9px] sm:tracking-[0.14em] ${flag ? "text-accent" : "text-ink-3"}`}>{hint}</p>
    </div>
  );
}

function Placeholder({ width, events, error }: { width: number; events: TraceEvent[]; error: string | null }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const t = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const calls = events.reduce((n, e) => n + (e.type === "tool" ? e.calls.length : 0), 0);
  const lines = events
    .map((e) => (e.type === "step" ? e.label : e.type === "tool" ? e.summary : null))
    .filter((x): x is string => Boolean(x))
    .slice(-4);
  return (
    <div className={s.ph} style={{ width }}>
      <div className={s.phInner}>
        <div className="flex h-full flex-col justify-between p-[7cqw]">
          <div className="flex items-center justify-between font-mono text-[3.2cqw] uppercase tracking-[0.2em] text-ink-3">
            <span>Set 01</span>
            <span className="tabular-nums">{calls ? `${calls} Qloo calls` : `${secs}s`}</span>
          </div>
          <div className="grid place-items-center">
            <div className="relative grid h-[34cqw] w-[34cqw] place-items-center">
              <motion.div
                className="absolute inset-0 rounded-full border border-dashed border-white/20"
                animate={{ rotate: 360 }}
                transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
              />
              <div className="absolute inset-[16%] rounded-full bg-[radial-gradient(circle,rgba(198,255,61,0.18),transparent_70%)]" />
              <span className={`${s.holoText} font-serif text-[16cqw] italic leading-none`}>✧</span>
            </div>
            <p className="mt-[5cqw] font-display text-[6.5cqw] font-semibold tracking-tight text-ink">{error ? "Qloo is slow right now" : "Building this card live"}</p>
            <p className="mt-1 font-serif text-[4.6cqw] italic text-ink-3">{error ? "trying once more; yours still works below" : "from a stranger's favorites"}</p>
          </div>
          <div className="mb-[3cqw] h-[0.8cqw] overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={{ width: "4%" }}
              animate={{ width: `${Math.min(92, 4 + secs * 4.4 + calls * 1.5)}%` }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            />
          </div>
          <ul className="space-y-[1.6cqw] font-mono text-[3cqw] leading-snug text-ink-3" aria-live="polite">
            {(lines.length ? lines : ["Sending the picks to the agent", "Looking them up in Qloo"]).map((l, i, arr) => (
              <li key={`${i}-${l}`} className={`flex gap-2 truncate ${i === arr.length - 1 ? "text-ink-2" : ""}`}>
                <span className="text-accent">›</span>
                <span className="truncate">{l}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
