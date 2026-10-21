"use client";

import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/sound";
import s from "./landing.module.css";

const ITEMS: { w: string; icon: React.ReactNode }[] = [
  {
    w: "birth chart",
    icon: (
      <>
        <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
        <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
      </>
    ),
  },
  {
    w: "purchase history",
    icon: (
      <>
        <path d="M4 2.5h8v11l-1.6-1-1.2 1-1.2-1-1.2 1-1.2-1L4 13.5z" />
        <path d="M6 6h4M6 8.5h4" />
      </>
    ),
  },
  {
    w: "40-question quiz",
    icon: (
      <>
        <path d="M3 4.5l1 1 1.8-2M3 9.5l1 1 1.8-2" />
        <path d="M8 4.5h5M8 9.5h5M8 13h5" />
      </>
    ),
  },
];
/** droplet directions (deg), uneven so a burst never looks stamped */
const DROPS = [8, 52, 95, 140, 188, 226, 270, 318];

/**
 * What other readings make you hand over, as soap bubbles that pop: on their own one by one once the row is seen,
 * or under a tap. Each bursts into droplets and leaves "no …" in its place, in the same footprint (both labels share
 * one grid cell), so nothing below jumps.
 */
export function NopeBubbles() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [popped, setPopped] = useState([false, false, false]);
  const pop = (i: number, byHand = false) =>
    setPopped((p) => {
      if (p[i]) return p;
      if (byHand) sfx("pop", { gain: 0.5 });
      const n = [...p];
      n[i] = true;
      return n;
    });
  useEffect(() => {
    if (!seen) return;
    if (reduce) {
      setPopped([true, true, true]);
      return;
    }
    const ts = ITEMS.map((_, i) => setTimeout(() => pop(i), 1300 + i * 650));
    return () => ts.forEach(clearTimeout);
  }, [seen, reduce]);
  const all = popped.every(Boolean);

  return (
    <div ref={ref} className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-3 max-[480px]:mt-6">
      <span className="mr-1 grid font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3 max-[480px]:hidden">
        <span className={s.stackSwap} data-off={all ? "1" : undefined}>Skip the</span>
        <span className={s.stackSwap} data-off={all ? undefined : "1"}>
          Skipped
        </span>
      </span>
      {ITEMS.map(({ w, icon }, i) => (
        <button
          key={w}
          type="button"
          className={s.bubble}
          data-popped={popped[i] ? "1" : undefined}
          onClick={() => pop(i, true)}
          aria-label={popped[i] ? `No ${w}` : `Pop ${w}`}
          style={{ "--f": `${i * -1.3}s` } as React.CSSProperties}
        >
          <span className={s.bubbleFilm} aria-hidden />
          <span className={s.bubbleWord}>
            <svg viewBox="0 0 16 16" className={s.nopeIcon} aria-hidden>
              {icon}
            </svg>
            {w}
          </span>
          <span className={s.bubbleNo}>
            <b>✓</b> no {w}
          </span>
          <span className={s.drops} aria-hidden>
            {DROPS.map((a, k) => (
              <i key={a} style={{ "--a": `${a + i * 17}deg`, "--d": `${18 + ((k * 7) % 11)}px` } as React.CSSProperties} />
            ))}
          </span>
        </button>
      ))}
    </div>
  );
}
