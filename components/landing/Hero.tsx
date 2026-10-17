"use client";

import { CursorArrow } from "@/components/CursorArrow";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { EASE, Magnetic, MaskedWords } from "./primitives";
import s from "./landing.module.css";

const ROTATING = ["watchlist", "playlist", "bookshelf", "comfort show", "save file", "city break", "podcast queue"];

export function Hero({ specimen, onPick, onCustom }: { specimen: ReactNode; onPick: () => void; onCustom: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  // ≤480px the card sits above the headline: opposite parallax would slide them into each other
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 480px)");
    const f = () => setNarrow(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  const still = reduce || narrow;
  const textY = useTransform(scrollYProgress, [0, 1], [0, still ? 0 : -120]);
  const textO = useTransform(scrollYProgress, [0, 0.8], [1, reduce ? 1 : 0.15]);
  const cardY = useTransform(scrollYProgress, [0, 1], [0, still ? 0 : 90]);

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
    <section ref={ref} className={`${s.hero} relative min-h-[100svh] pt-24 max-[480px]:pt-20 sm:pt-28`}>
      <div className="mx-auto grid max-w-[1320px] items-center gap-10 px-4 max-[480px]:gap-0 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:gap-8 lg:px-12">
        <motion.div style={{ y: textY, opacity: textO }} className="relative z-20 min-w-0 max-[480px]:mt-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}
            className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-line bg-paper py-1.5 pl-2 pr-3.5 max-[480px]:hidden"
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
            className="mt-7 text-[clamp(1.2rem,4.4vw,1.65rem)] leading-tight tracking-tight text-ink-2 max-[480px]:mt-4 max-[480px]:text-[1.05rem]"
          >
            Your{" "}
            <span className="relative inline-grid h-[1.2em] overflow-hidden align-bottom">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={ROTATING[wi]}
                  initial={{ y: "100%", opacity: 0 }}
                  animate={{ y: "0%", opacity: 1 }}
                  exit={{ y: "-100%", opacity: 0 }}
                  transition={{ duration: 0.6, ease: EASE }}
                  className="col-start-1 row-start-1 whitespace-nowrap font-serif text-[1.12em] italic text-ink"
                >
                  {ROTATING[wi]}
                </motion.span>
              </AnimatePresence>
            </span>{" "}
            says more than your birth chart.
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.88 }}
            className="mt-5 max-w-[34rem] text-[15px] leading-relaxed text-ink-3 max-[480px]:hidden sm:text-base"
          >
            Name 3 to 8 things you love: an album, a film, a book, a city. An agent looks them up in Qloo&apos;s taste graph and hands back a{" "}
            <span className="text-ink">holo card</span> with your Sun, Moon and Rising, how rare your mix is, and the brands that fit. Each brand says which of your picks sent it.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 1 }}
            className="mt-9 flex flex-wrap items-center gap-3 max-[480px]:mt-6"
          >
            <Magnetic
              onClick={onPick}
              className="group relative inline-flex h-14 items-center gap-3 overflow-hidden rounded-full bg-accent pl-6 pr-2 text-[15px] font-semibold text-paper shadow-[0_0_0_1px_rgba(198,255,61,0.4),0_18px_50px_-12px_rgba(198,255,61,0.55)]"
            >
              Try a ready-made one
              <CursorArrow className="h-10 w-10 bg-paper text-accent" />
            </Magnetic>
            <Magnetic
              onClick={onCustom}
              strength={0.2}
              className="inline-flex h-14 items-center gap-2 rounded-full border border-line px-6 text-[15px] font-medium text-ink transition-colors hover:border-ink-3 hover:bg-white/[0.03]"
            >
              Use my own favorites
            </Magnetic>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.2 }}
            className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3 max-[480px]:mt-5"
          >
            <span className="text-ink-2">No</span>
            {["birth chart", "purchase history", "40-question quiz"].map((w, i) => (
              <span key={w} className={s.strike} style={{ "--k": struck ? 1 : 0, "--d": `${i * 0.18}s` } as React.CSSProperties}>
                {w}
              </span>
            ))}
          </motion.p>
        </motion.div>

        <motion.div id="hero-card" style={{ y: cardY }} className="relative z-10 pb-16 max-[480px]:order-first max-[480px]:pb-0 lg:pb-0">
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, ease: EASE, delay: 0.35 }}>
            {/* The intro's star card docks here; --intro-dock fades the real card in under it. */}
            <div className={s.dock} data-dock>{specimen}</div>
          </motion.div>
        </motion.div>
      </div>

    </section>
  );
}
