"use client";

import { CursorArrow } from "@/components/CursorArrow";
import { motion } from "motion/react";
import { useState } from "react";
import { SeedPicker, type Seed } from "@/components/SeedPicker";
import type { AgentRequest } from "@/lib/types";
import { EASE, Eyebrow, Magnetic, MaskedWords, Reveal } from "./primitives";

const BUDGETS: { v?: 1 | 2 | 3; label: string; hint: string }[] = [
  { v: undefined, label: "Any", hint: "no limit" },
  { v: 1, label: "$", hint: "high street" },
  { v: 2, label: "$$", hint: "mid" },
  { v: 3, label: "$$$", hint: "designer" },
];

const STEPS = [
  ["Add 3 to 8 favorites", "An album, a film, the book you lend out, a city. The more they differ, the sharper the read."],
  ["The agent looks them up", "Qloo knows what people who like your picks also like, across music, film, books and brands."],
  ["You get a card", "Sun, Moon, Rising, a rarity, and brands, each one tagged with the pick that earned it."],
];

export function BringYourOwn({ onStart }: { onStart: (req: AgentRequest) => void }) {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [budget, setBudget] = useState<1 | 2 | 3 | undefined>();
  const [goal, setGoal] = useState("");
  const need = Math.max(0, 3 - seeds.length);
  const ready = need === 0;

  const go = () => {
    if (!ready) return;
    onStart({
      seeds: seeds.map(({ id, name, kind }) => ({ id, name, kind })),
      budget,
      goal: goal.trim() || undefined,
    });
  };

  return (
    <section id="byo" className="relative scroll-mt-10 py-20 sm:py-28">
      <div className="relative mx-auto grid max-w-[1320px] gap-12 px-4 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:px-12">
        <div className="min-w-0">
          <Eyebrow>Bring your own taste</Eyebrow>
          <h2 className="mt-5 font-display text-[clamp(2.6rem,9vw,5.6rem)] font-bold leading-[0.9] tracking-[-0.045em]">
            <MaskedWords text="Type the stuff" inView className="block" />
            <MaskedWords text="you'd defend at a party." inView delay={0.12} wordClassName="font-serif font-normal italic text-ink-2" />
          </h2>

          <ol className="mt-10 space-y-6">
            {STEPS.map(([t, d], i) => (
              <Reveal key={t} delay={0.1 + i * 0.08}>
                <li className="flex gap-4">
                  <span className="mt-0.5 font-mono text-[11px] text-accent">{String(i + 1).padStart(2, "0")}</span>
                  <span>
                    <span className="block font-display text-lg font-semibold tracking-tight text-ink">{t}</span>
                    <span className="mt-1 block max-w-sm text-[14px] leading-relaxed text-ink-3">{d}</span>
                  </span>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>

        <Reveal className="min-w-0" delay={0.1}>
          <div className="relative rounded-[28px] border border-line bg-[linear-gradient(160deg,rgba(255,255,255,0.045),rgba(255,255,255,0.01))] p-4 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] sm:p-7">
            <div className="mb-5 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3">Your loves</p>
              <SlotMeter n={seeds.length} />
            </div>

            <SeedPicker seeds={seeds} onChange={setSeeds} />

            <div className="mt-7 grid gap-5 border-t border-line pt-6 sm:grid-cols-[auto_1fr]">
              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3">Budget</p>
                <div className="inline-flex rounded-full border border-line bg-black/30 p-1" role="radiogroup" aria-label="Budget">
                  {BUDGETS.map((b) => {
                    const on = budget === b.v;
                    return (
                      <button
                        key={b.label}
                        role="radio"
                        aria-checked={on}
                        title={b.hint}
                        onClick={() => setBudget(b.v)}
                        className={`relative rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${on ? "text-paper" : "text-ink-2 hover:text-ink"}`}
                      >
                        {on && <motion.span layoutId="budget-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
                        <span className="relative">{b.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="block min-w-0">
                <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3">
                  Dressing for <span className="normal-case tracking-normal text-ink-3/70">(optional)</span>
                </span>
                <input
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  maxLength={120}
                  placeholder="a gallery opening in Lisbon"
                  className="w-full rounded-full border border-line bg-black/30 px-4 py-2 text-[16px] text-ink outline-none transition placeholder:text-ink-3 focus:border-accent/70 sm:text-[14px]"
                />
              </label>
            </div>

            <Magnetic
              onClick={go}
              disabled={!ready}
              strength={0.15}
              className={`group mt-7 flex h-16 w-full items-center justify-center rounded-full text-[16px] font-semibold transition-colors ${
                ready ? "bg-accent text-paper shadow-[0_18px_50px_-14px_rgba(198,255,61,0.6)]" : "cursor-not-allowed bg-white/[0.04] text-ink-3"
              }`}
            >
              <span className="flex items-center gap-3">
                {ready ? "Mint my taste sign" : `Add ${need} more love${need === 1 ? "" : "s"}`}
                {ready ? (
                  <CursorArrow className="h-9 w-9 bg-paper text-accent" />
                ) : (
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-white/5">→</span>
                )}
              </span>
            </Magnetic>
            <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">No sign-up · minted in about 20 seconds</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function SlotMeter({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${n} of 8 loves added, 3 needed`}>
      {Array.from({ length: 8 }, (_, i) => (
        <motion.span
          key={i}
          className="h-1.5 rounded-full"
          animate={{
            width: i < n ? 18 : 8,
            backgroundColor: i < n ? (n >= 3 ? "#c6ff3d" : "#f3f1ec") : i < 3 ? "#3a3a44" : "#24242c",
          }}
          transition={{ duration: 0.4, ease: EASE }}
        />
      ))}
    </div>
  );
}
