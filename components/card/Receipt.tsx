"use client";

import { motion, useInView, useReducedMotion, type Variants } from "motion/react";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
function L({ children, className = "", style, kind }: { children: ReactNode; className?: string; style?: CSSProperties; kind?: "rule" | "brand" | "void" | "total" }) {
  const live = useContext(Live);
  return live ? (
    <motion.div variants={printLine} className={className} style={style}>
      {children}
    </motion.div>
  ) : (
    <div className={className} style={style} data-line="" data-kind={kind}>
      {children}
    </div>
  );
}

function Row({ l, r, strong }: { l: ReactNode; r: ReactNode; strong?: boolean }) {
  return (
    <span className={`flex items-baseline gap-1.5 ${strong ? "font-bold" : ""}`}>
      <span className="min-w-0 truncate">{l}</span>
      <span className="min-w-[10px] flex-1 border-b border-dotted border-black/35" />
      <span className="shrink-0 tabular-nums">{r}</span>
    </span>
  );
}
const Rule = () => (
  <L kind="rule" className="my-2 border-t border-dashed border-black/40">
    {null}
  </L>
);

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
          <L key={b.entity.id} kind="brand" className="rounded">
            <button
              type="button"
              aria-expanded={open === b.entity.id}
              onClick={() => setOpen(open === b.entity.id ? null : b.entity.id)}
              className="-mx-1.5 block w-[calc(100%+12px)] rounded px-1.5 py-[1px] text-left uppercase transition-colors hover:bg-black/[0.05] focus-visible:outline focus-visible:outline-1 focus-visible:outline-black/50"
            >
              <Row l={`${open === b.entity.id ? "−" : "+"} ${displayName(b.entity.name)}`} r={<span data-roll={Math.round(b.affinity * 100)}>{aff(b.affinity)}</span>} />
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
            <L key={v.entity.id} kind="void" className="relative">
              <Row
                l={
                  <>
                    void <s className="decoration-[1.5px]">{displayName(v.entity.name)}</s>
                  </>
                }
                r={`-${aff(v.affinity)}`}
              />
              {!compact && <span className="block pl-3 text-[0.85em] normal-case opacity-70">{v.reason}</span>}
              {!compact && (
                <span
                  data-stamp=""
                  aria-hidden
                  className="pointer-events-none absolute right-12 top-0 rotate-[-9deg] rounded-[3px] border-2 border-[#c4302b] px-1.5 text-[1.25em] font-black leading-tight tracking-[0.12em] text-[#c4302b] opacity-80 mix-blend-multiply"
                >
                  void
                </span>
              )}
            </L>
          ))}
        </>
      )}
      <Rule />
      <L kind="total" className={compact ? "text-[14px]" : "mb-3 origin-top scale-y-[1.7] text-[17px] font-black"}>
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
      {!compact && <CertStamp />}
    </>
  );

  const cls = `relative pt-3 uppercase ${compact ? "px-5 text-[9.5px] leading-[1.45]" : "px-5 text-[11px] leading-[1.5] sm:px-7 sm:text-[11.5px]"}`;
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

/** Round rubber stamp that thunks onto the paper once the total has printed. */
function CertStamp() {
  return (
    <svg data-cert="" aria-hidden viewBox="-50 -50 100 100" className="pointer-events-none absolute bottom-[22px] left-[44%] h-[96px] w-[96px] rotate-[-12deg] text-[#5b3fd1] opacity-80 mix-blend-multiply">
      <defs>
        <path id="certRing" d="M0-36a36 36 0 1 1 0 72a36 36 0 1 1 0-72" />
      </defs>
      <circle r="47" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle r="27" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text fill="currentColor" style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: 1 }}>
        <textPath href="#certRing" textLength="222" lengthAdjust="spacing">
          CERTIFIED TASTE · SEASON 01 ·
        </textPath>
      </text>
      <path d="M0-15 3.5-3.5 15 0 3.5 3.5 0 15-3.5 3.5-15 0-3.5-3.5Z" fill="currentColor" />
    </svg>
  );
}

/** Tiny synthesized register sounds (WebAudio, no files). Silent until the user turns sound on. */
function useRegisterSound() {
  const on = useRef(false);
  const ac = useRef<AudioContext | null>(null);
  const tone = (f: number, dur: number, type: OscillatorType, gain: number, to?: number) => {
    const a = ac.current;
    if (!on.current || !a) return;
    const o = a.createOscillator();
    const g = a.createGain();
    const t = a.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  return {
    enable(v: boolean) {
      on.current = v;
      if (v && !ac.current) ac.current = new AudioContext();
    },
    click: () => tone(2600, 0.012, "square", 0.02),
    whirr: (ms: number) => tone(150, ms / 1000, "sawtooth", 0.01, 190),
    beep: () => tone(1860, 0.08, "square", 0.022),
    thunk: () => tone(120, 0.2, "sine", 0.16, 42),
    cut: () => tone(900, 0.06, "sawtooth", 0.03, 300),
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * A small thermal register that performs the receipt: a print head writes each line (speed by length, carriage
 * snap back), brand lines ring up like a checkout (affinity rolls up, line flashes, LCD total ticks), voids get
 * a red rubber stamp, the total prints double-height, a CERTIFIED stamp thunks down, the cutter slices. Then the
 * receipt can be torn off along the perforation and drops flat. ~6-8s, "Skip" finishes instantly.
 * Reduced motion: the receipt is simply there, complete.
 */
export function ReceiptPrinter({ children, total }: { children: ReactNode; total: number }) {
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const win = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const reg = useRef<HTMLDivElement>(null);
  const lcd = useRef<HTMLSpanElement>(null);
  const blade = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { once: true, amount: 0.2 });
  const [phase, setPhase] = useState<"idle" | "printing" | "done" | "torn">("idle");
  const [sound, setSound] = useState(false);
  const sfx = useRegisterSound();
  const skip = useRef(false);
  const [pull, setPull] = useState(0);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const finishAll = () => {
    const p = paper.current;
    if (!p) return;
    p.querySelectorAll<HTMLElement>("[data-line],[data-stamp],[data-cert]").forEach((el) => {
      el.getAnimations().forEach((a) => a.cancel());
      el.style.clipPath = "";
      el.style.opacity = "";
    });
    p.querySelectorAll<HTMLElement>("[data-roll]").forEach((r) => (r.textContent = `.${pad2(Number(r.dataset.roll))}`));
    if (win.current) win.current.style.height = "";
    if (lcd.current) lcd.current.textContent = String(total);
    head.current?.getAnimations().forEach((a) => a.cancel());
  };

  // Hide every line before first paint; the show starts when the register scrolls into view.
  useLayoutEffect(() => {
    if (reduce) return;
    const p = paper.current;
    if (!p) return;
    p.querySelectorAll<HTMLElement>("[data-line]").forEach((l) => (l.style.clipPath = "inset(0 100% 0 0)"));
    p.querySelectorAll<HTMLElement>("[data-stamp],[data-cert]").forEach((el) => (el.style.opacity = "0"));
    if (win.current) win.current.style.height = "0px";
    if (lcd.current) lcd.current.textContent = "0";
  }, [reduce]);

  useEffect(() => {
    if (reduce) {
      setPhase("done");
      return;
    }
    if (!inView) return;
    let cancelled = false;
    let follow = true;
    const stop = () => (follow = false);
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("keydown", stop);
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, skip.current ? 0 : ms));
    const shake = (px = 2) =>
      reg.current?.animate([{ transform: "none" }, { transform: `translate(-${px}px, 1px)` }, { transform: `translate(${px}px, -1px)` }, { transform: "none" }], { duration: 170 });
    const thunk = (el: HTMLElement, rot: number, from = 2.3) => {
      el.style.opacity = "";
      el.animate(
        [
          { opacity: 0, transform: `rotate(${rot}deg) scale(${from})` },
          { opacity: 1, transform: `rotate(${rot}deg) scale(0.9)`, offset: 0.75 },
          { opacity: 1, transform: `rotate(${rot}deg) scale(1)` },
        ],
        { duration: 210, easing: "ease-in" },
      );
      sfx.thunk();
      shake();
    };

    (async () => {
      const p = paper.current;
      const w = win.current;
      const hd = head.current;
      const sl = slot.current;
      if (!p || !w || !hd || !sl) return;
      setPhase("printing");
      const lines = [...p.querySelectorAll<HTMLElement>("[data-line]")];
      const nBrands = Math.max(1, lines.filter((l) => l.dataset.kind === "brand").length);
      let rung = 0;
      await sleep(350);
      for (const l of lines) {
        if (cancelled) return;
        if (skip.current) break;
        const kind = l.dataset.kind;
        // feed: the paper pushes out by one line, the body nudges, the view follows the slot
        const nh = Math.ceil(l.getBoundingClientRect().bottom - p.getBoundingClientRect().top + 3);
        const prev = w.offsetHeight;
        if (nh > prev) {
          w.style.height = `${nh}px`;
          if (follow) window.scrollBy(0, nh - prev);
        }
        reg.current?.animate([{ transform: "translateY(1px)" }, { transform: "none" }], { duration: 70 });
        sfx.click();
        // write: the head sweeps, the text appears behind it, then darkens a beat later (thermal heat)
        const chars = (l.textContent ?? "").trim().length;
        const dur = kind === "rule" ? 45 : Math.max(55, Math.min(150, 30 + chars * 1.8));
        const travel = sl.clientWidth - hd.offsetWidth;
        hd.animate([{ transform: "translateX(0)" }, { transform: `translateX(${travel}px)` }], { duration: dur, easing: "linear", fill: "forwards" });
        const ca = l.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], { duration: dur, easing: "linear", fill: "forwards" });
        l.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 340, delay: dur * 0.45, fill: "backwards", easing: "ease-out" });
        sfx.whirr(dur);
        const roll = kind === "brand" ? l.querySelector<HTMLElement>("[data-roll]") : null;
        if (roll) {
          const to = Number(roll.dataset.roll);
          const t0 = performance.now();
          const tick = (now: number) => {
            const k = Math.min(1, (now - t0) / (dur + 160));
            roll.textContent = `.${pad2(Math.round(to * (1 - (1 - k) ** 3)))}`;
            if (k < 1 && !skip.current) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
        await sleep(dur);
        l.style.clipPath = "";
        ca.cancel();
        // carriage snap back
        hd.animate([{ transform: `translateX(${travel}px)` }, { transform: "translateX(0)" }], { duration: 70, easing: "cubic-bezier(.7,0,.2,1)", fill: "forwards" });
        if (kind === "brand") {
          rung++;
          l.animate([{ backgroundColor: "rgb(255 210 40 / .65)" }, { backgroundColor: "rgb(255 210 40 / 0)" }], { duration: 520, easing: "ease-out" });
          if (lcd.current) lcd.current.textContent = String(Math.round((total * rung) / nBrands));
          sfx.beep();
          await sleep(90);
        } else if (kind === "void") {
          const st = l.querySelector<HTMLElement>("[data-stamp]");
          if (st) thunk(st, -9);
          await sleep(140);
        } else if (kind === "total") {
          if (lcd.current) lcd.current.textContent = String(total);
          await sleep(220);
        } else await sleep(18);
      }
      if (cancelled) return;
      if (!skip.current) {
        const cert = p.querySelector<HTMLElement>("[data-cert]");
        await sleep(160);
        if (cert) thunk(cert, -12, 2.8);
        shake(3);
        await sleep(520);
        // the cutter
        blade.current?.animate([{ transform: "scaleX(0)", opacity: 1 }, { transform: "scaleX(1)", opacity: 1 }, { transform: "scaleX(1)", opacity: 0 }], { duration: 260, easing: "ease-in" });
        sfx.cut();
        w.style.height = `${p.offsetHeight}px`;
        await sleep(240);
      }
      finishAll();
      setPhase("done");
    })();
    return () => {
      cancelled = true;
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [inView, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  const torn = phase === "torn";
  const printing = phase === "printing";
  const tearDown = (e: React.PointerEvent) => {
    if (phase !== "done") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const tearMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    setPull(Math.min(1, dist / 80));
    if (dist > 80) {
      drag.current = null;
      setPull(0);
      sfx.cut();
      setPhase("torn");
    }
  };
  const tearUp = () => {
    drag.current = null;
    setPull(0);
  };

  return (
    <div ref={box} className="relative mx-auto w-full max-w-[420px]">
      {/* the paper: grows out of the slot below it, newest line at the slot */}
      <motion.div
        className="relative mx-auto w-[94%]"
        animate={torn ? { y: [0, -14, 0], rotate: 0 } : { y: pull * -6, rotate: phase === "done" ? -0.6 - pull * 1.2 : 0 }}
        transition={torn ? { duration: 0.5, ease: "easeOut" } : { type: "spring", stiffness: 400, damping: 30 }}
        style={{ transformOrigin: "50% 100%" }}
      >
        <div ref={win} className="relative" style={{ overflow: phase === "done" || torn ? "visible" : "hidden" }}>
          <div ref={paper}>
            <ReceiptPaper curl={phase === "done" || torn} style={torn ? { transform: "none", filter: "drop-shadow(0 10px 16px rgba(0,0,0,0.45))" } : undefined}>
              {children}
            </ReceiptPaper>
          </div>
          {/* curl over the lip while it feeds */}
          {!torn && phase !== "done" && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-4" style={{ background: "linear-gradient(transparent, rgb(0 0 0 / .35))" }} />}
        </div>
      </motion.div>

      {/* the register */}
      <motion.div
        animate={torn ? { opacity: 0, y: 30, height: 0, marginTop: 0 } : { opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
        className="relative z-10 -mt-[6px] overflow-hidden"
        aria-hidden={torn}
      >
        <div ref={reg} className="mx-[-8px] rounded-[16px] px-3.5 pb-3 pt-2.5 sm:mx-[-16px]" style={{ background: "linear-gradient(180deg, #3a3a42, #1e1e24 50%, #141418)", boxShadow: "0 18px 40px -16px rgb(0 0 0 / .9), inset 0 1px 0 rgb(255 255 255 / .14), inset 0 -2px 0 rgb(0 0 0 / .5)" }}>
          {/* slot + print head + cutter */}
          <div ref={slot} className="relative h-[10px] rounded-full" style={{ background: "#050507", boxShadow: "inset 0 2px 3px rgb(0 0 0 / .95), 0 1px 0 rgb(255 255 255 / .08)" }}>
            <div ref={head} className="absolute -top-[3px] left-0 h-[16px] w-[22px] rounded-[3px]" style={{ background: "linear-gradient(180deg, #d8d8de, #8b8b94)", boxShadow: printing ? "0 0 10px 2px rgb(255 140 60 / .55), inset 0 -2px 0 rgb(0 0 0 / .35)" : "inset 0 -2px 0 rgb(0 0 0 / .35)" }} />
            <div ref={blade} className="absolute inset-x-0 top-1/2 h-[2px] origin-left bg-white opacity-0" style={{ boxShadow: "0 0 8px 2px #fff" }} />
          </div>
          {/* perforation: drag to tear off */}
          {phase === "done" && (
            <div
              onPointerDown={tearDown}
              onPointerMove={tearMove}
              onPointerUp={tearUp}
              onPointerCancel={tearUp}
              className="mt-1.5 flex cursor-grab touch-none select-none items-center justify-center gap-2 rounded-md py-1 font-mono text-[9.5px] uppercase tracking-[0.2em] text-white/55 hover:text-white/80"
              style={{ backgroundImage: "linear-gradient(90deg, rgb(255 255 255 / .25) 50%, transparent 50%)", backgroundSize: "8px 1px", backgroundRepeat: "repeat-x", backgroundPosition: "0 0" }}
            >
              ✂ drag to tear off
            </div>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="rounded-[5px] px-2 py-[3px] font-mono text-[10px] font-bold tracking-[0.28em] text-[#d9d4c7]" style={{ background: "linear-gradient(180deg, #4a4a52, #2b2b31)", boxShadow: "inset 0 1px 0 rgb(255 255 255 / .18), 0 1px 2px rgb(0 0 0 / .6)" }}>
              TASTROLOGY
            </span>
            {/* LCD running total */}
            <span className="flex items-baseline gap-1.5 rounded-[4px] px-2 py-[2px] font-mono text-[#1c2a12]" style={{ background: "linear-gradient(180deg, #b7c79a, #9db07c)", boxShadow: "inset 0 1px 3px rgb(0 0 0 / .45)" }}>
              <span className="text-[8px] tracking-[0.16em]">TOTAL</span>
              <span ref={lcd} className="min-w-[2ch] text-right text-[15px] font-bold leading-none tabular-nums" style={{ fontFamily: '"Doto", var(--nf-mono), monospace' }}>
                {total}
              </span>
            </span>
            <span className="flex items-center gap-2">
              {printing && (
                <button type="button" onClick={() => (skip.current = true)} className="rounded-full border border-white/20 px-2 py-[2px] font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/70 hover:text-white">
                  skip
                </button>
              )}
              <button
                type="button"
                aria-pressed={sound}
                aria-label={sound ? "Mute printer sounds" : "Play printer sounds"}
                onClick={() => {
                  sfx.enable(!sound);
                  setSound(!sound);
                }}
                className="grid h-6 w-6 place-items-center rounded-full text-[12px] text-white/70 hover:bg-white/10"
              >
                {sound ? "🔊" : "🔇"}
              </button>
              <motion.i
                className="block h-2 w-2 rounded-full"
                style={{ background: printing ? "#fbbf24" : "#a3e635", boxShadow: `0 0 8px ${printing ? "#fbbf24" : "#a3e635"}` }}
                animate={printing ? { opacity: [1, 0.25, 1] } : { opacity: 1 }}
                transition={printing ? { duration: 0.5, repeat: Infinity } : undefined}
              />
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
