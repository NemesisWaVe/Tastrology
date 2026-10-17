"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { forwardRef, useEffect, useRef } from "react";

/**
 * Stardust balance in the deck header (docs/design/burn.md §1). Burn particles fly into it; it pulses once and
 * counts up on a spring. Reduced motion: the number just changes.
 */
export const DustCounter = forwardRef<HTMLDivElement, { value: number; weekLeft: number | null; reduce: boolean }>(function DustCounter({ value, weekLeft, reduce }, ref) {
  const n = useMotionValue(value);
  const shown = useTransform(n, (v) => String(Math.round(v)));
  const scale = useMotionValue(1);
  const first = useRef(true);

  useEffect(() => {
    if (first.current || reduce) {
      first.current = false;
      n.set(value);
      return;
    }
    const a = animate(n, value, { type: "spring", stiffness: 70, damping: 18 });
    const b = animate(scale, [1, 1.14, 1], { duration: 0.5, ease: "easeOut" });
    return () => {
      a.stop();
      b.stop();
    };
  }, [value, reduce, n, scale]);

  return (
    <div ref={ref} className="inline-flex items-baseline gap-2 rounded-full border border-accent/30 bg-accent-soft/60 px-4 py-1.5" aria-live="polite">
      <motion.span style={{ scale }} className="inline-block font-display text-2xl font-semibold tabular-nums tracking-[-0.03em] text-accent">
        {shown}
      </motion.span>
      <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-2">Dust</span>
      {weekLeft !== null && <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">· {weekLeft} left this week</span>}
    </div>
  );
});
