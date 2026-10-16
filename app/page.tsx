"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShareSheet } from "@/components/card/ShareSheet";
import { Landing } from "@/components/landing/Landing";
import { ResultsView, type Vote } from "@/components/results/ResultsView";
import { Reveal } from "@/components/reveal/Reveal";
import { TracePanel } from "@/components/TracePanel";
import { BRAND } from "@/lib/brand";
import type { AgentRequest, BrandMatch, StyleResult } from "@/lib/types";
import { useAgentRun } from "@/lib/useAgentRun";

type Stage = "home" | "reveal" | "result";
const STORE = "tastrology:v1";

interface Saved {
  req?: AgentRequest;
  result?: StyleResult;
  votes: Record<string, Vote>;
  pinned: BrandMatch[];
}

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const { events, result, running, error, run, setResult } = useAgentRun();
  const [stage, setStage] = useState<Stage>("home");
  const [req, setReq] = useState<AgentRequest | undefined>();
  const [votes, setVotes] = useState<Record<string, Vote>>({});
  const [pinned, setPinned] = useState<BrandMatch[]>([]);
  const [replanning, setReplanning] = useState(false);
  const [share, setShare] = useState(false);
  const [returning, setReturning] = useState(false);

  // Memory: a return visit lands straight on your sign.
  useEffect(() => {
    const s = load();
    if (!s?.result) return;
    setReq(s.req);
    setResult(s.result);
    setVotes(s.votes ?? {});
    setPinned(s.pinned ?? []);
    setStage("result");
    setReturning(true);
  }, [setResult]);

  useEffect(() => {
    if (stage === "home") return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ req, result: result ?? undefined, votes, pinned } satisfies Saved));
    } catch {}
  }, [stage, req, result, votes, pinned]);

  const start = useCallback(
    (r: AgentRequest) => {
      setReq(r);
      setVotes({});
      setPinned([]);
      setReturning(false);
      setStage("reveal");
      window.scrollTo({ top: 0 });
      run(r);
    },
    [run],
  );

  const reset = () => {
    try {
      localStorage.removeItem(STORE);
    } catch {}
    setResult(null);
    setVotes({});
    setPinned([]);
    setReturning(false);
    setStage("home");
    window.scrollTo({ top: 0 });
  };

  const vote = (id: string, v: Vote | null) =>
    setVotes((prev) => {
      const next = { ...prev };
      if (v) next[id] = v;
      else delete next[id];
      return next;
    });

  const liked = Object.keys(votes).filter((k) => votes[k] === "up");
  const disliked = Object.keys(votes).filter((k) => votes[k] === "down");
  const pending = useMemo(() => {
    const prev = result?.feedback ?? { liked: [], disliked: [] };
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    return liked.length + disliked.length > 0 && !(same(liked, prev.liked) && same(disliked, prev.disliked));
  }, [liked, disliked, result]);

  // Feedback loop: 👍 brands become Qloo signals, 👎 brands are excluded, and the agent re-plans.
  const replan = async () => {
    if (!result || running) return;
    const pins = [
      ...pinned.filter((p) => liked.includes(p.entity.id)),
      ...result.brands.filter((b) => liked.includes(b.entity.id) && !pinned.some((p) => p.entity.id === b.entity.id)),
    ];
    setPinned(pins);
    const names: Record<string, string> = {};
    for (const b of [...result.brands, ...pins]) names[b.entity.id] = b.entity.name;
    setReplanning(true);
    const next = await run({
      seeds: result.seeds.map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
      budget: req?.budget,
      goal: req?.goal,
      feedback: { liked, disliked },
      previous: { brandIds: result.brands.map((b) => b.entity.id), names },
    });
    setReplanning(false);
    if (next) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Liked brands stay visible even when Qloo excludes them from the next round (they're signals now).
  const shown = useMemo(() => {
    if (!result) return null;
    const keep = pinned.filter((p) => votes[p.entity.id] === "up" && !result.brands.some((b) => b.entity.id === p.entity.id));
    return { ...result, brands: [...keep, ...result.brands] };
  }, [result, pinned, votes]);

  if (stage === "home") return <Landing onStart={start} />;

  if (stage === "reveal")
    return (
      <Reveal
        events={events}
        result={result}
        running={running}
        error={error}
        seeds={req?.seeds.map((s) => ({ name: s.name, kind: s.kind }))}
        onDone={() => {
          setStage("result");
          window.scrollTo({ top: 0 });
        }}
        onRetry={() => (req ? start(req) : reset())}
      />
    );

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-line/60 bg-paper/70 px-4 py-3 backdrop-blur-md sm:px-6">
        <button onClick={reset} className="font-display text-lg font-bold tracking-tight">
          {BRAND.name}
        </button>
        <button onClick={reset} className="rounded-full border border-line px-4 py-1.5 text-sm text-ink-2 hover:border-ink-3 hover:text-ink">
          New sign
        </button>
      </nav>

      {returning && (
        <p className="rise mx-auto mt-4 max-w-6xl px-4 text-sm text-ink-3 sm:px-6">
          Welcome back. Your sign and your feedback are where you left them.
        </p>
      )}
      {error && !replanning && <p className="mx-auto mt-4 max-w-6xl px-4 text-sm text-bad sm:px-6">Re-plan failed: {error}</p>}

      {shown && <ResultsView result={shown} votes={votes} onVote={vote} onShare={() => setShare(true)} onReplan={replan} pending={pending} />}

      {replanning && (
        <div className="rise fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-xl p-3">
          <div className="rounded-2xl border border-line bg-paper/95 p-2 shadow-2xl backdrop-blur-md">
            <p className="px-3 pt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Re-reading your stars with your feedback…</p>
            <TracePanel events={events} running={running} compact />
          </div>
        </div>
      )}

      {share && result && <ShareSheet result={result} onClose={() => setShare(false)} />}
    </div>
  );
}
