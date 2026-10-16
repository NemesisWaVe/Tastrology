"use client";

import { useLayoutEffect, useRef, useState } from "react";

export type Vote = "up" | "down";

/** Editorial section header: optional mono kicker, big serif title, plain-language note. Sections vary which parts they use. */
export function SectionHead({ kicker, title, note, right }: { kicker?: string; title: React.ReactNode; note?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-3xl">
        {kicker && <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-accent">{kicker}</p>}
        <h2 className="font-serif text-[34px] leading-[0.98] tracking-[-0.01em] text-ink sm:text-[46px]">{title}</h2>
        {note && <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-ink-2">{note}</p>}
      </div>
      {right}
    </header>
  );
}

/** Small round thumbnail with a monogram fallback. */
export function Thumb({ src, name, size = 20, className = "" }: { src?: string; name: string; size?: number; className?: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad)
    return (
      <span className={`inline-grid shrink-0 place-items-center rounded-full bg-paper-2 font-serif text-ink-2 ${className}`} style={{ width: size, height: size, fontSize: size * 0.55 }}>
        {name[0]}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" onError={() => setBad(true)} className={`shrink-0 rounded-full object-cover ${className}`} style={{ width: size, height: size }} />
  );
}

/** Element width via ResizeObserver (0 until measured). */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Qloo's brand style lists occasionally contain the literal string "null". */
export const cleanStyle = (st?: string[]) => (st ?? []).filter((x) => x && x !== "null");
