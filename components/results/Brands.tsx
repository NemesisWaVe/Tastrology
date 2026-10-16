"use client";

import type { BrandMatch, QEntity } from "@/lib/types";
import { Thumb, cleanStyle, type Vote } from "./ui";

export function BrandCard({
  b,
  i,
  seeds,
  vote,
  onVote,
}: {
  b: BrandMatch;
  i: number;
  seeds: QEntity[];
  vote?: Vote;
  onVote: (id: string, v: Vote | null) => void;
}) {
  const style = cleanStyle(b.entity.style).slice(0, 3);
  const seed = (id: string) => seeds.find((s) => s.id === id);
  const aff = Math.round(b.affinity * 100);
  return (
    <article
      className={`rise group relative flex flex-col overflow-hidden rounded-[22px] border p-4 transition duration-300 sm:p-5 ${
        vote === "up"
          ? "border-accent/70 bg-[linear-gradient(180deg,rgba(198,255,61,0.07),transparent_45%),var(--card)] shadow-[0_0_0_1px_rgba(198,255,61,0.25),0_20px_50px_-30px_rgba(198,255,61,0.6)]"
          : vote === "down"
            ? "border-bad/30 bg-card saturate-0 [&>*:not(:first-child)]:opacity-40 [&>*:first-child>*:not(:last-child)]:opacity-40"
            : "border-line bg-card hover:border-ink-3/60"
      }`}
      style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
    >
      <div className="flex items-start gap-3.5">
        <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
          {b.entity.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.entity.image} alt={`${b.entity.name} logo`} className="h-full w-full object-contain" loading="lazy" />
          ) : (
            <span className="font-serif text-3xl text-black">{b.entity.name[0]}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
            <span>{b.category}</span>
            {b.entity.tier ? (
              <span className="tracking-normal text-ink-2">
                {"$".repeat(b.entity.tier)}
                <span className="text-ink-3/50">{"$".repeat(3 - b.entity.tier)}</span>
              </span>
            ) : null}
            {b.side ? <span className="rounded-full border border-warn/40 bg-warn-soft px-1.5 py-px tracking-[0.12em] text-warn">☽ side B</span> : null}
          </p>
          <h3 className="mt-1 truncate font-serif text-[27px] leading-[1.02]">{b.entity.name}</h3>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <VoteBtn on={vote === "up"} tone="up" label={`More like ${b.entity.name}`} onClick={() => onVote(b.entity.id, vote === "up" ? null : "up")} />
          <VoteBtn on={vote === "down"} tone="down" label={`Less like ${b.entity.name}`} onClick={() => onVote(b.entity.id, vote === "down" ? null : "down")} />
        </div>
      </div>

      <div className="mt-4 flex items-end gap-3">
        <p className="font-display text-[34px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
          .{String(aff).padStart(2, "0")}
        </p>
        <div className="min-w-0 flex-1 pb-1">
          <p className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-3">Qloo affinity · {b.affinity.toFixed(3)}</p>
          <span className="block h-[5px] overflow-hidden rounded-full bg-paper-2">
            <span className="block h-full rounded-full bg-[linear-gradient(90deg,#7c9a2b,var(--accent))]" style={{ width: `${aff}%` }} />
          </span>
        </div>
      </div>

      {b.why && <p className="mt-3.5 text-[14px] leading-snug text-ink-2">{b.why}</p>}

      {style.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-3">Qloo style</span>
          {style.map((st) => (
            <span key={st} className="rounded-full border border-line px-2 py-0.5 text-[11.5px] text-ink-2">
              {st}
            </span>
          ))}
        </div>
      )}

      <div className="min-h-4 flex-1" />
      <div className="flex flex-wrap gap-1.5 border-t border-line/70 pt-3.5">
        {b.because.map((id) => {
          const s = seed(id);
          return (
            <span key={id} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-paper-2 py-0.5 pl-0.5 pr-2.5 text-[11.5px]">
              <Thumb src={s?.image} name={s?.name ?? "?"} size={20} />
              <span className="truncate">{s?.name}</span>
              <span className="font-mono text-[10.5px] text-accent">{Math.round((b.explain[id] ?? 0) * 100)}%</span>
            </span>
          );
        })}
      </div>
    </article>
  );
}

function VoteBtn({ on, tone, label, onClick }: { on: boolean; tone: "up" | "down"; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`grid h-9 w-9 place-items-center rounded-full border text-[15px] font-bold transition active:scale-90 ${
        on ? (tone === "up" ? "border-accent bg-accent text-black" : "border-bad bg-bad text-black") : "border-line bg-paper/40 text-ink-2 hover:border-ink-3 hover:text-ink"
      }`}
    >
      {tone === "up" ? "↑" : "↓"}
    </button>
  );
}
