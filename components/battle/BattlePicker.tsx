"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sfx } from "@/lib/sound";
import { Sky } from "@/components/reveal/Sky";
import { skyState } from "@/components/reveal/traceModel";
import { fighters, isFighter, type Fighter } from "./data";
import { VsLens } from "./Galaxies";
import g from "./galaxy.module.css";

/** Same side colours as the arena: player one lime, player two violet. */
const COL = { a: "#c6ff3d", b: "#d875ff" } as const;
const OPEN_SKY = skyState([], "");

/** Choose two tastes. Shown when /vs is opened without both params. */
export function BattlePicker({ initialA, initialB }: { initialA?: string | null; initialB?: string | null }) {
  const router = useRouter();
  const [list, setList] = useState<Fighter[]>([]);
  const [a, setA] = useState<string | null>(isFighter(initialA ?? null) ? initialA! : null);
  const [b, setB] = useState<string | null>(isFighter(initialB ?? null) ? initialB! : null);

  useEffect(() => {
    const l = fighters();
    setList(l);
    // "me" only counts if a reading is actually saved on this device.
    if (a === "me" && !l.some((f) => f.key === "me")) setA(null);
  }, [a]);

  const reduce = useReducedMotion() ?? false;
  const ready = Boolean(a && b && a !== b);
  const col = (label: string, value: string | null, set: (k: string) => void, other: string | null, c: string) => (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 10px ${c}` }} />
        {label}
      </legend>
      {list.map((f) => {
        const on = value === f.key;
        const taken = other === f.key;
        return (
          <button
            key={f.key}
            type="button"
            disabled={taken}
            aria-pressed={on}
            onClick={() => set(f.key)}
            className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left backdrop-blur-md transition duration-300 ${
              on ? "" : "border-line bg-card/60 hover:border-ink-3"
            } ${taken ? "opacity-35" : ""}`}
            style={on ? { borderColor: c, background: `color-mix(in srgb, ${c} 12%, transparent)`, boxShadow: `0 0 0 1px ${c}55, 0 12px 40px -14px ${c}` } : undefined}
          >
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-paper-2 text-[20px]">
              {f.emoji}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold text-ink">{f.name}</span>
              <span className="block truncate text-[12.5px] text-ink-3">{f.blurb}</span>
            </span>
          </button>
        );
      })}
    </fieldset>
  );

  return (
    <div className="relative isolate min-h-screen w-full overflow-x-clip">
      <Sky f={OPEN_SKY} reduce={reduce} fixed quiet drawn dim={0.7} />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-[5]">
        <span className={`${g.nebula} ${g.nebulaA}`} data-on={Boolean(a)} style={{ ["--c" as string]: COL.a }} />
        <span className={`${g.nebula} ${g.nebulaB}`} data-on={Boolean(b)} style={{ ["--c" as string]: COL.b }} />
      </div>
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Taste battle</p>
        <h1 className="font-display text-[clamp(34px,9vw,56px)] font-bold leading-[0.95] tracking-tight">
          Two tastes walk in. <span className="font-serif font-normal italic text-ink-2">One joint sign walks out.</span>
        </h1>
        <p className="max-w-xl text-[15px] text-ink-2">
          Four rounds judged on Qloo data, a compatibility score with receipts, and a sign plus a crossover brand you both get to post. We roast the taste, never the person.
        </p>
      </header>
      <div className="relative grid gap-6 sm:grid-cols-2 sm:gap-16">
        {col("Player one", a, setA, b, COL.a)}
        <div aria-hidden className={`${g.pickLens} pointer-events-none relative mx-auto -my-2 h-16 w-16 sm:absolute sm:left-1/2 sm:top-1/2 sm:my-0 sm:-translate-x-1/2 sm:-translate-y-1/2`} data-on={ready}>
          <VsLens size={64} label="VS" />
        </div>
        {col("Player two", b, setB, a, COL.b)}
      </div>
      <button
        type="button"
        disabled={!ready}
        onClick={() => {
          sfx("tap");
          router.push(`/vs?a=${a}&b=${b}`);
        }}
        className="sticky bottom-4 rounded-full bg-accent px-6 py-4 font-display text-[17px] font-bold text-paper shadow-[0_10px_40px_-10px_#c6ff3d] transition enabled:hover:brightness-110 disabled:bg-paper-2 disabled:text-ink-3 disabled:shadow-none"
      >
        {ready ? "Collide them" : "Pick two different tastes"}
      </button>
    </section>
    </div>
  );
}
