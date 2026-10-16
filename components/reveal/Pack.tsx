"use client";

import { CursorArrow } from "@/components/CursorArrow";
import { AnimatePresence, animate, motion, useAnimationControls, useMotionValue, useSpring, useTransform } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardBack, RARITY_GLOW } from "@/components/card/HoloCard";
import { FlipCard } from "@/components/card/FlipCard";
import { Sigil, TypeSigil, type SigilKind } from "@/components/card/Sigils";
import { BRAND } from "@/lib/brand";
import type { CardData, CardType } from "@/lib/card";
import { Sky } from "./Sky";
import { skyState } from "./traceModel";
import s from "./reveal.module.css";

const EASE = [0.2, 0.7, 0.2, 1] as const;

type Stage = "sealed" | "opening" | "inpack" | "facedown" | "charging" | "revealed";

const RARITY = {
  common: { sparks: 0, ray: "rgb(255 255 255 / .5)", rays: 0.3, stamp: "●" },
  rare: { sparks: 12, ray: "", rays: 0.45, stamp: "✦" },
  holo: { sparks: 26, ray: "", rays: 0.6, stamp: "✦✦" },
  secret: { sparks: 40, ray: "#fcd34d", rays: 0.7, stamp: "✦✦✦" },
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
  const pt = useMotionValue(0); // raw tension target
  const p = useSpring(pt, { stiffness: 220, damping: 17, mass: 0.7 }); // stretchy, slightly bouncy follow
  const fl = useMotionValue(0); // inner light flare just before the snap
  const rotY = useMotionValue(0);
  const shake = useAnimationControls();
  const r = RARITY[card.rarity];
  const big = card.rarity === "holo" || card.rarity === "secret";
  const { sun, moon, rising } = card.bigThree;
  const glow = RARITY_GLOW[card.rarity];

  const vars = {
    "--a": sun.a,
    "--b": sun.b,
    "--m": moon.a,
    "--ray": r.ray || sun.a,
  } as React.CSSProperties;

  /* ---------------------------------------------------------------- tear */

  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  /** The SNAP: light floods out of the seam, then the strip is released with ONE heavy damped impact. */
  const open = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    if (reduce) {
      pt.set(1);
      setStage("opening");
      setTimeout(() => {
        setStage("inpack");
        busy.current = false;
      }, 350);
      return;
    }
    pt.set(1);
    animate(fl, 1, { type: "spring", stiffness: 700, damping: 28 });
    await sleep(120);
    navigator.vibrate?.([34, 18, 70]);
    shake.set({ x: 20, y: -8, rotate: 0.6 });
    shake.start({ x: 0, y: 0, rotate: 0, transition: { type: "spring", stiffness: 380, damping: 9, mass: 1.2 } });
    setStage("opening");
    setTimeout(() => {
      setStage("inpack"); // the card now waits in the open pack until the user pulls it out
      animate(fl, 0, { duration: 0.8 });
      busy.current = false;
    }, 1150);
  }, [pt, fl, shake, reduce]);

  /*
   * The ONLY pointer path to open the pack: a deliberate horizontal pull along the top seam.
   * Taps, clicks and short or wandering drags never open it; nothing auto-completes, there is no timer.
   * Keyboard / reduced-motion users get the explicit "Open pack" button instead.
   */
  const SNAP = 0.74; // fraction of the pack width the pull must cover before the foil gives
  const drag = useRef<{ x: number; y: number; tick: number; max: number } | null>(null);
  const [tearing, setTearing] = useState(false);
  const scar = useMotionValue(0); // permanent partial tear left by abandoned pulls (capped, never opens)
  const scarW = useTransform(scar, (v) => `${(v * 100).toFixed(1)}%`);
  const release = (e?: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setTearing(false);
    const el = e?.currentTarget as HTMLElement | undefined;
    if (e && el?.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (!d) return;
    pt.set(0); // not torn far enough: the spring drags the strip back (it overshoots, like real foil)
    if (d.max > 0.1) animate(scar, Math.max(scar.get(), Math.min(0.3, d.max * 0.38)), { duration: 0.2 });
  };
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault(); // stop the browser starting a native image drag (ghost copy in Edge/Chrome)
    if (stage !== "sealed" || busy.current || reduce || e.button > 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tick: 0, max: 0 };
    setTearing(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = Math.max(0, e.clientX - d.x);
    const dy = Math.abs(e.clientY - d.y);
    // wandering off the seam (mostly vertical, or far from it) abandons the pull
    if (dy > Math.max(48, tearY * 1.5) && dy > dx * 0.6) return release(e);
    const raw = dx / (packW * SNAP);
    // resistance: the foil fights you, the harder the pull the less it gives
    const t = (1 - Math.pow(1 - Math.min(1, raw), 1.8)) * 0.94;
    pt.set(t);
    d.max = Math.max(d.max, t);
    const bucket = Math.floor(t * 5);
    if (bucket > d.tick) {
      d.tick = bucket;
      navigator.vibrate?.(5 + bucket * 2);
    }
    if (raw >= 1) {
      drag.current = null;
      setTearing(false);
      open();
    }
  };

  /* ---------------------------------------------------------------- pull the card out of the open pack */

  const cardH = Math.round((cardW * 88) / 63);
  // centred in the stage, but shifted down so only its top ~15% peeks over the torn lip
  const peekY = Math.round(-packH / 2 + tearY - 0.15 * cardH + cardH / 2);
  // ~60% of the way out, then it springs free; capped so short screens still have room to pull
  const PULL = Math.min(0.85 * cardH * 0.6, typeof window === "undefined" ? Infinity : window.innerHeight * 0.24);
  const cardY = useMotionValue(0);
  const pull = useRef<{ y: number; tick: number; ly: number; lt: number; v: number; r: number } | null>(null);
  const [pulling, setPulling] = useState(false);
  const viaKeys = useRef(false);
  const hintO = useTransform(cardY, (v) => 1 - Math.max(0, Math.min(1, (peekY - v) / (PULL * 0.15))));
  // resistance: snug against the lip at first, then 1:1 with the finger; pushing down barely gives
  const resist = (d: number) => (d < 0 ? Math.max(-14, d * 0.2) : d < 56 ? d * 0.55 : 30.8 + (d - 56));

  const takeCard = useCallback(() => {
    if (stage !== "inpack") return;
    pull.current = null;
    setPulling(false);
    navigator.vibrate?.([10, 30, 18]);
    setStage("facedown");
    if (reduce) cardY.set(0);
    else animate(cardY, 0, { type: "spring", stiffness: 170, damping: 16, velocity: -900 });
  }, [stage, reduce, cardY]);

  useEffect(() => {
    if (stage !== "inpack") return;
    if (reduce) return cardY.set(peekY);
    cardY.set(peekY + 70);
    const c = animate(cardY, peekY, { type: "spring", stiffness: 200, damping: 20 });
    return () => c.stop();
  }, [stage, peekY, reduce, cardY]);

  const onPullDown = (e: React.PointerEvent) => {
    e.preventDefault(); // no native drag ghost: this gesture is ours
    if (stage !== "inpack" || reduce || e.button > 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    cardY.stop();
    pull.current = { y: e.clientY, tick: 0, ly: e.clientY, lt: performance.now(), v: 0, r: 0 };
    setPulling(true);
  };
  const onPullMove = (e: React.PointerEvent) => {
    const pl = pull.current;
    if (!pl) return;
    const r = resist(pl.y - e.clientY);
    const now = performance.now();
    pl.v = (pl.ly - e.clientY) / Math.max(1, now - pl.lt); // upward px/ms
    pl.ly = e.clientY;
    pl.lt = now;
    pl.r = r;
    cardY.set(peekY - r);
    const b = Math.floor((r / PULL) * 4);
    if (b > pl.tick) {
      pl.tick = b;
      navigator.vibrate?.(6);
    }
    if (r >= PULL) takeCard();
  };
  const onPullUp = () => {
    const pl = pull.current;
    if (!pl) return;
    // a real flick (fast, already a third of the way out) carries the card free
    if (pl.v > 0.7 && pl.r > PULL * 0.33) return takeCard();
    pull.current = null;
    setPulling(false);
    animate(cardY, peekY, { type: "spring", stiffness: 260, damping: 20 }); // not far enough: slides back in
  };

  /* ---------------------------------------------------------------- hold to mint + flip */

  const [crack, setCrack] = useState(false);
  const [hot, setHot] = useState(false);
  const hotRef = useRef(false);
  const charge = useRef({ v: 0, holding: false, collapse: -1, ang: 0, tick: 0 });
  const backEl = useRef<HTMLButtonElement>(null);
  const jitterEl = useRef<HTMLDivElement>(null);
  const orbitEl = useRef<HTMLDivElement>(null);
  const glowEl = useRef<HTMLDivElement>(null);
  const sweepEl = useRef<HTMLDivElement>(null);
  const posters = useMemo(() => card.evolvesFrom.slice(0, 6), [card.evolvesFrom]);
  const posterW = Math.round(Math.max(54, Math.min(84, cardW * 0.24)));
  const orbitRx = Math.min(cardW * 0.78, w / 2 - posterW * 0.35);

  const flip = useCallback(async () => {
    if (busy.current || (stage !== "facedown" && stage !== "charging")) return;
    busy.current = true;
    const c = charge.current;
    c.holding = false;
    if (reduce) {
      setFace("front");
      setStage("revealed");
      busy.current = false;
      return;
    }
    // Posters spiral into the card, then the flip lands with a burst.
    c.collapse = 0;
    navigator.vibrate?.(card.rarity === "secret" || card.rarity === "holo" ? [12, 40, 24] : 14);
    await new Promise((res) => setTimeout(res, 260));
    if (card.rarity === "secret") {
      setCrack(true);
      await new Promise((res) => setTimeout(res, 520));
    }
    await animate(rotY, 90, { duration: 0.18, ease: "easeIn" });
    setFace("front");
    rotY.set(-90);
    animate(rotY, 0, { type: "spring", stiffness: 260, damping: 18 });
    setStage("revealed");
    busy.current = false;
  }, [card.rarity, reduce, rotY, stage]);

  const startHold = useCallback(() => {
    if (busy.current || stage !== "facedown" || reduce) return;
    charge.current.holding = true;
    setStage("charging");
  }, [stage, reduce]);

  // One loop drives the orbit, the charge glow, the jitter and the haptic ticks (no re-renders).
  useEffect(() => {
    if (stage !== "facedown" && stage !== "charging") return;
    if (reduce) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const c = charge.current;
      if (c.holding) c.v = Math.min(1, c.v + dt / 1400);
      else if (c.collapse < 0) c.v = Math.max(0, c.v - dt / 700);
      if (c.collapse >= 0) c.collapse = Math.min(1, c.collapse + dt / 260);
      const v = c.v;
      backEl.current?.style.setProperty("--charge", v.toFixed(3));
      if (backEl.current) backEl.current.toggleAttribute("data-charging", c.holding || c.collapse >= 0);
      if (jitterEl.current) {
        jitterEl.current.style.transform = `scale(${(1 + v * v * 0.05).toFixed(4)})`;
      }
      if (glowEl.current) {
        glowEl.current.style.opacity = (0.18 + 0.8 * v).toFixed(3);
        glowEl.current.style.transform = `scale(${(1 + 0.3 * v).toFixed(3)})`;
      }
      if (sweepEl.current) {
        sweepEl.current.style.opacity = (v * 0.9).toFixed(3);
        sweepEl.current.style.backgroundPosition = `${(160 - ((c.ang * 40) % 220) - v * 60).toFixed(1)}% 0`;
      }
      if (c.holding) {
        c.tick += dt;
        if (c.tick > 150 - v * 90) {
          c.tick = 0;
          navigator.vibrate?.(8);
        }
        if (v > 0.5 && !hotRef.current) {
          hotRef.current = true;
          setHot(true);
        }
      }
      // orbit: speeds up and spirals inward with the charge, collapses into the card on release
      c.ang += (dt / 1000) * (0.32 + v * v * 6.5);
      const shrink = (1 - 0.72 * v * v) * (c.collapse >= 0 ? 1 - c.collapse : 1);
      const kids = orbitEl.current?.children;
      if (kids) {
        const N = kids.length;
        for (let k = 0; k < N; k++) {
          const el = kids[k] as HTMLElement;
          const a = c.ang + (k / N) * Math.PI * 2;
          const x = Math.cos(a) * orbitRx * shrink;
          const y = Math.sin(a) * cardW * 0.3 * shrink - cardW * 0.08;
          const depth = Math.sin(a);
          const sc = (0.78 + depth * 0.2) * (c.collapse >= 0 ? 1 - c.collapse * 0.7 : 1);
          el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(Math.cos(a) * -12).toFixed(1)}deg) scale(${sc.toFixed(3)})`;
          el.style.zIndex = depth > 0 ? "30" : "1";
          el.style.opacity = String((c.collapse >= 0 ? 1 - c.collapse : 1) * (0.55 + (depth + 1) * 0.225));
          el.style.filter = depth > 0 ? "none" : `blur(${(1.5 - depth).toFixed(1)}px) brightness(0.7)`;
        }
      }
      if (c.holding && v >= 1) flip();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [stage, reduce, big, cardW, orbitRx, flip]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (stage === "sealed" || stage === "inpack") return; // only the explicit "Open pack" button (or the drag) opens it
      if ((e.target as HTMLElement)?.tagName === "BUTTON" && stage !== "facedown" && stage !== "charging") return;
      e.preventDefault();
      if (e.repeat) return;
      if (e.key === " " && stage === "facedown" && !reduce) startHold();
      else if (stage === "facedown" || stage === "charging") flip();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " " && charge.current.holding) flip();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [stage, open, flip, startHold, reduce]);

  /* ---------------------------------------------------------------- pointer tilt for the sealed pack */

  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const tiltX = useTransform(ty, [-1, 1], [10, -10]);
  const tiltY = useTransform(tx, [-1, 1], [-14, 14]);
  const onHover = (e: React.PointerEvent) => {
    if (reduce || drag.current || stage !== "sealed") return;
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tx.set(((e.clientX - b.left) / b.width) * 2 - 1);
    ty.set(((e.clientY - b.top) / b.height) * 2 - 1);
  };
  const onLeave = () => {
    animate(tx, 0, { duration: 0.6 });
    animate(ty, 0, { duration: 0.6 });
  };

  const stripRotate = useTransform(p, [0, 1], [0, -6]);
  const stripY = useTransform(p, [0, 1], [0, -9]);
  const stripSX = useTransform(p, [0, 1], [1, 1.035]);
  const stripSY = useTransform(p, [0, 1], [1, 1.14]);
  const packSX = useTransform(p, [0, 1], [1, 0.985]);
  const crinkle = useTransform(p, [0, 0.15, 1], [0, 0.1, 1]);
  const seamW = useTransform([p, fl], ([a, f]) => `${Math.min(100, ((a as number) * 0.8 + (f as number) * 0.2) * 100)}%`);
  const leak = useTransform([p, fl], ([a, f]) => Math.min(1, (a as number) * 0.55 + (f as number) * 0.9));
  const leakH = useTransform(fl, [0, 1], [60, 150]);
  const cueO = useTransform(p, [0, 0.12], [1, 0]);
  const leakY = useTransform(leakH, (v) => (60 - v) / 2);

  const sparks = useMemo(
    () =>
      Array.from({ length: r.sparks }, (_, k) => {
        const ang = (k / Math.max(1, r.sparks)) * Math.PI * 2 + (k % 3) * 0.3;
        const dist = 160 + ((k * 37) % 140);
        return { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, d: (k % 5) * 0.04, c: [sun.a, moon.a, rising.a, "#fff"][k % 4] };
      }),
    [r.sparks, sun.a, moon.a, rising.a],
  );

  const stageRef = useRef<HTMLDivElement>(null);
  const sky = useMemo(() => skyState(card.evolvesFrom, card.archetype), [card]);

  return (
    <motion.div className="absolute inset-0 flex flex-col" style={vars} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      {/* your sky: dim while sealed, brightening as you hold to mint, then lit around the card */}
      <Sky
        f={sky}
        anchor={stageRef}
        reduce={reduce}
        drawn
        dim={stage === "sealed" ? 0.45 : stage === "charging" ? 1.15 : stage === "revealed" ? 0.85 : 0.6}
      />

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
              {(stage === "opening" || stage === "inpack" || stage === "facedown" || stage === "charging") && (
                <>
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.26em] text-ink-3">1 card inside</p>
                  <h2 className="mt-1.5 font-serif text-[clamp(30px,8vw,42px)] italic leading-none">
                    {stage === "opening" || stage === "inpack" ? (reduce ? "Take your card." : "Pull it out.") : reduce ? "Tap to flip." : stage === "charging" ? (hot && big ? "Oh. Oh, this one’s rare." : "Minting…") : "Hold to mint."}
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
        <div ref={stageRef} className="relative grid flex-1 place-items-center">

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
            {(stage === "sealed" || stage === "opening" || stage === "inpack") && (
              <motion.div
                key="pack"
                className="absolute z-20"
                style={{ perspective: 1000, touchAction: stage === "inpack" ? "none" : undefined }}
                onPointerDown={onPullDown}
                onPointerMove={onPullMove}
                onPointerUp={onPullUp}
                onPointerCancel={onPullUp}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 80, scale: 0.85, rotate: -4 }}
                animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                exit={reduce ? { opacity: 0 } : { y: packH * 0.95, opacity: 0, rotate: 6, transition: { duration: 0.75, ease: [0.5, 0, 0.75, 0] } }}
                transition={{ type: "spring", stiffness: 160, damping: 18 }}
              >
                <motion.div
                  role="img"
                  aria-label="Sealed booster pack. Drag along the top seam to tear it open."
                  className={s.pack}
                  style={{ width: packW, height: packH, rotateX: tiltX, rotateY: tiltY, scaleX: packSX, transformStyle: "preserve-3d" }}
                  animate={stage === "sealed" && !reduce && !tearing ? { y: [0, -6, 0] } : { y: 0 }}
                  transition={tearing ? { duration: 0.2 } : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                  onPointerMove={onHover}
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
                    style={{ top: tearY - 30, height: leakH, y: leakY, opacity: leak, background: `radial-gradient(60% 50% at 50% 50%, white, ${sun.a} 40%, transparent 75%)`, filter: "blur(6px)" }}
                  />
                  {/* foil crinkle as tension builds */}
                  {stage === "sealed" && <motion.div className={s.crinkle} style={{ opacity: crinkle, height: tearY * 2.2, clipPath: stripClip(packW, tearY * 2.2) }} />}
                  {/* top strip */}
                  <motion.div
                    className="absolute inset-0"
                    style={{ transformOrigin: `${packW}px ${tearY}px` }}
                    animate={stage === "opening" || stage === "inpack" ? (reduce ? { opacity: 0 } : { x: packW * 1.3, y: -packH * 0.85, rotate: 300, opacity: 0 }) : undefined}
                    transition={
                      reduce
                        ? { duration: 0.3 }
                        : { x: { type: "spring", stiffness: 26, damping: 10, velocity: 900 }, y: { type: "spring", stiffness: 22, damping: 9, velocity: -1400 }, rotate: { type: "spring", stiffness: 14, damping: 7, velocity: 500 }, opacity: { duration: 0.45, delay: 0.5 } }
                    }
                  >
                    <motion.div
                      className="absolute inset-0"
                      style={{ clipPath: stripClip(packW, tearY), rotate: stripRotate, y: stripY, scaleX: stripSX, scaleY: stripSY, transformOrigin: `${packW}px ${tearY}px` }}
                    >
                      <PackArt card={card} loves={loves} w={packW} h={packH} tearY={tearY} />
                    </motion.div>
                  </motion.div>
                  <motion.div className={s.seam} style={{ top: tearY - 1.5, width: seamW, opacity: leak }} />
                  {/* partial tear left behind by an abandoned pull */}
                  {stage === "sealed" && <motion.div className={s.scar} style={{ top: tearY - 2, width: scarW }} />}
                  {/* affordance: a notch on the seam, "drag to tear", and an arrow that nudges while idle */}
                  {stage === "sealed" && (
                    <motion.div className={s.tearCue} style={{ top: tearY, opacity: cueO }} data-tearing={tearing ? "1" : undefined} aria-hidden>
                      <i className={s.notch} />
                      <span className="rounded-full bg-black/60 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.25)] backdrop-blur">
                        drag to tear
                      </span>
                      <svg className={s.cueArrow} viewBox="0 0 28 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 6h24M20 1l5 5-5 5" />
                      </svg>
                    </motion.div>
                  )}
                </motion.div>
                  {/* the grip: the top seam band, tall enough to include the "drag to tear" notch (Outside the preserve-3d pack, so the tilted strip can never steal the hit test.) */}
                  {stage === "sealed" && !reduce && (
                    <div
                      className={s.grip}
                      style={{ top: -10, height: tearY + 84 }}
                      onPointerDown={onDown}
                      onPointerMove={onMove}
                      onPointerUp={release}
                      onPointerCancel={release}
                      onLostPointerCapture={() => drag.current && release()}
                    />
                  )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* the card */}
          <AnimatePresence>
            {(stage === "inpack" || stage === "facedown" || stage === "charging" || stage === "revealed") && (
              <motion.div
                key="card"
                className="relative z-10"
                style={{ perspective: 1400, width: cardW, y: cardY, touchAction: "none", ["--charge" as string]: stage === "inpack" ? 0.35 : undefined }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                onPointerDown={onPullDown}
                onPointerMove={onPullMove}
                onPointerUp={onPullUp}
                onPointerCancel={onPullUp}
              >
                {/* "pull up" cue above the peeking card; nudges while idle, fades as soon as you pull */}
                {stage === "inpack" && !reduce && (
                  <motion.div className={s.pullCue} style={{ opacity: hintO }} data-pulling={pulling ? "1" : undefined} aria-hidden>
                    <svg className={s.pullArrow} viewBox="0 0 12 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 27V3M1 8l5-5 5 5" />
                    </svg>
                    <span className="rounded-full bg-black/60 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.25)] backdrop-blur">
                      pull up
                    </span>
                  </motion.div>
                )}
                {/* charge-up glow, in the rarity colour */}
                <div
                  ref={glowEl}
                  className="pointer-events-none absolute -inset-6 rounded-[28px]"
                  style={{ background: `radial-gradient(closest-side, ${glow}, transparent)`, filter: "blur(22px)", opacity: stage === "revealed" ? (big ? 0.55 : 0.25) : 0.18, transition: stage === "revealed" ? "opacity .6s" : "none" }}
                />

                {/* seed posters orbiting the face-down card; they spiral in as you hold */}
                {face === "back" && !reduce && (
                  <div ref={orbitEl} className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden>
                    {posters.map((p, k) => (
                      <div
                        key={p.name + k}
                        className={`${s.duo} ${s.poster}`}
                        style={{ width: posterW, ["--da" as string]: k % 2 ? moon.a : sun.a, ["--db" as string]: k % 2 ? moon.b : sun.b, transform: "translate(-50%, -50%) scale(0)" }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {p.image && <img src={p.image} alt="" />}
                      </div>
                    ))}
                  </div>
                )}

                <motion.div className="relative z-10" style={{ rotateY: rotY, transformStyle: "preserve-3d" }}>
                  {face === "back" ? (
                    <div ref={jitterEl}>
                      <motion.button
                        ref={backEl}
                        type="button"
                        aria-label={reduce ? "Flip the card" : "Press and hold to mint your card (Space), or Enter to flip"}
                        className="block w-full touch-none select-none rounded-[16px] text-left outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                        whileHover={reduce ? undefined : { y: -4 }}
                        onClick={reduce ? flip : undefined}
                        onPointerDown={(e) => {
                          if (reduce) return;
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          startHold();
                        }}
                        onPointerUp={() => !reduce && charge.current.holding && flip()}
                        onPointerCancel={() => !reduce && charge.current.holding && flip()}
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        <CardBack card={card} crack={crack} />
                        {!reduce && <div ref={sweepEl} className={s.chargeFoil} aria-hidden />}
                      </motion.button>
                    </div>
                  ) : (
                    <motion.div initial={reduce ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
                      <FlipCard card={card} width={cardW} idle print={!reduce} />
                    </motion.div>
                  )}
                </motion.div>

                {/* shockwave */}
                {stage === "revealed" && !reduce && (
                  <motion.i
                    className="pointer-events-none absolute left-1/2 top-1/2 z-20 rounded-full"
                    style={{ width: cardW, height: cardW, marginLeft: -cardW / 2, marginTop: -cardW / 2, border: `2px solid ${glow}`, boxShadow: `0 0 40px ${glow}, inset 0 0 30px ${glow}` }}
                    initial={{ scale: 0.3, opacity: 1 }}
                    animate={{ scale: 2.6, opacity: 0 }}
                    transition={{ duration: 0.9, ease: [0.1, 0.8, 0.3, 1] }}
                  />
                )}

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
              <motion.div key="h1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-2">
                {!reduce && <p className="font-mono text-[11px] text-ink-3">pull the notch all the way across the top seam</p>}
                <button
                  type="button"
                  onClick={(e) => {
                    viaKeys.current = e.detail === 0; // keyboard-activated: move focus on to "Take card"
                    open();
                  }}
                  className={`${reduce ? "" : "sr-only focus-visible:not-sr-only"} rounded-full border border-white/25 bg-white/5 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-2 outline-none focus-visible:ring-2 focus-visible:ring-white/60`}
                >
                  Open pack
                </button>
              </motion.div>
            )}
            {stage === "inpack" && (
              <motion.div key="hp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-2">
                {!reduce && <p className="font-mono text-[11px] text-ink-3">swipe the card up and out of the pack</p>}
                <button
                  type="button"
                  onClick={takeCard}
                  autoFocus={viaKeys.current}
                  className={`${reduce ? "" : "sr-only focus-visible:not-sr-only"} rounded-full border border-white/25 bg-white/5 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-2 outline-none focus-visible:ring-2 focus-visible:ring-white/60`}
                >
                  Take card
                </button>
              </motion.div>
            )}
            {stage === "facedown" && (
              <motion.p key="h2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="font-mono text-[11px] text-ink-3">
                {reduce ? "tap the card" : "press & hold the card · space works too"}
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
                  <Sign g="sun" t={sun} />
                  <Sign g="moon" t={moon} />
                  <Sign g="rising" t={rising} />
                </div>
                <button
                  onClick={onDone}
                  autoFocus
                  className="group flex w-full items-center justify-center gap-2 rounded-full bg-accent px-6 py-3.5 font-display text-[16px] font-semibold text-paper shadow-[0_10px_40px_-10px_var(--accent)] transition-transform active:scale-[0.98]"
                >
                  See your receipts
                  <CursorArrow className="h-7 w-7" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Sign({ g, t }: { g: SigilKind; t: CardType }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className="h-2 w-2 rounded-full" style={{ background: `linear-gradient(135deg, ${t.a}, ${t.b})` }} />
      <Sigil kind={g} className="h-3.5 w-3.5 text-ink-3" /> {t.name}
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
          <TypeSigil glyph={sun.glyph} className="drop-shadow-[0_2px_18px_rgb(0_0_0/0.35)]" style={{ width: 22 * u, height: 22 * u }} />
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
