"use client";

import { useMemo, useState } from "react";
import type { BrandMatch, StyleResult } from "@/lib/types";
import { KIND_ICON, KIND_LABEL } from "./SeedPicker";

export type Vote = "up" | "down";

export function Results({
  result,
  votes,
  onVote,
  onShare,
}: {
  result: StyleResult;
  votes: Record<string, Vote>;
  onVote: (id: string, v: Vote | null) => void;
  onShare: () => void;
}) {
  const seedName = useMemo(() => {
    const m = new Map(result.seeds.map((s) => [s.id, s.name]));
    return (id: string) => m.get(id) ?? "";
  }, [result.seeds]);
  const brandName = (id: string) => result.brands.find((b) => b.entity.id === id)?.entity.name ?? "";

  return (
    <div className="space-y-10">
      <DnaCard result={result} seedName={seedName} onShare={onShare} />

      {result.changes && (
        <section className="rise rounded-2xl border border-accent/30 bg-accent-soft/60 p-5">
          <h2 className="font-serif text-2xl">What changed and why</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {result.changes.added.map((t) => (
              <span key={t.id} className="rounded-full bg-good-soft px-3 py-1 text-good">
                + {t.name}
              </span>
            ))}
            {result.changes.removed.map((t) => (
              <span key={t.id} className="rounded-full bg-bad-soft px-3 py-1 text-bad line-through decoration-1">
                {t.name}
              </span>
            ))}
          </div>
          <ul className="mt-3 space-y-1.5 text-[14px] text-ink-2">
            {result.changes.why.map((w, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent">→</span>
                {w}
              </li>
            ))}
            {result.changes.added.length === 0 && result.changes.removed.length === 0 && <li>The same brands still hold up after your feedback. Their order and scores shifted.</li>}
          </ul>
        </section>
      )}

      {(result.critique.length > 0 || result.rejected.length > 0) && <Critique result={result} seedName={seedName} />}

      <section>
        <SectionHead
          kicker="Brand matches"
          title={`${result.brands.length} brands that fit you`}
          note="Every brand below was returned by Qloo's insights API. Rate them and the agent re-plans."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {result.brands.map((b, i) => (
            <BrandCard key={b.entity.id} b={b} i={i} seedName={seedName} vote={votes[b.entity.id]} onVote={onVote} />
          ))}
        </div>
      </section>

      <Matrix result={result} seedName={seedName} />

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionHead kicker="Capsule plan" title="Build it piece by piece" />
          <ol className="divide-y divide-line rounded-2xl border border-line bg-card">
            {result.capsule.map((c, i) => (
              <li key={c.category} className="flex items-baseline gap-4 px-4 py-3">
                <span className="w-5 font-mono text-xs text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <span className="w-36 shrink-0 text-sm font-semibold">{c.category}</span>
                <span className="text-sm text-ink-2">{c.brandIds.map(brandName).join(" · ")}</span>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <SectionHead kicker="Taste bridges" title="Beyond the wardrobe" />
          <div className="space-y-2.5">
            {result.bridges.map((b) => (
              <div key={b.entity.id} className="flex gap-3 rounded-2xl border border-line bg-card p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-paper-2 text-lg">{KIND_ICON[b.entity.kind] ?? "◆"}</span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">{KIND_LABEL[b.entity.kind] ?? b.entity.kind}</p>
                  <p className="font-medium">{b.entity.name}</p>
                  {b.entity.subtitle && <p className="text-xs text-ink-3">{b.entity.subtitle}</p>}
                  <p className="mt-1 text-[13px] text-ink-2">{b.why}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <p className="border-t border-line pt-4 text-center font-mono text-[11px] text-ink-3">
        {result.stats.qlooCalls} Qloo API calls · planner: {result.planner === "llm" ? `LLM (${result.stats.llmSteps} steps)` : "autopilot"} · data: {result.mode === "live" ? "live Qloo" : "demo graph (mock)"}
        {result.cached ? " · cached" : ""}
      </p>
    </div>
  );
}

function SectionHead({ kicker, title, note }: { kicker: string; title: string; note?: string }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">{kicker}</p>
      <h2 className="font-serif text-[30px] leading-tight">{title}</h2>
      {note && <p className="mt-1 text-sm text-ink-2">{note}</p>}
    </div>
  );
}

function DnaCard({ result, seedName, onShare }: { result: StyleResult; seedName: (id: string) => string; onShare: () => void }) {
  return (
    <section className="mirror rise relative overflow-hidden rounded-3xl border border-line p-6 sm:p-9">
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full border border-ink/10" />
      <div className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full border border-ink/10" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-ink-2">Your Style DNA</p>
          <button onClick={onShare} className="shrink-0 rounded-full border border-ink/20 bg-card/70 px-3.5 py-1.5 text-xs font-semibold hover:bg-card">
            Share card ↓
          </button>
        </div>
        <h1 className="mt-3 max-w-2xl font-serif text-5xl leading-[0.95] sm:text-6xl">{result.dna.name}</h1>
        <p className="mt-4 max-w-xl text-[15px] text-ink-2">{result.dna.tagline}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {result.dna.keywords.map((k) => (
            <span key={k.id} title={k.id} className="rounded-full border border-ink/20 bg-card/60 px-3 py-1 text-sm">
              {k.name}
            </span>
          ))}
          <span className="self-center pl-1 text-[11px] text-ink-3">keywords = Qloo tags, not AI guesses</span>
        </div>

        {result.dna.lobes.length > 1 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {result.dna.lobes.map((l, i) => (
              <div key={i} className="rounded-2xl border border-ink/15 bg-card/60 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">Side {i === 0 ? "A" : "B"}</p>
                <p className="font-serif text-xl">{l.keywords.map((k) => k.name).join(" · ") || "—"}</p>
                <p className="mt-1 text-xs text-ink-2">from {l.seedIds.map(seedName).join(", ")}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink/10 pt-4 text-xs text-ink-2">
          <span className="text-ink-3">Read from</span>
          {result.seeds.map((s) => (
            <span key={s.id}>
              <span className="text-ink-3">{KIND_ICON[s.kind]}</span> {s.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Critique({ result, seedName }: { result: StyleResult; seedName: (id: string) => string }) {
  return (
    <section>
      <SectionHead kicker="Self-critique" title="What the agent doubted" note="Before answering, the agent stress-tests Qloo's results and throws out matches it can't defend." />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2 rounded-2xl border border-line bg-card p-4">
          {result.contradictions.length > 0 && (
            <div className="rounded-xl bg-warn-soft p-3 text-[13.5px] text-warn">
              <p className="font-semibold">
                Contradiction: {seedName(result.contradictions[0].a)} ↔ {seedName(result.contradictions[0].b)}
              </p>
              <p className="mt-0.5 text-warn/90">
                Their Qloo influence patterns overlap {(result.contradictions[0].overlap * 100).toFixed(0)}%, so they point at different wardrobes. Your DNA was split into two sides instead of averaged into mush.
              </p>
            </div>
          )}
          {result.critique
            .filter((c) => !c.startsWith("Contradiction") && !c.startsWith("Rejected"))
            .map((c, i) => (
              <p key={i} className="flex gap-2 text-[13.5px] text-ink-2">
                <span className="text-good">✓</span>
                {c}
              </p>
            ))}
          {result.contradictions.length === 0 && (
            <p className="flex gap-2 text-[13.5px] text-ink-2">
              <span className="text-good">✓</span>No contradictions: your seeds point the same way.
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-line bg-card p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Rejected by the agent</p>
          {result.rejected.length === 0 && <p className="text-sm text-ink-3">Nothing rejected this round.</p>}
          <ul className="space-y-2">
            {result.rejected.map((r) => (
              <li key={r.entity.id} className="text-[13.5px]">
                <span className="font-medium text-ink-2 line-through decoration-bad/60">{r.entity.name}</span>
                <span className="ml-1.5 font-mono text-[11px] text-ink-3">{r.affinity.toFixed(2)}</span>
                <p className="text-xs text-ink-3">{r.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function BrandCard({ b, i, seedName, vote, onVote }: { b: BrandMatch; i: number; seedName: (id: string) => string; vote?: Vote; onVote: (id: string, v: Vote | null) => void }) {
  return (
    <article
      className={`rise flex flex-col rounded-2xl border bg-card p-4 transition ${vote === "up" ? "border-good ring-1 ring-good/30" : vote === "down" ? "border-line opacity-55" : "border-line"}`}
      style={{ animationDelay: `${i * 45}ms` }}
    >
      <div className="flex items-start gap-3">
        {b.entity.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.entity.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-paper-2 font-serif text-2xl">{b.entity.name[0]}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
            {b.category}
            {b.entity.tier ? <span className="ml-1.5 tracking-normal">{"$".repeat(b.entity.tier)}</span> : null}
            {b.side ? <span className="ml-1.5 rounded bg-warn-soft px-1.5 py-px tracking-normal text-warn">Side B</span> : null}
          </p>
          <h3 className="truncate font-serif text-[24px] leading-tight">{b.entity.name}</h3>
        </div>
        <div className="flex shrink-0 gap-1">
          <VoteBtn on={vote === "up"} label="More like this" onClick={() => onVote(b.entity.id, vote === "up" ? null : "up")}>
            ↑
          </VoteBtn>
          <VoteBtn on={vote === "down"} label="Not for me" onClick={() => onVote(b.entity.id, vote === "down" ? null : "down")}>
            ↓
          </VoteBtn>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="h-1.5 flex-1 rounded-full bg-paper-2">
          <span className="block h-1.5 rounded-full bg-accent" style={{ width: `${Math.round(b.affinity * 100)}%` }} />
        </span>
        <span className="font-mono text-[11px] text-ink-2">Qloo affinity {b.affinity.toFixed(2)}</span>
      </div>

      <p className="mt-3 text-[14px] leading-snug text-ink-2">{b.why}</p>
      {b.entity.style && (
        <p className="mt-2 text-[11.5px] text-ink-3">
          <span className="font-semibold uppercase tracking-wider">Qloo style</span> · {b.entity.style.slice(0, 3).join(" · ")}
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
        {b.because.map((id) => (
          <span key={id} className="rounded-full bg-paper-2 px-2.5 py-0.5 text-[11.5px]">
            ♥ {seedName(id)} <span className="font-mono text-ink-3">{Math.round((b.explain[id] ?? 0) * 100)}%</span>
          </span>
        ))}
      </div>
    </article>
  );
}

function VoteBtn({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-full border text-sm font-bold transition ${on ? "border-ink bg-ink text-paper" : "border-line text-ink-2 hover:border-ink-3"}`}
    >
      {children}
    </button>
  );
}

function Matrix({ result, seedName }: { result: StyleResult; seedName: (id: string) => string }) {
  const [mode, setMode] = useState<"explain" | "ablation">("explain");
  const [cell, setCell] = useState<{ b: string; s: string } | null>(null);
  const maxAb = Math.max(0.0001, ...result.brands.flatMap((b) => Object.values(b.ablation)));
  const sel = cell && result.brands.find((b) => b.entity.id === cell.b);

  return (
    <section>
      <SectionHead
        kicker="Attribution matrix"
        title="Which of your loves earned which brand"
        note="Each cell is measured, not guessed: Qloo's explainability score, or how much affinity the brand loses when the agent re-queries Qloo without that seed."
      />
      <div className="mb-3 inline-flex rounded-full border border-line bg-card p-0.5 text-xs">
        {(["explain", "ablation"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1.5 font-medium ${mode === m ? "bg-ink text-paper" : "text-ink-2"}`}>
            {m === "explain" ? "Influence share" : "Affinity lost without seed"}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-card px-3 py-2.5 text-left font-semibold">Brand</th>
              {result.seeds.map((s) => (
                <th key={s.id} className="px-1.5 py-2.5 text-center font-medium text-ink-2" title={s.name}>
                  <span className="mx-auto block max-w-[88px] truncate">{s.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.brands.map((b) => (
              <tr key={b.entity.id} className="border-t border-line">
                <td className="sticky left-0 bg-card px-3 py-1.5 font-medium">{b.entity.name}</td>
                {result.seeds.map((s) => {
                  const v = mode === "explain" ? b.explain[s.id] ?? 0 : (b.ablation[s.id] ?? 0) / maxAb;
                  const raw = mode === "explain" ? `${Math.round((b.explain[s.id] ?? 0) * 100)}%` : `−${(b.ablation[s.id] ?? 0).toFixed(2)}`;
                  const active = cell?.b === b.entity.id && cell?.s === s.id;
                  return (
                    <td key={s.id} className="p-0.5">
                      <button
                        onClick={() => setCell(active ? null : { b: b.entity.id, s: s.id })}
                        className={`h-8 w-full rounded-md font-mono text-[10.5px] transition ${active ? "ring-2 ring-ink" : ""}`}
                        style={{ background: `rgba(194, 65, 12, ${Math.min(0.9, v * (mode === "explain" ? 1.6 : 0.85))})`, color: v > 0.4 ? "#fff" : "var(--ink-2)" }}
                      >
                        {v > 0.02 ? raw : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel && cell && (
        <p className="rise mt-2 rounded-xl bg-paper-2 px-4 py-2.5 text-[13px] text-ink-2">
          Without <b>{seedName(cell.s)}</b>, Qloo&apos;s affinity for <b>{sel.entity.name}</b> drops by <b>{(sel.ablation[cell.s] ?? 0).toFixed(3)}</b>. Qloo&apos;s explainability attributes{" "}
          <b>{Math.round((sel.explain[cell.s] ?? 0) * 100)}%</b> of the match to it.
        </p>
      )}
    </section>
  );
}
