"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { CardData } from "@/lib/card";
import { CardBack, HoloCard } from "./HoloCard";

const norm = (deg: number) => ((deg % 360) + 360) % 360;
const showsBack = (deg: number) => {
  const m = norm(deg);
  return m >= 90 && m <= 270;
};

/**
 * The holo card with both faces: front (HoloCard, foil intact) and the print-grade back.
 * Turn it like a real card: a horizontal drag rotates it 1:1 around Y (the back shows past 90deg), release
 * springs to the nearest face and a flick carries it over. Double-tap (or the "Flip" chip) is a quick flip;
 * a single tap does nothing. Which face is drawn is decided from the angle itself, so a 180deg turn always
 * lands on the back even if an ancestor flattens the 3D context (filter / overflow / opacity).
 * Controlled (`flipped` + `onFlippedChange`) or uncontrolled.
 */
export function FlipCard({
  card,
  width = 340,
  idle = true,
  print = false,
  flipped,
  onFlippedChange,
  flipButton = true,
  className = "",
}: {
  card: CardData;
  width?: number;
  idle?: boolean;
  print?: boolean;
  flipped?: boolean;
  onFlippedChange?: (back: boolean) => void;
  flipButton?: boolean;
  className?: string;
}) {
  const [own, setOwn] = useState(false);
  const isBack = flipped ?? own;
  const reduce = useReducedMotion();
  const rot = useMotionValue(isBack ? 180 : 0);
  const target = useRef(isBack ? 180 : 0);
  const frontVis = useTransform(rot, (r) => (showsBack(r) ? "hidden" : "visible"));
  const backVis = useTransform(rot, (r) => (showsBack(r) ? "visible" : "hidden"));

  const report = (back: boolean) => {
    if (flipped === undefined) setOwn(back);
    if (back !== isBack) onFlippedChange?.(back);
  };
  const go = (to: number, velocity = 0) => {
    target.current = to;
    if (reduce) rot.set(to);
    else animate(rot, to, { type: "spring", stiffness: 170, damping: 19, velocity });
    report(showsBack(to));
  };
  const flip = () => go(target.current + (rot.get() >= target.current ? 180 : -180));

  // External changes (button, results "Back" toggle): turn to the nearest angle showing the requested face.
  useEffect(() => {
    if (showsBack(target.current) === isBack) return;
    const r = rot.get();
    let to = Math.round(r / 180) * 180;
    if (showsBack(to) !== isBack) to += r >= to ? 180 : -180;
    target.current = to;
    if (reduce) rot.set(to);
    else animate(rot, to, { type: "spring", stiffness: 170, damping: 19 });
  }, [isBack, reduce, rot]);

  const g = useRef<{ x: number; y: number; r0: number; turning: boolean; id: number; hist: { x: number; t: number }[] } | null>(null);
  const lastTap = useRef(0);
  const degPerPx = 180 / (width * 1.05);

  return (
    <div className={`relative ${className}`} style={{ width, perspective: 1600 }} data-flipped={isBack ? "1" : undefined}>
      <motion.div
        className="relative select-none"
        style={{ rotateY: rot, transformStyle: "preserve-3d", touchAction: "pan-y", cursor: "grab" }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          rot.stop();
          g.current = { x: e.clientX, y: e.clientY, r0: rot.get(), turning: false, id: e.pointerId, hist: [{ x: e.clientX, t: e.timeStamp }] };
        }}
        onPointerMove={(e) => {
          const s = g.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (!s.turning) {
            if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return;
            s.turning = true;
            try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {} // pointer may already be gone
          }
          rot.set(s.r0 + dx * degPerPx);
          s.hist.push({ x: e.clientX, t: e.timeStamp });
          if (s.hist.length > 6) s.hist.shift();
        }}
        onPointerUp={(e) => {
          const s = g.current;
          g.current = null;
          if (!s) return;
          if (!s.turning) {
            if (Math.hypot(e.clientX - s.x, e.clientY - s.y) >= 6) return;
            // single tap: harmless. double tap: quick flip.
            if (e.timeStamp - lastTap.current < 320) {
              lastTap.current = 0;
              flip();
            } else lastTap.current = e.timeStamp;
            return;
          }
          const h = s.hist;
          const dt = Math.max(1, h[h.length - 1].t - h[0].t);
          const vel = ((h[h.length - 1].x - h[0].x) / dt) * 1000 * degPerPx; // deg/s
          if (reduce || Math.abs(vel) < 900) {
            const projected = rot.get() + vel * 0.12; // a flick carries it over
            go(Math.round(projected / 180) * 180, vel);
            return;
          }
          // A hard fling: real momentum. The card coasts through several turns (more speed, more turns,
          // capped at 4) and eases onto a clean face, like spinning a real card on a table.
          const coast = Math.max(-1440, Math.min(1440, vel * 0.45));
          const to = Math.round((rot.get() + coast) / 180) * 180;
          target.current = to;
          animate(rot, to, { type: "inertia", velocity: vel, power: 0.8, timeConstant: 520, modifyTarget: () => to });
          report(showsBack(to));
        }}
        onPointerCancel={() => {
          if (g.current?.turning) go(Math.round(rot.get() / 180) * 180);
          g.current = null;
        }}
      >
        <motion.div style={{ visibility: frontVis, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }} aria-hidden={isBack}>
          <HoloCard card={card} width={width} idle={idle} print={print} />
        </motion.div>
        <motion.div
          className="absolute inset-0"
          style={{ visibility: backVis, rotateY: 180, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
          aria-hidden={!isBack}
        >
          <CardBack card={card} />
        </motion.div>
      </motion.div>
      {flipButton && (
        <button
          type="button"
          onClick={flip}
          aria-pressed={isBack}
          aria-label={isBack ? "Show the front of the card" : "Show the back of the card"}
          className="absolute -right-2 -top-3 z-20 rounded-full border border-white/25 bg-black/70 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-white shadow-[0_6px_20px_-6px_rgb(0_0_0/0.8)] backdrop-blur transition hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          Flip ⟲
        </button>
      )}
    </div>
  );
}
