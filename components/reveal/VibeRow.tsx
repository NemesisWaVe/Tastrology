"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * The vibes picked next to the loves, as a quiet row under the reading: a small rainbow orb, the name in the same
 * type as the loves, and the kind line under it ("vibe · via X"). It sits under the scene, in the page's flow, so it
 * never lands on a love's label.
 */
export function VibeRow({ vibes, hidden = false }: { vibes: { name: string; via: string[] }[]; hidden?: boolean }) {
  const reduce = useReducedMotion() ?? false;
  if (!vibes.length) return null;
  return (
    <div
      className={`pointer-events-none mt-2 flex w-full max-w-[480px] justify-center gap-6 transition-opacity duration-500 ${hidden ? "opacity-0" : "opacity-100"}`}
    >
      {vibes.slice(0, 2).map((v, i) => (
        <motion.div
          key={v.name}
          className="flex min-w-0 max-w-[45%] items-center gap-2"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: reduce ? 0 : 0.3 + i * 0.12 }}
        >
          <span
            aria-hidden
            className={`h-3 w-3 shrink-0 rounded-full ${reduce ? "" : "[animation:spin_6s_linear_infinite]"}`}
            style={{
              background: "conic-gradient(#ff7ab6, #ffd36e, #c6ff3d, #6ee7ff, #b18cff, #ff7ab6)",
              boxShadow: "0 0 10px rgb(198 255 61 / .25)",
            }}
          />
          <span className="min-w-0 text-left">
            <span className="block truncate text-[11px] font-medium leading-tight text-ink-2">{v.name}</span>
            <span className="block truncate font-mono text-[8px] uppercase tracking-[0.18em] text-ink-3 sm:text-[9px]">
              vibe{v.via.length ? ` · via ${v.via[0]}` : ""}
            </span>
          </span>
        </motion.div>
      ))}
    </div>
  );
}
