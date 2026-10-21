"use client";

import { CursorArrow } from "@/components/CursorArrow";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { EASE, Magnetic, MaskedWords } from "./primitives";
import s from "./landing.module.css";


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
            {BRAND.promise}
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.88 }}
            className="mt-5 max-w-[34rem] text-[15px] leading-relaxed text-ink-3 max-[480px]:hidden sm:text-base"
          >
            Name three things you love. Get the brands that fit, a receipt for each, and a card nobody else has. First one needs no account.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 1 }}
            className="mt-9 flex flex-wrap items-center gap-3 max-[480px]:mt-6"
          >
            {/* two equal doors: make your own (the point of the site) or watch one get made */}
            <Magnetic
              onClick={onCustom}
              innerClassName="max-[480px]:w-full"
              className="group relative inline-flex h-16 items-center gap-4 overflow-hidden rounded-full bg-accent pl-6 pr-2 text-left text-paper shadow-[0_0_0_1px_rgba(198,255,61,0.4),0_14px_40px_-14px_rgba(198,255,61,0.5)] max-[480px]:w-full"
            >
              <span className="flex flex-col leading-none max-[480px]:flex-1">
                <span className="text-[17px] font-semibold tracking-tight">Make my card</span>
                <span className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] opacity-65">3 favourites · 30 sec</span>
              </span>
              <CursorArrow className="h-12 w-12 shrink-0 bg-paper text-accent" />
            </Magnetic>
            {/* same build as the primary: words on the left, its picture where the arrow sits */}
            <Magnetic
              onClick={onPick}
              strength={0.25}
              innerClassName="max-[480px]:w-full"
              className={`${s.altCta} group relative inline-flex h-16 items-center gap-4 rounded-full pl-6 pr-3 text-left text-ink max-[480px]:w-full`}
            >
              <span className="flex flex-col leading-none max-[480px]:flex-1">
                <span className="text-[17px] font-semibold tracking-tight">Try a ready-made card</span>
                <span className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">secret · holo · rare</span>
              </span>
              <span className="relative mr-1 h-10 w-11 shrink-0" aria-hidden>
                <i className="absolute left-0 top-1.5 h-8 w-6 rotate-[-14deg] rounded-[4px] bg-gradient-to-br from-[#bfe3ff] to-[#3b82f6] shadow-md transition-transform duration-500 group-hover:-rotate-[22deg]" />
                <i className="absolute left-2.5 top-0.5 h-8 w-6 rounded-[4px] bg-[linear-gradient(115deg,#ff7773,#ffed5f,#a8ff5f,#83fff7,#7894ff,#d875ff)] shadow-md" />
                <i className="absolute left-5 top-1.5 h-8 w-6 rotate-[14deg] rounded-[4px] bg-gradient-to-br from-[#fff1b8] via-[#d9a73a] to-[#6e4a0c] shadow-md transition-transform duration-500 group-hover:rotate-[22deg]" />
              </span>
            </Magnetic>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.2 }}
            className="mt-7 flex flex-wrap items-center gap-2 max-[480px]:mt-5"
          >
            <span className="mr-1 font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Not needed</span>
            {["birth chart", "purchase history", "40-question quiz"].map((w, i) => (
              <span key={w} className={s.nope} style={{ "--k": struck ? 1 : 0, "--d": `${i * 0.18}s` } as React.CSSProperties}>
                {w}
                {/* a quick marker scribble, drawn on once the line has settled */}
                <svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden>
                  <path d={i === 1 ? "M2 8 C 22 4, 40 9, 60 5 S 88 4, 98 6" : i === 2 ? "M2 6 C 18 9, 38 3, 58 7 S 84 8, 98 4" : "M2 5 C 20 8, 42 4, 62 7 S 86 5, 98 7"} pathLength={1} />
                </svg>
              </span>
            ))}
          </motion.div>
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
