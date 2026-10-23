"use client";

import { useEffect, useState } from "react";
import { sfx } from "@/lib/sound";
import { armSound, enableSound, installClickPops, soundLocked, soundOn } from "@/lib/soundEngine";

/**
 * Quiet sound switch: mono label + a three-bar equalizer that breathes while sound is on. When sound is on but the
 * browser holds it (after a reload, or back from another app on iPhone) the bars stand still and pulse, and a tap
 * brings sound back instead of muting it.
 */
export function SoundToggle({ className = "" }: { className?: string }) {
  const [on, setOn] = useState(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    installClickPops();
    armSound();
    const sync = () => {
      setOn(soundOn());
      setHeld(soundLocked());
    };
    sync();
    window.addEventListener("tastrology:sound", sync);
    const iv = setInterval(sync, 700); // notice a tap anywhere unlocking it
    return () => {
      window.removeEventListener("tastrology:sound", sync);
      clearInterval(iv);
    };
  }, []);

  const playing = on && !held;
  const toggle = () => {
    if (on && held) {
      enableSound(true);
      setHeld(false);
      setTimeout(() => sfx("tap"), 60);
      return;
    }
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
      aria-label={held ? "Sound is paused: tap to hear it" : on ? "Turn sound off" : "Turn sound on"}
      className={`inline-flex shrink-0 whitespace-nowrap min-h-11 min-w-11 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] transition hover:text-ink ${on ? "text-accent" : "text-ink-2"} ${on && held ? "animate-pulse" : ""} ${className}`}
    >
      <span aria-hidden className="flex h-3 items-end gap-[2px]">
        {[0, 1, 2].map((k) => (
          <span
            key={k}
            className="w-[2px] origin-bottom rounded-full bg-current"
            style={{
              height: playing ? "100%" : on ? "55%" : "30%",
              animation: playing ? `sound-eq ${0.9 + k * 0.25}s ease-in-out ${k * 0.12}s infinite alternate` : undefined,
            }}
          />
        ))}
      </span>
      <span className="hidden sm:inline">Sound</span>
      <style>{`@keyframes sound-eq{from{transform:scaleY(.25)}to{transform:scaleY(1)}}@media (prefers-reduced-motion:reduce){[aria-pressed] span[style*="sound-eq"]{animation:none!important}}`}</style>
    </button>
  );
}
