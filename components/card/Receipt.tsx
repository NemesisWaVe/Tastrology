"use client";

import { motion, useAnimationControls, useInView, useReducedMotion, type Variants } from "motion/react";
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { TWIN_HOST, cardCode, displayName, twinPath, type CardData } from "@/lib/card";
import type { BrandMatch, StyleResult } from "@/lib/types";

/*
 * The thermal receipt: one rendering shared by the share export (compact, static) and the results page
 * (animated "printing", expandable brand lines). Every line is a field from the run, nothing invented.
 */

export const KIND: Record<string, string> = { artist: "music", movie: "film", tv_show: "tv", book: "book", place: "place", podcast: "pod", videogame: "game" };
const PAPER = "#f3f0e8";
const INK = "#151418";
const MONO = "var(--nf-mono), ui-monospace, Menlo, monospace";
const zigB = "conic-gradient(from -45deg at bottom, transparent, #000 1deg 89deg, transparent 90deg) 50% / 12px 100%";
const zigT = "conic-gradient(from 135deg at top, transparent, #000 1deg 89deg, transparent 90deg) 50% / 12px 100%";
const aff = (a: number) => `.${String(Math.round(a * 100)).padStart(2, "0")}`;

/** Deterministic bars from the card's own machine-readable line. */
export function barcode(seed: string): string {
  const stops: string[] = [];
  let x = 0;
  for (let i = 0; i < seed.length && x < 250; i++) {
    const c = seed.charCodeAt(i);
    const w = 1 + (c % 3);
    const gap = 1 + ((c >> 2) % 3);
    stops.push(`${INK} ${x}px ${x + w}px`, `transparent ${x + w}px ${x + w + gap}px`);
    x += w + gap;
  }
  return `linear-gradient(90deg, ${stops.join(", ")}, transparent ${x}px)`;
}

/* ------------------------------------------------------------------ line-by-line printing */

const Live = createContext(false);
const printLine: Variants = {
  hidden: { opacity: 0, clipPath: "inset(0 0 100% 0)" },
  show: { opacity: 1, clipPath: "inset(0 0 0% 0)", transition: { duration: 0.14, ease: "linear" } },
};

/** One printed line. On the live page it is fed out of the printer in sequence; static in exports. */
function L({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const live = useContext(Live);
  return live ? (
    <motion.div variants={printLine} className={className} style={style}>
      {children}
    </motion.div>
  ) : (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

function Row({ l, r, strong }: { l: ReactNode; r: string; strong?: boolean }) {
  return (
    <span className={`flex items-baseline gap-1.5 ${strong ? "font-bold" : ""}`}>
      <span className="min-w-0 truncate">{l}</span>
      <span className="min-w-[10px] flex-1 border-b border-dotted border-black/35" />
      <span className="shrink-0 tabular-nums">{r}</span>
    </span>
  );
}
const Rule = () => <L className="my-2 border-t border-dashed border-black/40">{null}</L>;

/* ------------------------------------------------------------------ paper */

/** Thermal paper: zigzag torn edges, a faint fibre texture, and (on the page) a slight curl and lift. */
export function ReceiptPaper({ children, curl = false, className = "", style }: { children: ReactNode; curl?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={className}
      style={{
        filter: "drop-shadow(0 24px 30px rgba(0,0,0,0.7))",
        ...(curl ? { transform: "rotate(-0.7deg)" } : null),
        ...style,
      }}
    >
      <div style={{ WebkitMask: zigT, mask: zigT, paddingTop: 6, background: `linear-gradient(${PAPER} 0 12px, transparent 12px)` }}>
        <div
          className="relative"
          style={{
            WebkitMask: zigB,
            mask: zigB,
            paddingBottom: 20,
            color: INK,
            background: curl
              ? `linear-gradient(90deg, rgb(0 0 0 / .09), transparent 7%, transparent 90%, rgb(0 0 0 / .12)),
                 linear-gradient(180deg, rgb(255 255 255 / .5), transparent 6%, transparent 94%, rgb(0 0 0 / .06)),
                 repeating-linear-gradient(0deg, rgb(0 0 0 / .018) 0 1px, transparent 1px 3px),
                 ${PAPER}`
              : PAPER,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ body */

export function ReceiptBody({ card, result, compact = false, stagger = true, faded = false }: { card: CardData; result: StyleResult; compact?: boolean; stagger?: boolean; faded?: boolean }) {
  const reduce = useReducedMotion();
  const live = !compact && !reduce && stagger;
  const [open, setOpen] = useState<string | null>(null);
  const brands = result.brands.filter((x) => !x.side).slice(0, compact ? 5 : 8);
  const loves = result.seeds.slice(0, compact ? 6 : 8);
  const voids = result.rejected.slice(0, compact ? 2 : 6);
  const seedName = (id: string) => displayName(result.seeds.find((s) => s.id === id)?.name ?? "");
  const via = (b: BrandMatch) => b.because.slice(0, 2).map(seedName).filter(Boolean).join(" + ");
  const code = cardCode(card);
  const d = new Date(result.createdAt || Date.now());
  const date = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  const { sun, moon, rising, moonIsContradiction } = card.bigThree;

  const body = (
    <>
      <L className={`text-center font-bold tracking-[0.18em] ${compact ? "text-[19px]" : "text-[22px]"}`}>{BRAND.name}</L>
      <L className="text-center text-[0.9em] tracking-[0.1em]">· {BRAND.poweredBy} ·</L>
      <L className="mt-1.5 flex justify-between text-[0.9em]">
        <span>order #{card.serial}</span>
        <span>{BRAND.cardSet}</span>
        <span>{date}</span>
      </L>
      <Rule />
      <L className="mb-0.5 font-bold">loves</L>
      {loves.map((s, i) => (
        <L key={s.id}>
          <Row l={`${i + 1}. ${displayName(s.name)}`} r={KIND[s.kind] ?? s.kind} />
        </L>
      ))}
      <Rule />
      <L className="mb-0.5 flex justify-between font-bold">
        <span>brands{compact ? "" : " · tap a line for the why"}</span>
        <span>affinity</span>
      </L>
      {brands.map((b) =>
        compact ? (
          <L key={b.entity.id}>
            <Row l={displayName(b.entity.name)} r={aff(b.affinity)} />
            {via(b) && <span className="block truncate pl-3 text-[0.85em] opacity-70">via {via(b)}</span>}
          </L>
        ) : (
          <L key={b.entity.id}>
            <button
              type="button"
              aria-expanded={open === b.entity.id}
              onClick={() => setOpen(open === b.entity.id ? null : b.entity.id)}
              className="-mx-1.5 block w-[calc(100%+12px)] rounded px-1.5 py-[1px] text-left uppercase transition-colors hover:bg-black/[0.05] focus-visible:outline focus-visible:outline-1 focus-visible:outline-black/50"
            >
              <Row l={`${open === b.entity.id ? "−" : "+"} ${displayName(b.entity.name)}`} r={aff(b.affinity)} />
              {via(b) && <span className="block truncate pl-3.5 text-[0.85em] opacity-70">via {via(b)}</span>}
            </button>
            {open === b.entity.id && <Why b={b} seedName={seedName} />}
          </L>
        ),
      )}
      <Rule />
      <L>
        <Row l={`sun ${sun.name}`} r="core" />
      </L>
      <L>
        <Row l={`moon ${moon.name}`} r={moonIsContradiction ? "split" : "hidden"} />
      </L>
      <L>
        <Row l={`rising ${rising.name}`} r="read" />
      </L>
      {voids.length > 0 && (
        <>
          <Rule />
          <L className="mb-0.5 font-bold">voided by the critic</L>
          {voids.map((v) => (
            <L key={v.entity.id}>
              <Row
                l={
                  <>
                    void <s className="decoration-[1.5px]">{displayName(v.entity.name)}</s>
                  </>
                }
                r={`-${aff(v.affinity)}`}
              />
              {!compact && <span className="block pl-3 text-[0.85em] normal-case opacity-70">{v.reason}</span>}
            </L>
          ))}
        </>
      )}
      <Rule />
      <L className={compact ? "text-[14px]" : "text-[16px]"}>
        <Row l="total taste" r={String(card.power)} strong />
      </L>
      <L>
        <Row l={card.rarityLabel} r={`${card.domains} domain${card.domains === 1 ? "" : "s"}`} />
      </L>
      <L className="mt-3 h-[34px]" style={{ background: barcode(card.mrz.join("")) }}>
        {null}
      </L>
      <L className="mt-1.5 flex items-baseline justify-between gap-2 text-[0.9em]">
        <span>verify</span>
        {compact ? (
          <span className="truncate font-bold">
            {TWIN_HOST}/c/{code}
          </span>
        ) : (
          <a href={twinPath(card)} className="truncate font-bold underline decoration-dotted underline-offset-2">
            {TWIN_HOST}/c/{code}
          </a>
        )}
      </L>
      <L className="mt-2 text-center text-[0.9em] tracking-[0.14em]">{BRAND.question}</L>
    </>
  );

  const cls = `pt-3 uppercase ${compact ? "px-5 text-[9.5px] leading-[1.45]" : "px-5 text-[11px] leading-[1.5] sm:px-7 sm:text-[11.5px]"}`;
  return (
    <Live.Provider value={live}>
      {live ? (
        <motion.div className={cls} style={{ fontFamily: MONO, ...(faded ? { color: "rgb(58 42 30 / 0.86)", textShadow: "0 0 0.4px rgb(58 42 30 / 0.5)" } : null) }} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.12 }} transition={{ staggerChildren: 0.045 }}>
          {body}
        </motion.div>
      ) : (
        <div className={cls} style={{ fontFamily: MONO, ...(faded ? { color: "rgb(58 42 30 / 0.86)", textShadow: "0 0 0.4px rgb(58 42 30 / 0.5)" } : null) }}>
          {body}
        </div>
      )}
    </Live.Provider>
  );
}

/** The expanded "why" for a brand line: the agent's reason, the seed drivers (Qloo explainability) and the source. */
function Why({ b, seedName }: { b: BrandMatch; seedName: (id: string) => string }) {
  const drivers = Object.entries(b.explain)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 4)
    .filter(([, v]) => v > 0);
  return (
    <div className="mb-1.5 mt-1 border-l-2 border-black/25 pl-2.5 text-[0.92em] normal-case leading-snug">
      {b.why && <p className="mb-1">{b.why}</p>}
      {drivers.length > 0 && (
        <p className="opacity-80">
          drivers:{" "}
          {drivers.map(([id, v], i) => (
            <span key={id}>
              {i > 0 && " · "}
              {seedName(id)} {Math.round(v * 100)}%
            </span>
          ))}
        </p>
      )}
      <p className="mt-0.5 opacity-60">
        source: Qloo insights · {b.category || "brand"} · affinity {aff(b.affinity)}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ the register */

/**
 * A small thermal register drawn in CSS: brand plate, status LED, paper slot. When it scrolls into view the
 * paper feeds out of the slot in short stepper-motor jerks (one text line per step, with a hitch every few),
 * then the cutter snaps the zigzag edge and the receipt settles into a soft hanging curl.
 * Reduced motion: the receipt is simply there, complete.
 */
export function ReceiptPrinter({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { once: true, amount: 0.25 });
  const [h, setH] = useState<number | null>(0);
  const [done, setDone] = useState(false);
  const snap = useAnimationControls();
  const body = useAnimationControls();

  useEffect(() => {
    if (reduce) {
      setH(null);
      setDone(true);
      return;
    }
    if (!inView) return;
    let shown = 0;
    let n = 0;
    let t: ReturnType<typeof setTimeout>;
    const step = () => {
      const full = paper.current?.scrollHeight ?? 0;
      shown = Math.min(full, shown + 17); // one line per motor step
      setH(shown);
      body.start({ y: [0, 0.8, 0], transition: { duration: 0.05 } });
      n++;
      if (shown >= full) {
        // the cutter: a tiny snap, then hand the height back to the layout
        setTimeout(() => {
          setH(null);
          setDone(true);
          snap.start({ y: [0, 5, -1, 0], rotate: [0, 0.6, -0.9, -0.7], transition: { duration: 0.45, ease: "easeOut" } });
          body.start({ x: [0, -1.5, 1, 0], transition: { duration: 0.18 } });
        }, 220);
        return;
      }
      t = setTimeout(step, n % 5 === 0 ? 150 : 46); // stepper rhythm: short jerks, a hitch every few lines
    };
    t = setTimeout(step, 350);
    return () => clearTimeout(t);
  }, [inView, reduce, snap, body]);

  const printing = inView && !done;
  return (
    <div ref={box} className="relative mx-auto w-full max-w-[420px]">
      {/* register */}
      <motion.div animate={body} className="relative z-10 mx-[-10px] rounded-[18px] px-4 pb-3 pt-3 sm:mx-[-16px]" style={{ background: "linear-gradient(180deg, #34343c, #1d1d23 55%, #141418)", boxShadow: "0 18px 40px -16px rgb(0 0 0 / .9), inset 0 1px 0 rgb(255 255 255 / .12), inset 0 -2px 0 rgb(0 0 0 / .5)" }}>
        <div className="flex items-center justify-between">
          <span className="rounded-[5px] px-2 py-[3px] font-mono text-[10px] font-bold tracking-[0.28em] text-[#d9d4c7]" style={{ background: "linear-gradient(180deg, #4a4a52, #2b2b31)", boxShadow: "inset 0 1px 0 rgb(255 255 255 / .18), 0 1px 2px rgb(0 0 0 / .6)" }}>
            TASTROLOGY
          </span>
          <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-white/45">
            {printing ? "printing" : done ? "ready" : "standby"}
            <motion.i
              className="block h-2 w-2 rounded-full"
              style={{ background: printing ? "#fbbf24" : "#a3e635", boxShadow: `0 0 8px ${printing ? "#fbbf24" : "#a3e635"}` }}
              animate={printing ? { opacity: [1, 0.25, 1] } : { opacity: 1 }}
              transition={printing ? { duration: 0.5, repeat: Infinity } : undefined}
            />
          </span>
        </div>
        {/* paper slot */}
        <div className="mt-3 h-[9px] rounded-full" style={{ background: "#050507", boxShadow: "inset 0 2px 3px rgb(0 0 0 / .9), 0 1px 0 rgb(255 255 255 / .08)" }} />
      </motion.div>
      {/* paper, fed out under the slot */}
      <motion.div animate={snap} className="relative z-0 -mt-[10px] mx-auto w-[94%]" style={{ transformOrigin: "50% 0" }}>
        <div style={{ height: h ?? "auto", overflow: h === null ? "visible" : "hidden" }}>
          <div ref={paper}>
            <ReceiptPaper curl={done} style={done ? undefined : { filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.6))" }}>
              {children}
            </ReceiptPaper>
          </div>
        </div>
        {/* shadow under the slot lip */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-5" style={{ background: "linear-gradient(rgb(0 0 0 / .45), transparent)" }} />
      </motion.div>
    </div>
  );
}
