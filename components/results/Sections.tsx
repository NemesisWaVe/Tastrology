"use client";

import { useState } from "react";
import type { StyleResult } from "@/lib/types";
import { KIND_ICON, KIND_LABEL } from "@/components/SeedPicker";
import { SectionHead, Thumb } from "./ui";

/* ------------------------------------------------------------------ what changed */

export function Changes({ result }: { result: StyleResult }) {
  const c = result.changes;
  if (!c) return null;
  return (
    <section className="rise relative overflow-hidden rounded-[26px] border border-accent/30 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(198,255,61,0.10),transparent_55%),var(--card)] p-5 sm:p-7">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Re-read · after your votes</p>
      <h2 className="mt-2 font-serif text-[30px] leading-none sm:text-[38px]">What changed, and why</h2>
      <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
        {c.added.map((t) => (
          <span key={t.id} className="rounded-full border border-good/30 bg-good-soft px-3 py-1 text-good">
            + {t.name}
          </span>
        ))}
        {c.removed.map((t) => (
          <span key={t.id} className="rounded-full border border-bad/30 bg-bad-soft px-3 py-1 text-bad line-through decoration-1">
            {t.name}
          </span>
        ))}
      </div>
      <ul className="mt-4 space-y-2 text-[14px] leading-relaxed text-ink-2">
        {c.why.map((w, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="font-mono text-accent">→</span>
            {w}
          </li>
        ))}
        {c.added.length === 0 && c.removed.length === 0 && (
          <li className="flex gap-2.5">
            <span className="font-mono text-accent">→</span>The same brands still hold up after your feedback. Their order and scores shifted.
          </li>
        )}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ self-critique */

export function Critique({ result }: { result: StyleResult }) {
  const seedName = (id: string) => result.seeds.find((s) => s.id === id)?.name ?? "";
  const checks = result.critique.filter((c) => !c.startsWith("Contradiction") && !c.startsWith("Rejected"));
  const con = result.contradictions[0];
  return (
    <section id="doubts" className="scroll-mt-20">
      <SectionHead
        title={
          <>
            The agent argued <em className="text-ink-2">with itself</em>
          </>
        }
        note="Before showing you anything, it checks what Qloo sent back and drops the matches it can't defend."
      />
      <div className="grid gap-3 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-3 rounded-[22px] border border-line bg-card p-4 sm:p-5">
          {con && (
            <div className="rounded-2xl border border-warn/25 bg-[linear-gradient(135deg,rgba(251,191,36,0.10),transparent_70%)] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-warn">☽ Contradiction detected</p>
              <p className="mt-1.5 font-display text-[17px] font-semibold leading-snug">
                {seedName(con.a)} <span className="text-warn">≠</span> {seedName(con.b)}
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
                Their Qloo aesthetic overlap is {(con.overlap * 100).toFixed(0)}%, so they point at different wardrobes. Your sign was split into two sides
                instead of averaged into mush. That&apos;s your Moon.
              </p>
            </div>
          )}
          <ul className="space-y-2.5">
            {checks.map((c, i) => (
              <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-ink-2">
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-good-soft text-[9px] text-good">✓</span>
                {c}
              </li>
            ))}
            {!con && (
              <li className="flex gap-2.5 text-[13.5px] text-ink-2">
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-good-soft text-[9px] text-good">✓</span>
                No contradictions: your loves point the same way.
              </li>
            )}
          </ul>
        </div>
        <div className="rounded-[22px] border border-line bg-card p-4 sm:p-5">
          <p className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3">
            <span>Rejected by the agent</span>
            <span>{result.rejected.length}</span>
          </p>
          {result.rejected.length === 0 && <p className="mt-3 text-sm text-ink-3">Nothing rejected this round.</p>}
          <ul className="mt-3 divide-y divide-line/70">
            {result.rejected.map((r) => (
              <li key={r.entity.id} className="py-2.5 first:pt-0">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium text-ink-2 line-through decoration-bad/70 decoration-[1.5px]">{r.entity.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-3">aff {r.affinity.toFixed(2)}</span>
                </p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{r.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ attribution matrix */

export function Matrix({ result }: { result: StyleResult }) {
  const [mode, setMode] = useState<"explain" | "ablation">("explain");
  const [cell, setCell] = useState<{ b: string; s: string } | null>(null);
  const maxAb = Math.max(0.0001, ...result.brands.flatMap((b) => Object.values(b.ablation)));
  const sel = cell && result.brands.find((b) => b.entity.id === cell.b);
  const seedName = (id: string) => result.seeds.find((s) => s.id === id)?.name ?? "";

  return (
    <section id="receipts" className="scroll-mt-20">
      <SectionHead
        kicker="Receipts"
        title={
          <>
            Which of your loves <em className="text-ink-2">earned</em> which brand
          </>
        }
        note="Every cell is measured, not guessed: Qloo's explainability share, or how much affinity the brand loses when the agent re-queries Qloo without that seed. Tap a cell."
        right={
          <div className="inline-flex rounded-full border border-line bg-card p-1 text-[12px]" role="tablist">
            {(["explain", "ablation"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-full px-3.5 py-1.5 font-medium transition ${mode === m ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}
              >
                {m === "explain" ? "Influence share" : "Lost without seed"}
              </button>
            ))}
          </div>
        }
      />
      <div className="overflow-x-auto rounded-[22px] border border-line bg-card [scrollbar-width:thin]">
        <table className="w-full min-w-[620px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-mono text-[10px] font-normal uppercase tracking-[0.18em] text-ink-3">Brand ↓ / Seed →</th>
              {result.seeds.map((s) => (
                <th key={s.id} className="px-1 py-3 text-center font-normal" title={s.name}>
                  <span className="mx-auto flex max-w-[96px] flex-col items-center gap-1.5">
                    <Thumb src={s.image} name={s.name} size={26} className="ring-1 ring-line" />
                    <span className="block w-full truncate text-[11.5px] text-ink-2">{s.name}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.brands.map((b) => (
              <tr key={b.entity.id} className="border-t border-line/70">
                <td className="sticky left-0 z-10 max-w-[150px] truncate bg-card px-4 py-1.5 font-medium">
                  {b.side ? <span className="mr-1 text-warn">☽</span> : null}
                  {b.entity.name}
                </td>
                {result.seeds.map((s) => {
                  const v = mode === "explain" ? (b.explain[s.id] ?? 0) : (b.ablation[s.id] ?? 0) / maxAb;
                  const raw = mode === "explain" ? `${Math.round((b.explain[s.id] ?? 0) * 100)}%` : `−${(b.ablation[s.id] ?? 0).toFixed(3)}`;
                  const active = cell?.b === b.entity.id && cell?.s === s.id;
                  const a = Math.min(0.95, v * (mode === "explain" ? 1.5 : 0.9));
                  return (
                    <td key={s.id} className="p-[3px]">
                      <button
                        onClick={() => setCell(active ? null : { b: b.entity.id, s: s.id })}
                        aria-label={`${b.entity.name} × ${s.name}: ${raw}`}
                        className={`h-9 w-full rounded-lg font-mono text-[10.5px] tabular-nums transition hover:ring-1 hover:ring-ink-3 ${active ? "ring-2 ring-ink" : ""}`}
                        style={{
                          background: v > 0.005 ? `rgba(198, 255, 61, ${a})` : "rgba(255,255,255,0.025)",
                          color: a > 0.45 ? "#0b0f02" : "var(--ink-2)",
                          boxShadow: a > 0.6 ? "0 0 18px -6px rgba(198,255,61,0.8)" : undefined,
                        }}
                      >
                        {v > 0.02 ? raw : "·"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 min-h-[44px]">
        {sel && cell ? (
          <p className="rise rounded-2xl border border-line bg-paper-2 px-4 py-3 text-[13.5px] leading-relaxed text-ink-2">
            Without <b className="text-ink">{seedName(cell.s)}</b>, Qloo&apos;s affinity for <b className="text-ink">{sel.entity.name}</b> drops by{" "}
            <b className="font-mono text-accent">{(sel.ablation[cell.s] ?? 0).toFixed(3)}</b>. Qloo&apos;s explainability attributes{" "}
            <b className="font-mono text-accent">{Math.round((sel.explain[cell.s] ?? 0) * 100)}%</b> of the match to it.
          </p>
        ) : (
          <p className="px-1 font-mono text-[11px] text-ink-3">brighter = more responsible · ☽ = side-B brand</p>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ capsule + bridges */

function BridgeImg({ src, icon }: { src?: string; icon: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-paper-2 text-xl text-ink-2">{icon}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" onError={() => setBad(true)} className="h-16 w-16 shrink-0 rounded-2xl bg-paper-2 object-cover" />;
}

export function CapsuleAndBridges({ result }: { result: StyleResult }) {
  const brand = (id: string) => result.brands.find((b) => b.entity.id === id)?.entity;
  return (
    <div className="grid gap-12 lg:grid-cols-2 lg:gap-8">
      <section id="capsule" className="scroll-mt-20">
        <SectionHead title="Start with these, in this order" note="One brand per piece, picked from the matches above." />
        <ol className="overflow-hidden rounded-[22px] border border-line bg-card">
          {result.capsule.map((c, i) => (
            <li key={c.category} className="flex items-center gap-4 border-t border-line/70 px-4 py-3.5 first:border-t-0 sm:px-5">
              <span className="w-6 font-mono text-[11px] text-accent">{String(i + 1).padStart(2, "0")}</span>
              <span className="w-28 shrink-0 font-display text-[14px] font-semibold sm:w-36">{c.category}</span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
                {c.brandIds.map((id) => {
                  const e = brand(id);
                  if (!e) return null;
                  return (
                    <span key={id} className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
                      <span className="grid h-5 w-5 place-items-center overflow-hidden rounded-md bg-white p-[2px]">
                        {e.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={e.image} alt="" className="h-full w-full object-contain" loading="lazy" />
                        ) : (
                          <span className="text-[10px] text-black">{e.name[0]}</span>
                        )}
                      </span>
                      {e.name}
                    </span>
                  );
                })}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section id="bridges" className="scroll-mt-20">
        <SectionHead kicker="Outside the closet" title="Same taste, other shelves" note="Films, books and places Qloo links to the same loves." />
        <div className="space-y-2.5">
          {result.bridges.map((b) => (
            <div key={b.entity.id} className="flex gap-3.5 rounded-[22px] border border-line bg-card p-3.5 sm:p-4">
              <BridgeImg src={b.entity.image} icon={KIND_ICON[b.entity.kind] ?? "◆"} />
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                  {KIND_ICON[b.entity.kind]} {KIND_LABEL[b.entity.kind] ?? b.entity.kind}
                </p>
                <p className="mt-0.5 font-display text-[16px] font-semibold leading-snug">{b.entity.name}</p>
                {b.entity.subtitle && <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-3">{b.entity.subtitle}</p>}
                {b.why && <p className="mt-1.5 text-[13px] leading-snug text-ink-2">{b.why}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
