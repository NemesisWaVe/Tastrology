"use client";

import { useState } from "react";
import type { StyleResult } from "@/lib/types";
import { KIND_LABEL } from "@/components/SeedPicker";
import { ReceiptPaper } from "@/components/card/Receipt";
import { displayName } from "@/lib/card";
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

/* ------------------------------------------------------------------ the critic, in one line */

/**
 * What the critic did, said plainly in one line. The full detail (each cut, why, the checks) is one tap away for
 * anyone who wants it; most people don't, and it shouldn't read like a log.
 */
export function Critique({ result }: { result: StyleResult }) {
  const [open, setOpen] = useState(false);
  const seedName = (id: string) => displayName(result.seeds.find((s) => s.id === id)?.name ?? "");
  const flukes = result.rejected.filter((r) => r.reason.startsWith("Carried")).length;
  const budget = result.rejected.length - flukes;
  const con = result.contradictions[0];
  const checks = result.critique.filter((c) => !c.startsWith("Contradiction") && !c.startsWith("Rejected"));
  const parts = [
    flukes ? `cut ${flukes} brand${flukes === 1 ? "" : "s"} that leaned on just one of your loves` : "",
    budget ? `dropped ${budget} over your budget` : "",
  ].filter(Boolean);
  return (
    <section id="doubts" className="scroll-mt-20">
      <div className="rise flex flex-col items-center gap-3 border-y border-line/70 py-8 text-center">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-ink-3">The critic</p>
        <p className="max-w-2xl text-balance font-serif text-[24px] leading-snug text-ink sm:text-[30px]">
          {parts.length ? <>Before you saw a thing, it {parts.join(" and ")}.</> : <>Every brand held up. Nothing was cut.</>}
          {con && (
            <>
              {" "}
              <em className="text-ink-2">
                {seedName(con.a)} and {seedName(con.b)} pull different ways, so you got two sides.
              </em>
            </>
          )}
        </p>
        {(result.rejected.length > 0 || checks.length > 0) && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3 underline decoration-dotted underline-offset-4 transition hover:text-ink"
          >
            {open ? "hide the cuts −" : "see the cuts +"}
          </button>
        )}
      </div>
      {open && (
        <div className="rise mx-auto mt-6 max-w-[460px]">
          <ReceiptPaper curl>
            <div className="px-6 pt-4 font-mono text-[11.5px] uppercase leading-[1.55]" style={{ color: "rgb(58 42 30 / 0.9)" }}>
              <p className="text-center font-bold tracking-[0.2em]">Struck from the record</p>
              <div className="my-2 border-t border-dashed border-black/40" />
              {result.rejected.map((r) => (
                <div key={r.entity.id} className="mb-1.5">
                  <p className="flex items-baseline gap-1.5">
                    <s className="min-w-0 truncate decoration-[#c4302b] decoration-[1.5px]">{r.entity.name}</s>
                    <span className="flex-1 border-b border-dotted border-black/35" />
                    <span className="tabular-nums">.{String(Math.round(r.affinity * 100)).padStart(2, "0")}</span>
                  </p>
                  <p className="pl-3 normal-case opacity-70">{r.reason}</p>
                </div>
              ))}
              {checks.length > 0 && (
                <>
                  <div className="my-2 border-t border-dashed border-black/40" />
                  {checks.map((c, i) => (
                    <p key={i} className="mb-1 normal-case opacity-80">
                      ✓ {c}
                    </p>
                  ))}
                </>
              )}
            </div>
          </ReceiptPaper>
        </div>
      )}
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
              <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-mono text-[11px] font-normal uppercase tracking-[0.18em] text-ink-3">Brand ↓ / Seed →</th>
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
                        className={`h-9 w-full rounded-lg font-mono text-[11px] tabular-nums transition hover:ring-1 hover:ring-ink-3 ${active ? "ring-2 ring-ink" : ""}`}
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

const SIGIL: Record<string, string> = { place: "⌖", movie: "◐", artist: "♪", book: "❡", tv_show: "▭", podcast: "◎", videogame: "◇" };

/** A bridge (place, film, artist, book) as a small star plate: its image in an orbit ring, duotoned into the sky. */
function BridgePlate({ b }: { b: StyleResult["bridges"][number] }) {
  const [bad, setBad] = useState(false);
  const e = b.entity;
  return (
    <article className="rise group relative flex gap-4 overflow-hidden rounded-[22px] border border-line p-4 transition hover:border-ink-3/60 sm:p-5" style={{ background: "repeating-conic-gradient(from 200deg at 0% 0%, rgb(255 236 200 / .028) 0 .6deg, transparent .6deg 3deg), var(--card)" }}>
      <span className="relative grid h-[84px] w-[84px] shrink-0 place-items-center">
        <span aria-hidden className="absolute inset-0 rounded-full border border-dashed border-[rgb(233_185_92/0.4)] transition-transform duration-[2000ms] group-hover:rotate-90" />
        <span aria-hidden className="absolute -right-0.5 top-2 h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
        {e.image && !bad ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.image} alt="" loading="lazy" onError={() => setBad(true)} className="h-[70px] w-[70px] rounded-full object-cover [filter:grayscale(1)_sepia(.35)_contrast(1.1)_brightness(.95)] transition group-hover:[filter:none]" />
        ) : (
          <span className="grid h-[70px] w-[70px] place-items-center rounded-full bg-paper-2 font-serif text-2xl italic text-ink-2">{SIGIL[e.kind] ?? "✦"}</span>
        )}
      </span>
      <div className="min-w-0">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">
          <span className="text-accent">{SIGIL[e.kind] ?? "✦"}</span> {KIND_LABEL[e.kind] ?? e.kind}
        </p>
        <h3 className="mt-1 font-serif text-[23px] leading-[1.05]">{e.name}</h3>
        {e.subtitle && <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-ink-3">{e.subtitle}</p>}
        {b.why && <p className="mt-2 font-serif text-[14px] italic leading-snug text-ink-2">{b.why}</p>}
      </div>
    </article>
  );
}

export function CapsuleAndBridges({ result }: { result: StyleResult }) {
  const brandOf = (id: string) => result.brands.find((b) => b.entity.id === id);
  const seedName = (id: string) => displayName(result.seeds.find((s) => s.id === id)?.name ?? "");
  return (
    <div className="grid grid-cols-1 gap-14 lg:grid-cols-[minmax(0,420px)_1fr] lg:gap-10">
      <section id="capsule" className="scroll-mt-20">
        <SectionHead kicker="Your first haul" title="Start here" note="One brand per piece, in the order they fit you." />
        <ReceiptPaper curl className="mx-auto max-w-[420px]">
          <div className="px-6 pt-4 font-mono text-[11.5px] uppercase leading-[1.55]" style={{ color: "rgb(58 42 30 / 0.9)" }}>
            <p className="text-center text-[15px] font-bold tracking-[0.2em]">Shopping list</p>
            <p className="text-center tracking-[0.1em] opacity-70">· one piece per line ·</p>
            <div className="my-2 border-t border-dashed border-black/40" />
            {result.capsule.map((c, i) => (
              <div key={c.category} className="mb-2">
                <p className="font-bold">
                  {String(i + 1).padStart(2, "0")} {c.category}
                </p>
                {c.brandIds.map((id) => {
                  const b = brandOf(id);
                  if (!b) return null;
                  const via = b.because.slice(0, 1).map(seedName).filter(Boolean)[0];
                  return (
                    <p key={id} className="flex items-baseline gap-1.5 pl-3">
                      <span className="min-w-0 truncate">{b.entity.name}</span>
                      <span className="flex-1 border-b border-dotted border-black/35" />
                      <span className="shrink-0 normal-case opacity-70">{via ? `via ${via}` : ""}</span>
                    </p>
                  );
                })}
              </div>
            ))}
            <div className="my-2 border-t border-dashed border-black/40" />
            <p className="text-center tracking-[0.14em] opacity-70">{result.capsule.length} pieces · read from your loves</p>
          </div>
        </ReceiptPaper>
      </section>
      <section id="bridges" className="scroll-mt-20">
        <SectionHead kicker="Other constellations" title="Same taste, other shelves" note="Places, films, music and books Qloo links to the same loves." />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {result.bridges.map((b) => (
            <BridgePlate key={b.entity.id} b={b} />
          ))}
        </div>
      </section>
    </div>
  );
}
