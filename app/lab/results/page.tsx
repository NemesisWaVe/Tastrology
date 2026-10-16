"use client";

import { useEffect, useMemo, useState } from "react";
import { ResultsView, type Vote } from "@/components/results/ResultsView";
import { ShareSheet } from "@/components/card/ShareSheet";
import { PERSONAS, personaRequest } from "@/lib/personas";
import { useAgentRun } from "@/lib/useAgentRun";
import type { AgentRequest, StyleResult } from "@/lib/types";

const LAB_KEY = (p: string) => `tastrology:lab:${p}`;
function labLoad(p: string): StyleResult | null {
  try {
    const s = localStorage.getItem(LAB_KEY(p));
    return s ? (JSON.parse(s) as StyleResult) : null;
  } catch {
    return null;
  }
}
function labSave(p: string, r: StyleResult) {
  try {
    localStorage.setItem(LAB_KEY(p), JSON.stringify(r));
  } catch {}
}

/** Dev lab: full results page for a persona, with the feedback loop and share sheet. /lab/results?p=neon (&share=1) */
export default function ResultsLab() {
  const { result, running, error, run, setResult } = useAgentRun();
  const [votes, setVotes] = useState<Record<string, Vote>>({});
  const [share, setShare] = useState(false);
  const [base, setBase] = useState<AgentRequest | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const p = PERSONAS.find((x) => x.key === (q.get("p") ?? "neon")) ?? PERSONAS[1];
    const req = personaRequest(p);
    setBase(req);
    if (q.get("share") === "1") setShare(true);
    // Lab-only: reuse the last result for this persona (?fresh=1 to re-run) so design iteration doesn't burn the rate limit.
    const cached = q.get("fresh") === "1" ? null : labLoad(p.key);
    if (cached) setResult(cached);
    else run(req).then((r) => r && labSave(p.key, r));
  }, [run, setResult]);

  const liked = Object.keys(votes).filter((k) => votes[k] === "up");
  const disliked = Object.keys(votes).filter((k) => votes[k] === "down");
  const pending = useMemo(() => {
    const prev = result?.feedback ?? { liked: [], disliked: [] };
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    return liked.length + disliked.length > 0 && !(same(liked, prev.liked) && same(disliked, prev.disliked));
  }, [liked, disliked, result]);

  const replan = () => {
    if (!result || !base) return;
    const names: Record<string, string> = {};
    for (const b of result.brands) names[b.entity.id] = b.entity.name;
    run({
      seeds: result.seeds.map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
      budget: base.budget,
      feedback: { liked, disliked },
      previous: { brandIds: result.brands.map((b) => b.entity.id), names },
    });
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6">
      {running && <p className="mb-4 font-mono text-sm text-ink-3">running agent…</p>}
      {error && <p className="mb-4 text-bad">{error}</p>}
      {result && (
        <ResultsView
          result={result}
          votes={votes}
          onVote={(id, v) =>
            setVotes((prev) => {
              const next = { ...prev };
              if (v) next[id] = v;
              else delete next[id];
              return next;
            })
          }
          onShare={() => setShare(true)}
          onReplan={replan}
          pending={pending && !running}
        />
      )}
      {share && result && <ShareSheet result={result} onClose={() => setShare(false)} />}
    </main>
  );
}
