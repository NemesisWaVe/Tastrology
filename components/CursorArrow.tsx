"use client";

import { motion, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef } from "react";

/**
 * Arrow chip that, while its button is hovered, aims at the cursor and leans toward it.
 * Circling the cursor spins it along (angles are unwrapped so it never jumps the long way round).
 */
export function CursorArrow({ className = "", rest = 0 }: { className?: string; rest?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const rot = useSpring(rest, { stiffness: 260, damping: 18, mass: 0.6 });
  const x = useSpring(0, { stiffness: 300, damping: 20 });
  const y = useSpring(0, { stiffness: 300, damping: 20 });

  useEffect(() => {
    const el = ref.current;
    const host = el?.closest<HTMLElement>("button, a, [role='button']");
    if (!el || !host || reduce) return;
    let last = rest;
    let active = false;
    let onArrow = false;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      // Track while over the button OR near the arrow, so it can aim past the button's edge.
      const near = Math.hypot(dx, dy) < 90 || host.contains(e.target as Node);
      if (!near) {
        if (active) leave();
        return;
      }
      active = true;
      // Directly on the arrow: one clockwise turn, then settle pointing north-east.
      if (Math.hypot(dx, dy) < r.width / 2) {
        if (!onArrow) {
          onArrow = true;
          const ne = -45;
          last = ne + Math.ceil((last + 360 - ne) / 360) * 360;
          rot.set(last);
          x.set(0);
          y.set(0);
        }
        return;
      }
      onArrow = false;
      const target = (Math.atan2(dy, dx) * 180) / Math.PI;
      // shortest path from the last angle, so fast circles keep spinning one way
      last += ((((target - last) % 360) + 540) % 360) - 180;
      rot.set(last);
      const d = Math.hypot(dx, dy) || 1;
      const pull = Math.min(6, d / 8);
      x.set((dx / d) * pull);
      y.set((dy / d) * pull);
    };
    function leave() {
      active = false;
      onArrow = false;
      last = rest + Math.round((last - rest) / 360) * 360; // settle without unwinding every turn
      rot.set(last);
      x.set(0);
      y.set(0);
    }
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [reduce, rest, rot, x, y]);

  return (
    <motion.span ref={ref} aria-hidden style={{ rotate: rot, x, y }} className={`grid place-items-center rounded-full ${className}`}>
      →
    </motion.span>
  );
}
