"use client";

import { useEffect, useMemo, useState } from "react";
import { HoloCard } from "@/components/card/HoloCard";
import { buildCard } from "@/lib/card";
import { PERSONAS, personaRequest } from "@/lib/personas";
import { useAgentRun } from "@/lib/useAgentRun";

/** Dev lab: renders the collectible card for a persona. /lab/card?p=neon (&w=300,340,380 &still=1) */
export default function CardLab() {
  const { result, running, error, run, setResult } = useAgentRun();
  const [widths, setWidths] = useState<number[]>([360]);
  const [still, setStill] = useState(false);
  const [sim, setSim] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const key = q.get("p") ?? "neon";
    const w = q.get("w");
    if (w) setWidths(w.split(",").map(Number).filter(Boolean));
    setStill(q.get("still") === "1");
    setSim(q.get("sim") === "1");
    const p = PERSONAS.find((x) => x.key === key) ?? PERSONAS[1];
    // Lab-only: reuse the result /lab/results cached for this persona (?fresh=1 to re-run).
    let cached = null;
    try {
      cached = q.get("fresh") === "1" ? null : JSON.parse(localStorage.getItem(`tastrology:lab:${p.key}`) ?? "null");
    } catch {}
    if (cached) setResult(cached);
    else
      run(personaRequest(p)).then((r) => {
        try {
          if (r) localStorage.setItem(`tastrology:lab:${p.key}`, JSON.stringify(r));
        } catch {}
      });
  }, [run, setResult]);
  // ?sim=1: lab-only what-if so the Deep Cut stamp and Weakness line can be eyeballed (seeds read as 20% popular, the quietest seed inert). Never used outside /lab.
  const card = useMemo(() => {
    if (!result) return null;
    if (!sim) return buildCard(result);
    const quiet = [...result.seeds].sort((a, b) => result.brands.reduce((t, x) => t + (x.explain[a.id] ?? 0), 0) - result.brands.reduce((t, x) => t + (x.explain[b.id] ?? 0), 0))[0];
    return buildCard({ ...result, seeds: result.seeds.map((s) => ({ ...s, popularity: 0.2 })), inert: [{ id: quiet.id, influence: 0.02 }] });
  }, [result, sim]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      {running && <p className="font-mono text-sm text-ink-3">running agent…</p>}
      {error && <p className="text-bad">{error}</p>}
      {card && (
        <div className="flex flex-wrap items-start justify-center gap-8">
          {widths.map((w) => (
            <HoloCard key={w} card={card} width={w} still={still} />
          ))}
        </div>
      )}
      {card && (
        <pre className="max-w-full overflow-auto text-[10px] text-ink-3">
          {JSON.stringify({ rarity: card.rarity, score: card.rarityScore, why: card.rarityWhy, weakness: card.weakness, deepCut: card.deepCut, name: card.archetype, tagline: card.flavor, big3: [card.bigThree.sun.name, card.bigThree.moon.name, card.bigThree.rising.name], stats: card.stats.map((s) => s.value) })}
        </pre>
      )}
    </main>
  );
}
