"use client";

import { AnimatePresence, animate, motion, useAnimationControls, useMotionValue, useTransform } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HoloCard } from "@/components/card/HoloCard";
import { BRAND } from "@/lib/brand";
import type { CardData, CardType } from "@/lib/card";
import s from "./reveal.module.css";

const EASE = [0.2, 0.7, 0.2, 1] as const;

type Stage = "sealed" | "opening" | "facedown" | "charging" | "revealed";

const RARITY = {
  common: { sparks: 0, shake: 0, ray: "rgb(255 255 255 / .5)", rays: 0.35, stamp: "●" },
  rare: { sparks: 12, shake: 0, ray: "", rays: 0.55, stamp: "✦" },
  holo: { sparks: 26, shake: 9, ray: "", rays: 0.8, stamp: "✦✦" },
  secret: { sparks: 40, shake: 16, ray: "#fcd34d", rays: 1, stamp: "✦✦✦" },
};

function useViewport() {
  const [v, setV] = useState({ w: 390, h: 800 });
  useEffect(() => {
    const on = () => setV({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return v;
}

/**
 * Phase 3: tear open a foil booster in the card's own colours, flip the face-down card,
 * and let rarity escalate the reveal (secret/holo: charge-up, screen shake, stronger burst).
 */
export function Pack({ card, loves, reduce, onDone }: { card: CardData; loves: number; reduce: boolean; onDone: () => void }) {
  const { w, h } = useViewport();
  const cardW = Math.round(Math.max(220, Math.min(340, w - 64, (h - 270) * (63 / 88))));
  const packW = Math.round(Math.min(cardW + 18, ((h - 230) / 1.5) | 0));
  const packH = Math.round(packW * 1.5);
  const tearY = Math.round(packH * 0.15);

  const [stage, setStage] = useState<Stage>("sealed");
  const [face, setFace] = useState<"back" | "front">("back");
  const busy = useRef(false);
  const p = useMotionValue(0);
  const rotY = useMotionValue(0);
  const shake = useAnimationControls();
  const r = RARITY[card.rarity];
  const big = card.rarity === "holo" || card.rarity === "secret";
  const { sun, moon, rising } = card.bigThree;

  const vars = {
    "--a": sun.a,
    "--b": sun.b,
    "--m": moon.a,
    "--ray": r.ray || sun.a,
  } as React.CSSProperties;

  /* ---------------------------------------------------------------- tear */

  const open = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    if (!reduce) await animate(p, 1, { duration: Math.max(0.12, (1 - p.get()) * 0.5), ease: "easeIn" });
    else p.set(1);
    setStage("opening");
    setTimeout(() => {
      setStage("facedown");
      busy.current = false;
    }, reduce ? 350 : 1150);
  }, [p, reduce]);

  const drag = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (stage !== "sealed" || busy.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = Math.abs(e.clientX - d.x);
    if (dx > 6) d.moved = true;
    const v = Math.min(1, dx / (packW * 0.75));
    p.set(v);
    if (v >= 0.92) {
      drag.current = null;
      open();
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved || p.get() > 0.4) open();
    else animate(p, 0, { type: "spring", stiffness: 400, damping: 30 });
  };

  /* ---------------------------------------------------------------- flip */

  const flip = useCallback(async () => {
    if (busy.current || stage !== "facedown") return;
    busy.current = true;
    if (big && !reduce) {
      setStage("charging");
      await new Promise((res) => setTimeout(res, card.rarity === "secret" ? 1300 : 950));
    }
    if (reduce) {
      setFace("front");
    } else {
      await animate(rotY, 90, { duration: 0.2, ease: "easeIn" });
      setFace("front");
      rotY.set(-90);
      animate(rotY, 0, { type: "spring", stiffness: 260, damping: 18 });
    }
    setStage("revealed");
    if (r.shake && !reduce) shake.start({ x: [0, -r.shake, r.shake * 0.8, -r.shake * 0.6, r.shake * 0.4, -r.shake * 0.2, 0], y: [0, r.shake * 0.4, -r.shake * 0.5, r.shake * 0.3, 0, 0, 0], transition: { duration: 0.55 } });
    busy.current = false;
  }, [big, card.rarity, r.shake, reduce, rotY, shake, stage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if ((e.target as HTMLElement)?.tagName === "BUTTON") return;
      e.preventDefault();
      if (stage === "sealed") open();
      else if (stage === "facedown") flip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, open, flip]);

  /* ---------------------------------------------------------------- pointer tilt for the sealed pack */

  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const tiltX = useTransform(ty, [-1, 1], [10, -10]);
  const tiltY = useTransform(tx, [-1, 1], [-14, 14]);
  const onHover = (e: React.PointerEvent) => {
    if (reduce || drag.current) return;
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tx.set(((e.clientX - b.left) / b.width) * 2 - 1);
    ty.set(((e.clientY - b.top) / b.height) * 2 - 1);
  };
  const onLeave = () => {
    animate(tx, 0, { duration: 0.6 });
    animate(ty, 0, { duration: 0.6 });
  };

  const stripRotate = useTransform(p, [0, 1], [0, -9]);
  const stripY = useTransform(p, [0, 1], [0, -10]);
  const seamW = useTransform(p, (v) => `${v * 100}%`);
  const leak = useTransform(p, [0, 0.05, 1], [0, 0.6, 1]);

  const sparks = useMemo(
    () =>
      Array.from({ length: r.sparks }, (_, k) => {
        const ang = (k / Math.max(1, r.sparks)) * Math.PI * 2 + (k % 3) * 0.3;
        const dist = 160 + ((k * 37) % 140);
        return { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, d: (k % 5) * 0.04, c: [sun.a, moon.a, rising.a, "#fff"][k % 4] };
      }),
    [r.sparks, sun.a, moon.a, rising.a],
  );

  const showRays = stage === "opening" || stage === "facedown" || stage === "charging" || stage === "revealed";

  return (
    <motion.div className="absolute inset-0 flex flex-col" style={vars} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      {/* ambient */}
      <div className={s.orb} style={{ width: "70vmax", height: "70vmax", left: "-25vmax", top: "-30vmax", background: `color-mix(in oklab, ${sun.a} 40%, transparent)` }} />
      <div className={s.orb} style={{ width: "60vmax", height: "60vmax", right: "-25vmax", bottom: "-30vmax", background: `color-mix(in oklab, ${moon.a} 35%, transparent)` }} />

      <motion.div animate={shake} className="relative z-10 flex flex-1 flex-col">
        {/* header copy */}
        <div className="relative z-10 h-[92px] px-6 pt-6 text-center sm:pt-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={stage === "revealed" ? "rev" : stage === "sealed" ? "sealed" : "card"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              {stage === "sealed" && (
                <>
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.26em] text-ink-3">your taste sign · {BRAND.cardSet.toLowerCase()}</p>
                  <h2 className="mt-1.5 font-serif text-[clamp(30px,8vw,42px)] italic leading-none">Tear it open.</h2>
                </>
              )}
              {(stage === "opening" || stage === "facedown" || stage === "charging") && (
                <>
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.26em] text-ink-3">1 card inside</p>
                  <h2 className="mt-1.5 font-serif text-[clamp(30px,8vw,42px)] italic leading-none">
                    {stage === "charging" ? "Oh. Oh, this one’s rare." : "Tap to flip."}
                  </h2>
                </>
              )}
              {stage === "revealed" && (
                <motion.div initial={reduce ? false : { scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.15 }}>
                  <span
                    className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-mono text-[12px] font-medium uppercase tracking-[0.2em] text-paper"
                    style={{
                      background: card.rarity === "secret" ? "linear-gradient(90deg,#fde68a,#f59e0b,#fef3c7)" : card.rarity === "holo" ? "var(--holo)" : card.rarity === "rare" ? `linear-gradient(90deg, ${sun.a}, ${sun.b})` : "var(--ink-2)",
                      boxShadow: big ? `0 0 30px -4px ${card.rarity === "secret" ? "#fcd34d" : sun.a}` : undefined,
                    }}
                  >
                    {r.stamp} {card.rarityLabel}
                  </span>
                  <p className="mt-2 text-[12.5px] text-ink-2">
                    {card.dual ? "Dual type" : "Basic"} · specimen #{card.serial}
                  </p>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* stage */}
        <div className="relative grid flex-1 place-items-center">
          {/* burst rays */}
          <AnimatePresence>
            {showRays && (
              <motion.div
                className={s.rays}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: stage === "revealed" ? r.rays : stage === "charging" ? 0.9 : 0.35, scale: stage === "revealed" ? 1.15 : stage === "charging" ? 0.9 : 0.7 }}
                transition={{ duration: 0.9, ease: EASE }}
                style={card.rarity === "holo" ? ({ "--ray": stage === "revealed" ? moon.a : sun.a } as React.CSSProperties) : undefined}
              />
            )}
          </AnimatePresence>

          {/* flash */}
          <AnimatePresence>
            {(stage === "opening" || (stage === "revealed" && big)) && !reduce && (
              <motion.div
                key={stage}
                className="pointer-events-none fixed inset-0 z-30"
                style={{ background: `radial-gradient(circle at 50% 50%, white 0%, ${stage === "revealed" && card.rarity === "secret" ? "#fcd34d" : sun.a} 30%, transparent 70%)` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.95, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, times: [0, 0.15, 1] }}
              />
            )}
          </AnimatePresence>

          {/* sealed pack */}
          <AnimatePresence>
            {(stage === "sealed" || stage === "opening") && (
              <motion.div
                key="pack"
                className="absolute"
                style={{ perspective: 1000 }}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 80, scale: 0.85, rotate: -4 }}
                animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                exit={reduce ? { opacity: 0 } : { y: packH * 0.95, opacity: 0, rotate: 6, transition: { duration: 0.75, ease: [0.5, 0, 0.75, 0] } }}
                transition={{ type: "spring", stiffness: 160, damping: 18 }}
              >
                <motion.div
                  role="button"
                  tabIndex={0}
                  aria-label="Tear open the pack"
                  className={`${s.pack} outline-none`}
                  style={{ width: packW, height: packH, rotateX: tiltX, rotateY: tiltY, transformStyle: "preserve-3d" }}
                  animate={stage === "sealed" && !reduce ? { y: [0, -6, 0] } : undefined}
                  transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                  onPointerDown={onDown}
                  onPointerMove={(e) => {
                    onMove(e);
                    onHover(e);
                  }}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                  onPointerLeave={onLeave}
                >
                  {/* drop shadow */}
                  <div className="absolute inset-x-[8%] -bottom-6 h-10 rounded-[50%] bg-black/60 blur-xl" />
                  {/* body */}
                  <div className="absolute inset-0" style={{ clipPath: bodyClip(packW, packH, tearY) }}>
                    <PackArt card={card} loves={loves} w={packW} h={packH} tearY={tearY} />
                  </div>
                  {/* light leaking from the tear */}
                  <motion.div
                    className="pointer-events-none absolute left-0 right-0"
                    style={{ top: tearY - 30, height: 60, opacity: leak, background: `radial-gradient(60% 50% at 50% 50%, white, ${sun.a} 40%, transparent 75%)`, filter: "blur(6px)" }}
                  />
                  {/* top strip */}
                  <motion.div
                    className="absolute inset-0"
                    style={{ transformOrigin: `${packW}px ${tearY}px` }}
                    animate={stage === "opening" ? (reduce ? { opacity: 0 } : { x: packW * 0.7, y: -packH * 0.5, rotate: 38, opacity: 0 }) : undefined}
                    transition={{ duration: 0.7, ease: [0.3, 0, 0.6, 1] }}
                  >
                    <motion.div
                      className="absolute inset-0"
                      style={{ clipPath: stripClip(packW, tearY), rotate: stripRotate, y: stripY, transformOrigin: `${packW}px ${tearY}px` }}
                    >
                      <PackArt card={card} loves={loves} w={packW} h={packH} tearY={tearY} />
                    </motion.div>
                  </motion.div>
                  <motion.div className={s.seam} style={{ top: tearY - 1.5, width: seamW }} />
                  {/* hint */}
                  {stage === "sealed" && (
                    <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ top: tearY - 30 }}>
                      <span className={`${reduce ? "" : s.hintSweep} rounded-full bg-black/50 px-2.5 py-1 font-mono text-[10px] text-white backdrop-blur`}>
                        ✂ drag →
                      </span>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* the card */}
          <AnimatePresence>
            {(stage === "facedown" || stage === "charging" || stage === "revealed") && (
              <motion.div
                key="card"
                className="relative z-10"
                style={{ perspective: 1400, width: cardW }}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 140, scale: 0.6 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 140, damping: 16 }}
              >
                {/* charge-up glow */}
                <motion.div
                  className="pointer-events-none absolute -inset-6 rounded-[28px]"
                  style={{ background: `radial-gradient(closest-side, ${card.rarity === "secret" ? "#fcd34d" : sun.a}, transparent)`, filter: "blur(20px)" }}
                  animate={{ opacity: stage === "charging" ? [0.3, 1, 0.6, 1] : stage === "revealed" ? (big ? 0.55 : 0.25) : 0.2, scale: stage === "charging" ? [1, 1.15, 1.05, 1.25] : 1 }}
                  transition={{ duration: stage === "charging" ? 1.1 : 0.6 }}
                />
                <motion.div
                  style={{ rotateY: rotY, transformStyle: "preserve-3d" }}
                  animate={stage === "charging" ? { x: [0, -3, 3, -4, 4, -5, 5, -3, 0], rotate: [0, -1, 1, -1.5, 1.5, 0] } : { x: 0, rotate: 0 }}
                  transition={stage === "charging" ? { duration: 0.9, repeat: Infinity } : { duration: 0.2 }}
                >
                  {face === "back" ? (
                    <AnimatePresence mode="wait">
                      <motion.button
                        key="back"
                        type="button"
                        onClick={flip}
                        aria-label="Flip the card"
                        className={`${s.back} block w-full text-left`}
                        whileHover={reduce ? undefined : { y: -4 }}
                        whileTap={reduce ? undefined : { scale: 0.98 }}
                        exit={{ opacity: 0 }}
                      >
                        <CardBack />
                      </motion.button>
                    </AnimatePresence>
                  ) : (
                    <motion.div initial={reduce ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
                      <HoloCard card={card} width={cardW} idle />
                    </motion.div>
                  )}
                </motion.div>

                {/* sparks */}
                {stage === "revealed" &&
                  !reduce &&
                  sparks.map((sp, k) => (
                    <motion.i
                      key={k}
                      className={s.spark}
                      style={{ ["--sp" as string]: sp.c, background: sp.c }}
                      initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                      animate={{ x: sp.x, y: sp.y, opacity: 0, scale: 0.3 }}
                      transition={{ duration: 1.1, delay: sp.d, ease: [0.1, 0.8, 0.3, 1] }}
                    />
                  ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* footer */}
        <div className="relative z-10 flex min-h-[112px] flex-col items-center justify-end gap-3 px-6 pb-6">
          <AnimatePresence mode="wait">
            {stage === "sealed" && (
              <motion.p key="h1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="font-mono text-[11px] text-ink-3">
                drag across the top to tear · or tap the pack
              </motion.p>
            )}
            {stage === "facedown" && (
              <motion.p key="h2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="font-mono text-[11px] text-ink-3">
                tap the card
              </motion.p>
            )}
            {stage === "revealed" && (
              <motion.div
                key="cta"
                className="flex w-full max-w-sm flex-col items-center gap-3"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: reduce ? 0 : 0.9, ease: EASE }}
              >
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[12px] text-ink-2">
                  <Sign g="☀" t={sun} />
                  <Sign g="☾" t={moon} />
                  <Sign g="↑" t={rising} />
                </div>
                <button
                  onClick={onDone}
                  autoFocus
                  className="group flex w-full items-center justify-center gap-2 rounded-full bg-accent px-6 py-3.5 font-display text-[16px] font-semibold text-paper shadow-[0_10px_40px_-10px_var(--accent)] transition-transform active:scale-[0.98]"
                >
                  See your receipts
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Sign({ g, t }: { g: string; t: CardType }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className="h-2 w-2 rounded-full" style={{ background: `linear-gradient(135deg, ${t.a}, ${t.b})` }} />
      <span className="text-ink-3">{g}</span> {t.name}
    </span>
  );
}

/* ------------------------------------------------------------------ pack art */

const TEETH = 18;
const DEPTH = 5;

function stripClip(w: number, tearY: number) {
  const pts: string[] = [];
  for (let k = 0; k <= TEETH; k++) pts.push(`${(k / TEETH) * w}px ${k % 2 ? DEPTH : 0}px`);
  pts.push(`${w}px ${tearY}px`);
  for (let k = 12; k >= 0; k--) pts.push(`${(k / 12) * w}px ${tearY + ((k * 7) % 3) - 1}px`);
  return `polygon(${pts.join(",")})`;
}

function bodyClip(w: number, h: number, tearY: number) {
  const pts: string[] = [];
  for (let k = 0; k <= 12; k++) pts.push(`${(k / 12) * w}px ${tearY + ((k * 7) % 3) - 1}px`);
  pts.push(`${w}px ${h - DEPTH}px`);
  for (let k = TEETH; k >= 0; k--) pts.push(`${(k / TEETH) * w}px ${k % 2 ? h - DEPTH : h}px`);
  return `polygon(${pts.join(",")})`;
}

function PackArt({ card, loves, w, h, tearY }: { card: CardData; loves: number; w: number; h: number; tearY: number }) {
  const { sun } = card.bigThree;
  const u = w / 100;
  return (
    <div className={s.packArt}>
      <div className={s.foil} />
      {/* plastic gloss */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgb(0 0 0 / .35), transparent 12%, rgb(255 255 255 / .16) 22%, transparent 34%, transparent 80%, rgb(0 0 0 / .4))" }} />
      <div className={s.crimp} style={{ top: 0, height: h * 0.065 }} />
      <div className={s.crimp} style={{ bottom: 0, height: h * 0.055 }} />
      <div className={s.tearLine} style={{ top: tearY }} />

      <div className="absolute inset-x-0 flex flex-col items-center text-center text-white" style={{ top: tearY + 4 * u }}>
        <p className="font-mono uppercase" style={{ fontSize: 2.6 * u, letterSpacing: "0.32em", opacity: 0.8 }}>
          {BRAND.cardSet} · booster
        </p>
        <div
          className="relative mt-[6%] grid place-items-center rounded-full"
          style={{
            width: 46 * u,
            height: 46 * u,
            background: "radial-gradient(circle, rgb(255 255 255 / .22), rgb(255 255 255 / .04) 62%, transparent 63%), conic-gradient(from 0deg, rgb(255 255 255 / .55), transparent 25%, rgb(255 255 255 / .45) 50%, transparent 75%, rgb(255 255 255 / .55))",
            boxShadow: "inset 0 0 0 1.5px rgb(255 255 255 / .55), 0 10px 40px -8px rgb(0 0 0 / .5)",
          }}
        >
          <span style={{ fontSize: 22 * u, lineHeight: 1, textShadow: "0 2px 18px rgb(0 0 0 / .35)" }}>{sun.glyph}</span>
        </div>
        <p className="font-display font-extrabold leading-none tracking-[-0.04em]" style={{ fontSize: 14.5 * u, marginTop: 7 * u, textShadow: "0 3px 24px rgb(0 0 0 / .35)" }}>
          {BRAND.name}
        </p>
        <p className="font-serif italic" style={{ fontSize: 5.2 * u, marginTop: 1.5 * u, opacity: 0.92 }}>
          {BRAND.tagline}
        </p>
      </div>
      <div className="absolute inset-x-0 text-center font-mono uppercase text-white" style={{ bottom: h * 0.085, fontSize: 2.5 * u, letterSpacing: "0.22em", opacity: 0.85 }}>
        1 holographic taste sign · from {loves} loves
      </div>
    </div>
  );
}

function CardBack() {
  return (
    <div className={s.backFace}>
      <div className="relative z-10 flex flex-col items-center gap-[5cqw] text-center">
        <div className={s.emblem}>
          <span className="font-serif italic text-white" style={{ fontSize: "20cqw", lineHeight: 1 }}>
            T
          </span>
        </div>
        <div>
          <p className="font-display font-bold tracking-[-0.03em] text-white" style={{ fontSize: "8cqw" }}>
            {BRAND.name}
          </p>
          <p className="mt-[1cqw] font-mono uppercase text-white/50" style={{ fontSize: "2.6cqw", letterSpacing: "0.3em" }}>
            tap to reveal
          </p>
        </div>
      </div>
    </div>
  );
}
