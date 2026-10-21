"use client";

import type { EntityKind } from "@/lib/types";
import { CursorArrow } from "@/components/CursorArrow";
import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { KIND_ICON, KIND_LABEL, SeedPicker, type Seed } from "@/components/SeedPicker";
import { ROLL_ODDS } from "@/lib/odds";
import { loadDraft, saveDraft } from "@/lib/authBridge";
import type { AgentRequest } from "@/lib/types";
import { EASE, Eyebrow, Magnetic, MaskedWords, Reveal } from "./primitives";
import s from "./landing.module.css";

const BUDGETS: { v?: 1 | 2 | 3; label: string; hint: string }[] = [
  { v: undefined, label: "Any", hint: "no limit" },
  { v: 1, label: "$", hint: "high street" },
  { v: 2, label: "$$", hint: "mid" },
  { v: 3, label: "$$$", hint: "designer" },
];


export function BringYourOwn({ onStart }: { onStart: (req: AgentRequest) => void }) {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [budget, setBudget] = useState<1 | 2 | 3 | undefined>();
  const [goal, setGoal] = useState("");
  // Budget and occasion are refinements, not the first ask: folded away until wanted (or restored from a draft).
  const [tune, setTune] = useState(false);
  // Typed picks survive a sign-up, a reload or a closed tab: restored once, then saved on every change.
  const restored = useRef(false);
  useEffect(() => {
    const d = loadDraft<{ seeds?: Seed[]; budget?: 1 | 2 | 3; goal?: string }>();
    if (d?.seeds?.length) setSeeds(d.seeds);
    if (d?.budget) setBudget(d.budget);
    if (d?.goal) setGoal(d.goal);
    if (d?.budget || d?.goal) setTune(true);
    restored.current = true;
  }, []);
  useEffect(() => {
    if (restored.current) saveDraft({ seeds, budget, goal });
  }, [seeds, budget, goal]);
  // Vibes (lib/vibes.ts) ride along with named loves: at least 1 named thing, 3 picks in all.
  const named = seeds.filter((s) => s.kind !== "vibe");
  const vibes = seeds.filter((s) => s.kind === "vibe");
  const need = Math.max(0, 3 - seeds.length, 1 - named.length);
  const ready = need === 0;
  // the card lights up while it's on screen: this is the one place a skimmer should land
  const stage = useRef<HTMLDivElement>(null);
  const seen = useInView(stage, { amount: 0.35 });

  const go = () => {
    if (!ready) return;
    onStart({
      seeds: named.map(({ id, name, kind }) => ({ id, name, kind: kind as EntityKind })),
      ...(vibes.length ? { vibes: vibes.map(({ id, name }) => ({ id, name })) } : {}),
      budget,
      goal: goal.trim() || undefined,
    });
  };

  return (
    <section id="byo" className="relative scroll-mt-10 py-20 sm:py-28">
      <div className="relative mx-auto grid grid-cols-1 max-w-[1320px] gap-12 px-4 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:px-12">
        <div className="min-w-0">
          <Eyebrow>Bring your own taste</Eyebrow>
          <h2 className="mt-5 font-display text-[clamp(2.6rem,9vw,5.6rem)] font-bold leading-[0.9] tracking-[-0.045em]">
            <MaskedWords text="Type the stuff" inView className="block" />
            <MaskedWords text="you'd defend at a party." inView delay={0.12} wordClassName="font-serif font-normal italic text-ink-2" />
          </h2>

          <Ledger seeds={seeds} ready={ready} />
        </div>

        <Reveal className="relative min-w-0" delay={0.1}>
          {/* spotlight behind the card */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -inset-x-10 -inset-y-16 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(198,255,61,0.10),rgba(131,255,247,0.05)_55%,transparent)]"
            animate={{ opacity: seen ? 1 : 0, scale: seen ? 1 : 0.9 }}
            transition={{ duration: 1.2, ease: EASE }}
          />
          <div
            ref={stage}
            className="lovesStage relative rounded-[28px]"
            data-live={seen && !ready ? "1" : undefined}
            data-ready={ready ? "1" : undefined}
          >
          {/* where to begin, and how far along you are: a tab grown out of the panel's top edge, one pip per pick */}
          <div className={`startTab absolute bottom-full left-5 z-10 flex items-center gap-3 px-4 pb-2 pt-2.5 sm:left-7 ${ready ? "startTabReady" : ""}`}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={ready ? "ready" : seeds.length ? "going" : "start"}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25, ease: EASE }}
                className={`font-mono text-[10.5px] font-semibold uppercase tracking-[0.2em] ${ready ? "text-paper" : "startInk"}`}
              >
                {ready ? "Ready · mint it" : seeds.length ? "Keep going" : "Start here"}
              </motion.span>
            </AnimatePresence>
            <span className="flex items-center gap-1.5" aria-label={`${Math.min(seeds.length, 3)} of 3 picks`}>
              {[0, 1, 2].map((i) => (
                <span key={i} className="startPip" data-on={seeds.length > i ? "1" : undefined} style={{ ["--pip" as string]: ["#ffed5f", "#83fff7", "#d875ff"][i] }} />
              ))}
            </span>
          </div>
          <div className="relative rounded-[28px] border border-line bg-[linear-gradient(160deg,rgba(24,24,32,0.97),rgba(10,10,14,0.97))] p-4 pt-7 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] sm:p-7">
            <div className="mb-5 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3">Your loves</p>
              <SlotMeter n={seeds.length} />
            </div>

            <SeedPicker seeds={seeds} onChange={setSeeds} />

            <button
              type="button"
              onClick={() => setTune((t) => !t)}
              aria-expanded={tune}
              className="mt-6 flex w-full items-center justify-between border-t border-line pt-5 text-left font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3 transition hover:text-ink-2"
            >
              <span>
                Fine-tune <span className="normal-case tracking-normal text-ink-3/70">· budget, occasion (optional)</span>
              </span>
              <span className={`text-[14px] transition-transform ${tune ? "rotate-45" : ""}`} aria-hidden>
                +
              </span>
            </button>
            {tune && (
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-[auto_1fr]">
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
            )}

            <Magnetic
              onClick={go}
              disabled={!ready}
              strength={0.15}
              className={`group relative mt-7 flex h-16 w-full items-center justify-center overflow-hidden rounded-full text-[16px] font-semibold transition-colors ${
                ready ? "bg-accent text-paper shadow-[0_18px_50px_-14px_rgba(198,255,61,0.6)]" : "border border-line bg-white/[0.03] text-ink-2"
              }`}
            >
              {/* not a dead grey button: it fills as loves go in, so it reads as progress toward the card */}
              {!ready && (
                <motion.span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-accent/15"
                  animate={{ width: `${(Math.min(seeds.length, 3) / 3) * 100}%` }}
                  transition={{ duration: 0.5, ease: EASE }}
                />
              )}
              <span className="relative flex items-center gap-3">
                {ready ? "Mint my taste sign" : named.length < 1 && seeds.length >= 3 ? "Add one thing by name" : seeds.length === 0 ? "Pick 3 things you love" : `${need} more to mint`}
                {ready ? (
                  <CursorArrow className="h-9 w-9 bg-paper text-accent" />
                ) : (
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-white/5">→</span>
                )}
              </span>
            </Magnetic>
            <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">No sign-up · minted in about 20 seconds</p>
          </div>
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

/**
 * What happens to the picks, live: each step lights as the picker gets there. The pairs count is the real work the
 * agent does (every pick is cross-read against every other), and the card's slots stay sealed until mint.
 */
function Ledger({ seeds, ready }: { seeds: Seed[]; ready: boolean }) {
  const n = seeds.length;
  const kinds = [...new Set(seeds.map((x) => x.kind))];
  const pairs = (n * (n - 1)) / 2;
  const secret = ROLL_ODDS.find((o) => o.tier === "secret")?.p ?? 0;
  const steps = [
    {
      on: n > 0,
      done: ready,
      t: "Your picks",
      body: n ? (
        <span className="flex flex-wrap gap-1.5">
          {kinds.map((k) => (
            <span key={k} className={s.ledgerTag}>
              <i>{KIND_ICON[k] ?? "✦"}</i>
              {k === "vibe" ? "Vibe" : KIND_LABEL[k] ?? k}
            </span>
          ))}
          <span className={s.ledgerNote}>{ready ? `${n} in, ${kinds.length} domain${kinds.length === 1 ? "" : "s"}` : `${n} of 3`}</span>
        </span>
      ) : (
        "An album, a film, a city, a vibe. The more they differ, the sharper the read."
      ),
    },
    {
      on: n > 1,
      done: ready,
      t: "Cross-read on Qloo",
      body:
        n > 1 ? (
          <span className="font-mono text-[12px] tracking-wide text-ink-2">
            <b className="text-ink">{pairs}</b> pair{pairs === 1 ? "" : "s"} compared · tags, audiences, brand affinity
          </span>
        ) : (
          "Every pick is checked against every other one, across music, film, books, places and brands."
        ),
    },
    {
      on: ready,
      done: false,
      t: "Your card",
      body: (
        <span className="flex flex-wrap items-center gap-1.5">
          {["Sun", "Moon", "Rising"].map((x) => (
            <span key={x} className={s.ledgerSlot} data-on={ready ? "1" : undefined}>
              {x} <i>{ready ? "✦" : "?"}</i>
            </span>
          ))}
          <span className={s.ledgerNote}>{Math.round(secret * 1000) / 10}% roll Secret</span>
        </span>
      ),
    },
  ];
  return (
    <ol className={`${s.ledger} mt-10`}>
      {steps.map((x, i) => (
        <li key={x.t} data-on={x.on ? "1" : undefined} data-done={x.done ? "1" : undefined}>
          <span className={s.ledgerDot}>{x.done ? "✓" : String(i + 1).padStart(2, "0")}</span>
          <span className="min-w-0">
            <span className="block font-display text-lg font-semibold tracking-tight text-ink">{x.t}</span>
            <span className="mt-1.5 block max-w-sm text-[14px] leading-relaxed text-ink-3">{x.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
