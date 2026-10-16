"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useRef, type ReactNode } from "react";
import s from "./landing.module.css";

export const EASE = [0.16, 1, 0.3, 1] as const;

/** Words slide up out of a clipping mask, one after another. */
export function MaskedWords({
  text,
  className = "",
  wordClassName = "",
  delay = 0,
  stagger = 0.07,
  inView = false,
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
  stagger?: number;
  inView?: boolean;
}) {
  const words = text.split(" ");
  const anim = { y: "0%", rotate: 0 };
  return (
    <span className={className}>
      {words.map((w, i) => (
        <span key={i} className={s.mask}>
          <motion.span
            className={`inline-block will-change-transform ${wordClassName}`}
            initial={{ y: "110%", rotate: 4 }}
            {...(inView ? { whileInView: anim, viewport: { once: true, margin: "200px" } } : { animate: anim })}
            transition={{ duration: 0.9, ease: EASE, delay: delay + i * stagger }}
          >
            {w}
          </motion.span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

/** A button that leans toward the cursor. Falls back to a plain button for touch / reduced motion. */
export function Magnetic({
  children,
  className = "",
  strength = 0.15,
  ...rest
}: { children: ReactNode; className?: string; strength?: number } & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "style"
>) {
  const ref = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 16, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 16, mass: 0.4 });
  const ix = useSpring(0, { stiffness: 220, damping: 16 });
  const iy = useSpring(0, { stiffness: 220, damping: 16 });

  const move = (e: React.PointerEvent) => {
    if (reduce || e.pointerType !== "mouse" || rest.disabled) return;
    const r = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    // A subtle lean, capped so a pill never drifts into its neighbour.
    const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
    x.set(clamp(dx * strength, 8));
    y.set(clamp(dy * strength, 5));
    ix.set(dx * strength * 0.35);
    iy.set(dy * strength * 0.35);
  };
  const leave = () => {
    x.set(0);
    y.set(0);
    ix.set(0);
    iy.set(0);
  };

  return (
    <motion.button
      ref={ref}
      onPointerMove={move}
      onPointerLeave={leave}
      style={{ x: sx, y: sy }}
      whileTap={rest.disabled ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={className}
      {...rest}
    >
      <motion.span className="relative z-10 inline-flex items-center gap-[inherit]" style={{ x: ix, y: iy }}>
        {children}
      </motion.span>
    </motion.button>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-3">
      <span className="h-px w-8 bg-accent/70" />
      {children}
    </p>
  );
}

/** Fade-and-rise when scrolled into view. */
export function Reveal({ children, delay = 0, className = "", y = 24 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "200px" }}
      transition={{ duration: 0.9, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}
