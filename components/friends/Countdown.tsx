"use client";

import { useEffect, useRef, useState } from "react";

/** A live challenge's clock: m:ss and a draining bar, red in the last minute. Calls onEnd once when it runs out. */
export function Countdown({ ends, total = 5 * 60_000, onEnd, bar = true }: { ends: number; total?: number; onEnd?: () => void; bar?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);
  const left = Math.max(0, ends - now);
  useEffect(() => {
    if (left <= 0) {
      if (!fired.current) {
        fired.current = true;
        onEnd?.();
      }
      return;
    }
    const t = setTimeout(() => setNow(Date.now()), 1000 - (Date.now() % 1000) + 5);
    return () => clearTimeout(t);
  }, [now, left, onEnd]);
  const s = Math.ceil(left / 1000);
  const hot = s <= 60;
  const tone = hot ? "#ff7773" : "#c6ff3d";
  return (
    <span className="inline-flex items-center gap-2 align-middle" role="timer" aria-label={`${Math.floor(s / 60)} minutes ${s % 60} seconds left`}>
      {bar && (
        <span className="relative h-1 w-12 overflow-hidden rounded-full bg-white/[0.08]">
          <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${(left / total) * 100}%`, background: tone, boxShadow: `0 0 6px ${tone}` }} />
        </span>
      )}
      <span className={`font-mono text-[11px] tabular-nums ${hot ? "animate-pulse" : ""}`} style={{ color: tone }}>
        {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
      </span>
    </span>
  );
}
