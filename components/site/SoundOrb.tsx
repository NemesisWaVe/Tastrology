"use client";

import { useEffect, useState } from "react";
import { sfx } from "@/lib/sound";
import { enableSound, soundLocked, soundOn } from "@/lib/soundEngine";

/**
 * The landing's sound invitation: while sound is off, a softly pulsing star that says the sky has a sound;
 * once on, it settles into a small breathing equalizer you can tap to mute. Synced with every other switch.
 */
export function SoundOrb() {
  const [on, setOn] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const sync = () => {
      setOn(soundOn());
      setLocked(soundLocked());
    };
    sync();
    window.addEventListener("tastrology:sound", sync);
    const iv = setInterval(sync, 600); // notice when a click unlocks audio
    return () => {
      window.removeEventListener("tastrology:sound", sync);
      clearInterval(iv);
    };
  }, []);
  if (on === null) return null;
  const toggle = () => {
    if (on && locked) {
      enableSound(true); // resume after a reload
      setTimeout(() => sfx("shimmer", { gain: 0.6 }), 80);
      return;
    }
    enableSound(!on);
    if (!on) setTimeout(() => sfx("shimmer", { gain: 0.6 }), 80);
  };
  return (
    <button
      type="button"
      data-nopop
      data-orb
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Turn sound off" : "Turn sound on"}
      className={`group fixed right-4 top-16 z-[60] md:right-6 md:top-[72px] flex items-center gap-3 rounded-full border backdrop-blur-md transition-all duration-500 ${
        on && !locked ? "border-accent/30 bg-black/40 p-2.5" : "border-accent/50 bg-black/55 py-2.5 pl-3 pr-5 shadow-[0_0_40px_rgba(198,255,61,0.18)]"
      }`}
    >
      <span className="relative grid h-7 w-7 place-items-center">
        {(!on || locked) && <span className="absolute inset-0 animate-ping rounded-full bg-accent/30" />}
        <span className={`relative grid h-7 w-7 place-items-center rounded-full ${on ? "bg-accent/15" : "bg-accent/25"}`}>
          {on ? (
            <span className="flex h-3 items-end gap-[2px]" aria-hidden>
              {[0, 1, 2].map((k) => (
                <span key={k} className="w-[2px] origin-bottom rounded-full bg-accent" style={{ height: "100%", animation: `sound-eq ${0.9 + k * 0.25}s ease-in-out ${k * 0.12}s infinite alternate` }} />
              ))}
            </span>
          ) : (
            <span className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_12px_4px_rgba(198,255,61,0.7)]" />
          )}
        </span>
      </span>
      {(!on || locked) && (
        <span className="text-left leading-tight">
          <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-accent">{locked ? "sound on" : "sound off"}</span>
          <span className="block text-[13px] font-semibold text-ink">{locked ? "Tap to hear the sky" : "Unmute the universe"}</span>
        </span>
      )}
    </button>
  );
}
