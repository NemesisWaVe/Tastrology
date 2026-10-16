"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fighters, isFighter, type Fighter } from "./data";

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

  const ready = a && b && a !== b;
  const col = (label: string, value: string | null, set: (k: string) => void, other: string | null) => (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">{label}</legend>
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
            className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition ${
              on ? "border-accent bg-accent-soft" : "border-line bg-card hover:border-ink-3"
            } ${taken ? "opacity-35" : ""}`}
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
      <div className="grid gap-6 sm:grid-cols-2">
        {col("Player one", a, setA, b)}
        {col("Player two", b, setB, a)}
      </div>
      <button
        type="button"
        disabled={!ready}
        onClick={() => router.push(`/vs?a=${a}&b=${b}`)}
        className="sticky bottom-4 rounded-full bg-accent px-6 py-4 font-display text-[17px] font-bold text-paper shadow-[0_10px_40px_-10px_#c6ff3d] transition enabled:hover:brightness-110 disabled:bg-paper-2 disabled:text-ink-3 disabled:shadow-none"
      >
        {ready ? "Start the battle" : "Pick two different tastes"}
      </button>
    </section>
  );
}
