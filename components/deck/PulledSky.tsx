"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ScratchReveal } from "@/components/deck/ScratchReveal";
import { displayName, proxied } from "@/lib/card";
import type { Snap, SnapBrand } from "@/lib/receipt";
import { sfx } from "@/lib/sound";

const img = (u?: string) =>
  u ? (u.startsWith("/") ? u : proxied(u)) : undefined;

/** Brands decoded on this device, per card: a signal stays decoded, and new ones (fresh weeks) arrive sealed. */
const key = (code: string) => `tastrology:decoded:${code}`;
export function readDecoded(code: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(code)) ?? "[]");
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}
export function writeDecoded(code: string, ids: string[]) {
  try {
    localStorage.setItem(key(code), JSON.stringify(ids.slice(-200)));
  } catch {}
}

const rand = (i: number, n: number, a: number, b: number, c: number) =>
  Math.round(((((Math.sin(i * a + n * b) * c) % 1) + 1) % 1) * 1000) / 1000;

/** Fixed star dust, so the sky reads as space without a canvas or an animation loop. */
const DUST = Array.from({ length: 60 }, (_, i) => {
  const r = (n: number) => rand(i, n, 12.9898, 78.233, 43758.5453);
  return {
    x: r(1) * 120 - 10,
    y: r(2) * 100,
    s: r(3) < 0.15 ? 2 : 1,
    o: 0.2 + r(4) * 0.55,
  };
});
/** Where the other loves hang, as far stars: out to the sides so they never sit under the focus. */
const FAR = Array.from({ length: 12 }, (_, i) => {
  const r = (n: number) => rand(i, n, 3.17, 41.9, 9137.31);
  return { x: i % 2 === 0 ? 5 + r(1) * 16 : 79 + r(1) * 16, y: 34 + r(2) * 34 };
});

/** The star sits here; its signals hang on the lower arc of an ellipse around it. */
const STAR = { x: 50, y: 30 };
const ARC = { rx: 38, ry: 24, from: 14, to: 166, dy: 16 };

/**
 * The brands as a sky (docs/design/brand-return-ui.md), one love at a time: full bleed, no frame, the sheet's header
 * floating on it. The chosen love is the one bright star, the others hang far off, and the brands it pulled in sit on
 * an arc below it as sealed signals. Tap one and it's scratched open on a plate in the sky. Pick another love from the
 * rail at the bottom, or swipe.
 */
export function PulledSky({
  header,
  loves,
  sel,
  onSel,
  pulled,
  decoded,
  onDecode,
  onScratched,
}: {
  header: ReactNode;
  loves: Snap["loves"];
  sel: string;
  onSel: (id: string) => void;
  pulled: SnapBrand[];
  decoded: Set<string>;
  onDecode: (b: SnapBrand) => void;
  onScratched: (b: SnapBrand) => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const idx = Math.max(
    0,
    loves.findIndex((l) => l.id === sel),
  );
  const at = loves[idx];
  const prev = useRef(idx);
  const dir = idx >= prev.current ? 1 : -1;
  useEffect(() => {
    prev.current = idx;
  }, [idx]);
  const [stage, setStage] = useState<SnapBrand | null>(null);
  const [auto, setAuto] = useState(0);
  useEffect(() => setStage(null), [sel]);
  const left = pulled.filter((b) => !decoded.has(b.id)).length;

  const go = (i: number) => {
    const l = loves[(i + loves.length) % loves.length];
    if (!l || l.id === sel) return;
    sfx("tick", { i });
    onSel(l.id);
  };
  const tap = (b: SnapBrand) => {
    if (decoded.has(b.id)) return onDecode(b);
    if (stage) return;
    sfx("tick", { i: 3 });
    setStage(b);
  };

  // Swipe between loves on touch screens.
  const swipe = useRef<number | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const r = rail.current;
    const b = r?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (r && b)
      r.scrollTo({
        left: b.offsetLeft - r.clientWidth / 2 + b.offsetWidth / 2,
        behavior: reduce ? "auto" : "smooth",
      });
  }, [sel, reduce]);

  return (
    <div
      className="relative -mx-5 -mt-5 h-[clamp(420px,62svh,520px)] touch-pan-y select-none overflow-clip sm:-mx-8"
      style={{
        background:
          "radial-gradient(90% 70% at 50% 28%, #17112b 0%, #0b0a14 55%, var(--card,#0d0d12) 100%)",
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse") swipe.current = e.clientX;
      }}
      onPointerUp={(e) => {
        const x0 = swipe.current;
        swipe.current = null;
        if (x0 == null || stage) return;
        const dx = e.clientX - x0;
        if (Math.abs(dx) >= 48) go(idx + (dx < 0 ? 1 : -1));
      }}
    >
      {/* far dust drifts a little the other way as you travel */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          transform: `translateX(${-(idx - (loves.length - 1) / 2) * 2.5}%)`,
          transition: reduce
            ? "none"
            : "transform 1100ms cubic-bezier(.2,.7,.2,1)",
        }}
      >
        {DUST.map((d, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              left: `${d.x}%`,
              top: `${d.y}%`,
              width: d.s,
              height: d.s,
              opacity: d.o,
            }}
          />
        ))}
      </div>
      {/* the other loves, far off: slots shift as the focus moves, so the sky rearranges with each trip */}
      {loves.map((l, i) =>
        i === idx ? null : (
          <span
            key={l.id}
            aria-hidden
            className="absolute h-[3px] w-[3px] rounded-full bg-[#e9f0ff] transition-[left,top] duration-1000"
            style={{
              left: `${FAR[(i - idx + loves.length) % FAR.length].x}%`,
              top: `${FAR[(i - idx + loves.length) % FAR.length].y}%`,
              boxShadow: "0 0 8px 1px rgb(233 240 255 / .4)",
            }}
          />
        ),
      )}
      {/* nebula behind the chosen love */}
      <span
        aria-hidden
        className="pointer-events-none absolute h-[80%] w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-3xl"
        style={{
          left: `${STAR.x}%`,
          top: `${STAR.y + 18}%`,
          background:
            "radial-gradient(circle, rgb(198 255 61 / .14), rgb(140 90 255 / .12) 45%, transparent 70%)",
        }}
      />

      <div className="absolute inset-x-5 top-5 z-30 sm:inset-x-8">{header}</div>

      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.div
          key={at?.id}
          className="absolute inset-0 z-10"
          custom={dir}
          variants={{
            in: (d: number) =>
              reduce ? { opacity: 0 } : { opacity: 0, x: `${d * 30}%` },
            on: { opacity: 1, x: "0%" },
            out: (d: number) =>
              reduce ? { opacity: 0 } : { opacity: 0, x: `${-d * 30}%` },
          }}
          initial="in"
          animate="on"
          exit="out"
          transition={{
            duration: reduce ? 0.2 : 0.42,
            ease: [0.2, 0.7, 0.2, 1],
          }}
        >
          {/* the chosen love */}
          <div
            className="absolute w-[80%] -translate-x-1/2 text-center"
            style={{ left: `${STAR.x}%`, top: `${STAR.y}%` }}
          >
            <span
              aria-hidden
              className="mx-auto -mt-[7px] block h-3.5 w-3.5 rounded-full bg-accent"
              style={{
                boxShadow:
                  "0 0 0 6px rgb(198 255 61 / .14), 0 0 34px 8px rgb(198 255 61 / .45)",
              }}
            />
            <p className="mt-3 truncate font-serif text-[28px] italic leading-tight text-ink">
              {at ? displayName(at.name) : ""}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3">
              {pulled.length
                ? `${pulled.length} signal${pulled.length === 1 ? "" : "s"} · ${pulled.length - left} decoded`
                : "Quiet star"}
            </p>
          </div>

          {/* its signals, on the lower arc */}
          {pulled.map((b, i) => {
            const a =
              ((ARC.from + ((ARC.to - ARC.from) * (i + 0.5)) / pulled.length) *
                Math.PI) /
              180;
            const open = decoded.has(b.id);
            const staged = stage?.id === b.id;
            return (
              <div
                key={b.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${STAR.x + Math.cos(a) * ARC.rx}%`,
                  top: `${STAR.y + ARC.dy + Math.sin(a) * ARC.ry}%`,
                }}
              >
                <motion.div
                  initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                  animate={{
                    opacity: staged ? 0.25 : 1,
                    scale: staged ? 0.85 : 1,
                  }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : {
                          type: "spring",
                          stiffness: 260,
                          damping: 24,
                          delay: staged ? 0 : 0.12 + i * 0.06,
                        }
                  }
                >
                  <button
                    type="button"
                    onClick={() => tap(b)}
                    aria-label={
                      open
                        ? `${b.name}, decoded`
                        : `Scratch signal ${i + 1} open`
                    }
                    className={`relative grid h-11 w-11 place-items-center rounded-full ${reduce ? "" : "[animation:skyBob_6s_ease-in-out_infinite]"}`}
                    style={{ animationDelay: `${-i * 1.5}s` }}
                  >
                    {open ? (
                      b.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img(b.image)}
                          alt=""
                          className="h-full w-full rounded-full bg-white object-cover shadow-[0_0_0_1.5px_rgba(198,255,61,.8),0_0_18px_rgba(198,255,61,.35)]"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center rounded-full bg-paper-2 font-display text-lg font-bold shadow-[0_0_0_1.5px_rgba(198,255,61,.8)]">
                          {b.name[0]}
                        </span>
                      )
                    ) : (
                      <span
                        className={`grid h-full w-full place-items-center rounded-full border border-dashed border-accent/80 bg-black/60 font-mono text-[13px] font-bold text-accent ${reduce ? "" : "[animation:skyBreathe_2.4s_ease-in-out_infinite]"}`}
                      >
                        ?
                      </span>
                    )}
                  </button>
                </motion.div>
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>

      {/* the scratch plate, or the hint */}
      <div className="absolute inset-x-6 top-[73%] z-20">
        <AnimatePresence mode="wait">
          {stage ? (
            <motion.div
              key={stage.id}
              className="rounded-2xl border border-white/10 bg-black/55 px-4 py-2 backdrop-blur-md"
              initial={
                reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <ScratchReveal
                    name={stage.name}
                    image={img(stage.image)}
                    loveId={at?.id ?? ""}
                    brandId={stage.id}
                    strength={Math.min(
                      1,
                      (stage.explain[at?.id ?? ""] ?? 0) * 2,
                    )}
                    reduce={reduce}
                    autoRun={auto}
                    onDone={() => {
                      onScratched(stage);
                      setTimeout(
                        () => setStage((s) => (s?.id === stage.id ? null : s)),
                        700,
                      );
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setAuto((n) => n + 1)}
                  className="mt-2.5 shrink-0 rounded-full border border-accent/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-accent hover:bg-accent hover:text-paper"
                >
                  Auto
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.p
              key="hint"
              className="pt-5 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {left
                ? "Tap a signal to scratch it open"
                : pulled.length
                  ? "All decoded · try another star"
                  : "Nothing pulled here · try another star"}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* fade into the sheet */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16"
        style={{
          background:
            "linear-gradient(to bottom, transparent, var(--card,#0d0d12))",
        }}
      />
      {/* the rail: every love, by name */}
      <div
        ref={rail}
        className="absolute inset-x-0 bottom-0 z-20 flex snap-x gap-5 overflow-x-auto px-6 pb-4 pt-2 [scrollbar-width:none]"
      >
        {loves.map((l, i) => (
          <button
            key={l.id}
            type="button"
            aria-pressed={i === idx}
            onClick={() => go(i)}
            className={`shrink-0 snap-center whitespace-nowrap border-b pb-1 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${i === idx ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink-2"}`}
          >
            {displayName(l.name).slice(0, 22)}
          </button>
        ))}
      </div>
    </div>
  );
}
