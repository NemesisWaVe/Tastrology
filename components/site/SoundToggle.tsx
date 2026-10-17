"use client";

import { useEffect, useState } from "react";
import { sfx } from "@/lib/sound";
import { armSound, enableSound, soundOn } from "@/lib/soundEngine";

/** Quiet sound switch: mono label + a three-bar equalizer that breathes while sound is on. */
export function SoundToggle({ className = "" }: { className?: string }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(soundOn());
    armSound();
  }, []);

  const toggle = () => {
    const next = !on;
    enableSound(next);
    setOn(next);
    if (next) setTimeout(() => sfx("tap"), 60); // let the context resume first
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Turn sound off" : "Turn sound on"}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] transition hover:text-ink ${on ? "text-accent" : "text-ink-2"} ${className}`}
    >
      <span aria-hidden className="flex h-3 items-end gap-[2px]">
        {[0, 1, 2].map((k) => (
          <span
            key={k}
            className="w-[2px] origin-bottom rounded-full bg-current"
            style={{
              height: on ? "100%" : "30%",
              animation: on ? `sound-eq ${0.9 + k * 0.25}s ease-in-out ${k * 0.12}s infinite alternate` : undefined,
            }}
          />
        ))}
      </span>
      <span>Sound</span>
      <style>{`@keyframes sound-eq{from{transform:scaleY(.25)}to{transform:scaleY(1)}}@media (prefers-reduced-motion:reduce){[aria-pressed] span[style*="sound-eq"]{animation:none!important}}`}</style>
    </button>
  );
}
