"use client";

import { animate, motion, useMotionValue, useMotionValueEvent, useTransform, type AnimationPlaybackControls } from "motion/react";
import { useRef } from "react";
import { sfx } from "@/lib/sound";

/** How long the button has to be held. Letting go early rewinds the ring. */
export const HOLD_MS = 1600;
const W = 176;
const H = 40;

/**
 * Hold-to-burn (docs/design/burn.md §1). The hold is the confirm: a lime ring fills around the pill over HOLD_MS.
 * Pointer, touch and keyboard (hold Space or Enter). `onProgress` drives the card's heat; `onBurn` fires once at 100%.
 */
export function BurnButton({
  label = "Hold to burn",
  onProgress,
  onBurn,
  disabled = false,
}: {
  label?: string;
  onProgress?: (p: number) => void;
  onBurn: () => void;
  disabled?: boolean;
}) {
  const p = useMotionValue(0);
  const offset = useTransform(p, (v) => 1 - v);
  const ctl = useRef<AnimationPlaybackControls | null>(null);
  const tick = useRef(0);
  const fired = useRef(false);

  useMotionValueEvent(p, "change", (v) => {
    onProgress?.(v);
    // A light tick at 25 / 50 / 75 % where vibration exists (Android); silently nothing elsewhere.
    const t = Math.floor(v * 4);
    if (t > tick.current && t < 4) {
      tick.current = t;
      buzz(12);
      sfx("tick", { gain: 0.6 + t * 0.2 });
    }
  });

  const start = () => {
    if (disabled || fired.current) return;
    ctl.current?.stop();
    ctl.current = animate(p, 1, {
      duration: (HOLD_MS / 1000) * (1 - p.get()),
      ease: "linear",
      onComplete: () => {
        if (fired.current) return;
        fired.current = true;
        buzz(40);
        onBurn();
      },
    });
  };
  const cancel = () => {
    if (fired.current) return;
    ctl.current?.stop();
    tick.current = 0;
    ctl.current = animate(p, 0, { duration: 0.35, ease: "easeOut" });
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        start();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") cancel();
      }}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={`${label}. Hold for two seconds. This can't be undone.`}
      className="relative select-none rounded-full font-mono text-[11px] uppercase tracking-[0.2em] text-ink transition-colors hover:text-accent disabled:opacity-40"
      style={{ width: W, height: H, touchAction: "none", WebkitTouchCallout: "none" }}
    >
      <svg aria-hidden viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <rect x={0.75} y={0.75} width={W - 1.5} height={H - 1.5} rx={(H - 1.5) / 2} fill="none" stroke="var(--line)" strokeWidth={1.5} />
        <motion.rect
          x={0.75}
          y={0.75}
          width={W - 1.5}
          height={H - 1.5}
          rx={(H - 1.5) / 2}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1 1"
          style={{ strokeDashoffset: offset, filter: "drop-shadow(0 0 6px rgb(198 255 61 / 0.55))" }}
        />
      </svg>
      <span className="relative">{label}</span>
    </button>
  );
}

function buzz(ms: number) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
  } catch {}
}
