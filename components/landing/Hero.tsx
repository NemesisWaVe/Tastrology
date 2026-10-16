"use client";

import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { EASE, Magnetic, MaskedWords } from "./primitives";
import s from "./landing.module.css";

const ROTATING = ["watchlist", "playlist", "bookshelf", "comfort show", "save file", "city break", "podcast queue"];

/* The hidden constellation: taste words that only appear under the cursor's light. */
const STARS = [
  "futuristic", "floral", "noir", "understated", "whimsical", "industrial", "heritage", "romantic", "utility",
  "avant-garde", "earthy", "preppy", "grunge", "luxe", "eclectic", "minimal", "retro", "artisan",
  "cyber", "soft", "tailored", "oversized", "monochrome", "boho",
];
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}
const STAR_POS = (() => {
  const r = rng(42);
  return STARS.map((w) => ({ w, x: 3 + r() * 92, y: 4 + r() * 90, o: 0.35 + r() * 0.5 }));
})();

export function Hero({ specimen, onPick, onCustom }: { specimen: ReactNode; onPick: () => void; onCustom: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const textY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -120]);
  const textO = useTransform(scrollYProgress, [0, 0.8], [1, reduce ? 1 : 0.15]);
  const cardY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 90]);

  // Cursor flashlight: write CSS vars directly, no re-render.
  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--sx", `${e.clientX - r.left}px`);
        el.style.setProperty("--sy", `${e.clientY - r.top}px`);
      });
    };
    el.addEventListener("pointermove", move);
    return () => {
      el.removeEventListener("pointermove", move);
      cancelAnimationFrame(raf);
    };
  }, [reduce]);

  const [wi, setWi] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setWi((i) => (i + 1) % ROTATING.length), 2200);
    return () => clearInterval(t);
  }, [reduce]);

  const [struck, setStruck] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStruck(true), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <section ref={ref} className={`${s.hero} relative min-h-[100svh] pt-24 sm:pt-28`}>
      {/* atmosphere */}
      <div className={s.gridBg} aria-hidden />
      <div className={s.orb} style={{ width: "46vw", height: "46vw", left: "-12vw", top: "-10vw", background: "radial-gradient(circle, rgba(120,148,255,0.22), transparent 65%)" }} aria-hidden />
      <div className={s.orb} style={{ width: "40vw", height: "40vw", right: "-8vw", top: "18%", background: "radial-gradient(circle, rgba(216,117,255,0.18), transparent 65%)", animationDelay: "-6s" }} aria-hidden />
      <div className={s.orb} style={{ width: "34vw", height: "34vw", left: "30%", bottom: "-14vw", background: "radial-gradient(circle, rgba(198,255,61,0.08), transparent 65%)", animationDelay: "-11s" }} aria-hidden />
      <div className={s.spot} aria-hidden />
      <div className={s.constellation} aria-hidden>
        {STAR_POS.map((p) => (
          <span key={p.w} className={`${s.star} absolute font-mono text-[10px] uppercase tracking-[0.25em] text-ink`} style={{ left: `${p.x}%`, top: `${p.y}%`, opacity: p.o }}>
            ✦ {p.w}
          </span>
        ))}
      </div>

      <div className="mx-auto grid max-w-[1320px] items-center gap-10 px-4 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:gap-8 lg:px-12">
        <motion.div style={{ y: textY, opacity: textO }} className="relative z-10 min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}
            className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-line bg-white/[0.03] py-1.5 pl-2 pr-3.5 backdrop-blur"
          >
            <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-paper">{BRAND.cardSet}</span>
            <span className="text-[13px] text-ink-2">{BRAND.tagline}</span>
          </motion.div>

          <h1 className="font-display text-[clamp(3.05rem,12.6vw,7.4rem)] lg:text-[clamp(4.5rem,7.3vw,7.6rem)] font-bold leading-[0.86] tracking-[-0.045em] text-ink">
            <MaskedWords text="What's your" className="block" delay={0.15} />
            <span className="block">
              <MaskedWords text="taste" delay={0.32} />
              {" "}
              <MaskedWords text="sign?" delay={0.4} wordClassName={`${s.holoText} font-serif font-normal italic tracking-[-0.02em] pr-[0.06em]`} />
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.75 }}
            className="mt-7 text-[clamp(1.2rem,4.4vw,1.65rem)] leading-tight tracking-tight text-ink-2"
          >
            Your{" "}
            <span className="relative inline-grid h-[1.2em] overflow-hidden align-bottom">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={ROTATING[wi]}
                  initial={{ y: "100%", opacity: 0, filter: "blur(6px)" }}
                  animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
                  exit={{ y: "-100%", opacity: 0, filter: "blur(6px)" }}
                  transition={{ duration: 0.6, ease: EASE }}
                  className="col-start-1 row-start-1 whitespace-nowrap font-serif text-[1.12em] italic text-ink"
                >
                  {ROTATING[wi]}
                </motion.span>
              </AnimatePresence>
            </span>{" "}
            <br className="sm:hidden" />
            says more than your birth chart.
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.88 }}
            className="mt-5 max-w-[34rem] text-[15px] leading-relaxed text-ink-3 sm:text-base"
          >
            Name 3 to 8 things you love. An agent reads Qloo&apos;s cross-domain taste graph and mints your{" "}
            <span className="text-ink">taste sign</span>: a holo card with your Big Three, your rarity, and the brands that fit you. With receipts for every pick.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 1 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Magnetic
              onClick={onPick}
              className="group relative inline-flex h-14 items-center gap-3 overflow-hidden rounded-full bg-accent pl-6 pr-2 text-[15px] font-semibold text-paper shadow-[0_0_0_1px_rgba(198,255,61,0.4),0_18px_50px_-12px_rgba(198,255,61,0.55)]"
            >
              Pick a sign
              <span className="rounded-full bg-paper/10 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em]">zero typing</span>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-paper text-accent transition-transform duration-500 group-hover:rotate-[-45deg]">→</span>
            </Magnetic>
            <Magnetic
              onClick={onCustom}
              strength={0.2}
              className="inline-flex h-14 items-center gap-2 rounded-full border border-line px-6 text-[15px] font-medium text-ink transition-colors hover:border-ink-3 hover:bg-white/[0.03]"
            >
              Bring your own taste
            </Magnetic>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.2 }}
            className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3"
          >
            <span className="text-ink-2">No</span>
            {["birth chart", "purchase history", "40-question quiz"].map((w, i) => (
              <span key={w} className={s.strike} style={{ "--k": struck ? 1 : 0, "--d": `${i * 0.18}s` } as React.CSSProperties}>
                {w}
              </span>
            ))}
          </motion.p>
        </motion.div>

        <motion.div style={{ y: cardY }} className="relative z-10 pb-16 lg:pb-0">
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, ease: EASE, delay: 0.35 }}>
            {specimen}
          </motion.div>
        </motion.div>
      </div>

    </section>
  );
}
