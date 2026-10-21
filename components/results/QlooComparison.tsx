"use client";

import { useState } from "react";
import type { Baseline } from "@/lib/comparison";
import { codeOf } from "@/lib/readings";
import type { StyleResult } from "@/lib/types";

export function QlooComparison({ result }: { result: StyleResult }) {
  const [open, setOpen] = useState(false);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (result.mode !== "live") return null;
  const compare = async () => {
    if (busy || baseline) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/comparison", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: codeOf(result) }) });
      const data = await response.json();
      if (!response.ok || !data.baseline) throw new Error(data.error || "Comparison unavailable.");
      setBaseline(data.baseline);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Comparison unavailable."); }
    finally { setBusy(false); }
  };
  return (
    <section className="mt-12 border-y border-line py-6" aria-label="Why Qloo matters">
      <button className="flex w-full items-center justify-between gap-4 text-left font-serif text-2xl" aria-expanded={open} aria-controls="qloo-comparison" onClick={() => setOpen(!open)}>
        What changes without Qloo? <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open && <div id="qloo-comparison" className="mt-5 space-y-5">
        <p className="max-w-3xl text-sm leading-relaxed text-ink-2">Same loves, two approaches. One asks a language model to suggest brands from memory; the other queries Qloo and measures which loves moved each match. This is one illustrative run, not a benchmark or a claim that the model&apos;s brands are wrong.</p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="border-l border-line pl-4">
            <h3 className="font-mono text-xs uppercase tracking-widest">Without Qloo · unverified LLM output</h3>
            {!baseline && <button onClick={() => void compare()} disabled={busy} className="mt-4 rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50">{busy ? "Asking the model…" : "Show the LLM comparison"}</button>}
            {error && <p role="status" className="mt-3 text-sm text-ink-2">{error}</p>}
            {baseline && <><ul className="mt-4 space-y-4">{baseline.brands.map((brand) => <li key={brand.name}><b>{brand.name}</b><p className="mt-1 text-sm text-ink-3">{brand.reason}</p></li>)}</ul><p className="mt-4 text-xs text-ink-3">Saved {new Date(baseline.generatedAt).toLocaleDateString()}. {baseline.model}. No retrieval, measured affinity or verified links. These are not Tastrology recommendations.</p></>}
          </div>
          <div className="border-l border-accent/50 pl-4">
            <h3 className="font-mono text-xs uppercase tracking-widest text-accent">With Qloo · your actual reading</h3>
            <ul className="mt-4 space-y-4">{result.brands.slice(0, 6).map((brand) => <li key={brand.entity.id}><b>{brand.entity.name}</b><p className="mt-1 text-sm text-ink-2">{brand.why || `Driven by ${brand.because.map((id) => result.seeds.find((seed) => seed.id === id)?.name).filter(Boolean).join(", ") || "your combined tastes"}.`}</p><span className="font-mono text-xs text-ink-3">Qloo affinity {brand.affinity.toFixed(3)} · measured leave-one-out receipt</span></li>)}</ul>
          </div>
        </div>
      </div>}
    </section>
  );
}
