"use client";

import { typeOf } from "@/lib/card";
import { KIND_ICON } from "@/components/SeedPicker";
import s from "./landing.module.css";

const SIGNS: [string, string][] = [
  ["☉", "Futuristic"],
  ["☽", "Floral"],
  ["↑", "Understated"],
  ["☉", "Vintage"],
  ["☽", "Grunge"],
  ["↑", "Old-money Luxe"],
  ["☉", "Whimsical"],
  ["☽", "Industrial"],
  ["↑", "Earthy"],
  ["☉", "Avant-garde"],
  ["☽", "Romantic"],
  ["↑", "Utility"],
  ["☉", "Tailored"],
  ["☽", "Bohemian"],
  ["↑", "Monochrome"],
];
const ROLE: Record<string, string> = { "☉": "Sun in", "☽": "Moon in", "↑": "Rising" };

const SEEDS: [string, string][] = [
  ["artist", "Phoebe Bridgers"],
  ["movie", "Past Lives"],
  ["videogame", "Hades"],
  ["place", "Kyoto"],
  ["tv_show", "Fleabag"],
  ["book", "The Secret History"],
  ["artist", "Frank Ocean"],
  ["movie", "Aftersun"],
  ["podcast", "Song Exploder"],
  ["videogame", "Disco Elysium"],
  ["tv_show", "The Bear"],
  ["place", "Copenhagen"],
  ["artist", "Charli xcx"],
  ["movie", "Spirited Away"],
  ["book", "Normal People"],
  ["videogame", "Stardew Valley"],
  ["artist", "SZA"],
  ["movie", "In the Mood for Love"],
];

export function Marquee() {
  return (
    <section aria-label="Taste signs people get" className="relative border-y border-line/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.015),transparent)] py-7 sm:py-9">
      <div className={s.marquee}>
        {[0, 1].map((k) => (
          <div key={k} className={s.track} style={{ "--dur": "70s" } as React.CSSProperties} aria-hidden={k === 1}>
            {SIGNS.map(([sym, name], i) => {
              const t = typeOf(name);
              return (
                <span key={i} className="flex shrink-0 items-center gap-4 pr-8 sm:gap-5 sm:pr-10">
                  <span
                    className="grid h-8 w-8 place-items-center rounded-full text-[13px] text-paper sm:h-10 sm:w-10 sm:text-[15px]"
                    style={{ background: `linear-gradient(135deg, ${t.a}, ${t.b})`, boxShadow: `0 0 30px -6px ${t.a}` }}
                  >
                    {sym}
                  </span>
                  <span className="whitespace-nowrap font-display text-[clamp(1.7rem,6vw,3.4rem)] font-semibold leading-none tracking-[-0.035em] text-ink">
                    <span className="mr-[0.25em] font-serif font-normal italic text-ink-3">{ROLE[sym]}</span>
                    {name}
                  </span>
                  <span className="pl-3 text-accent sm:pl-5">✦</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>

      <div className={`${s.marquee} mt-5 sm:mt-7`}>
        {[0, 1].map((k) => (
          <div key={k} className={`${s.track} ${s.reverse}`} style={{ "--dur": "55s" } as React.CSSProperties} aria-hidden={k === 1}>
            {SEEDS.map(([kind, name], i) => (
              <span
                key={i}
                className="mr-2.5 inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-white/[0.025] px-3.5 py-1.5 text-[13px] text-ink-2"
              >
                <span className="text-ink-3">{KIND_ICON[kind]}</span>
                <span className="whitespace-nowrap">{name}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
