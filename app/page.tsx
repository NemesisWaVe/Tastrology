"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Sky } from "@/components/reveal/Sky";
import { skyState } from "@/components/reveal/traceModel";
import { ShareSheet } from "@/components/card/ShareSheet";
import { Landing } from "@/components/landing/Landing";
import { ResultsView, type Vote } from "@/components/results/ResultsView";
import { Reveal } from "@/components/reveal/Reveal";
import { TracePanel } from "@/components/TracePanel";
import { BRAND } from "@/lib/brand";
import { buildCard, cardCode } from "@/lib/card";
import { slim, trimResult } from "@/lib/saved";
import { TWIN_CODE } from "@/lib/twins";
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

const trim = trimResult;

function trimPins(p: BrandMatch[]): BrandMatch[] {
  return p.map((b) => ({ ...b, entity: slim(b.entity) }));
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
  const { events, result, running, error, run, setResult, busy, cancel } = useAgentRun();
  const [stage, setStage] = useState<Stage>("home");
  const [req, setReq] = useState<AgentRequest | undefined>();
  const [votes, setVotes] = useState<Record<string, Vote>>({});
  const [pinned, setPinned] = useState<BrandMatch[]>([]);
  const [replanning, setReplanning] = useState(false);
  const [share, setShare] = useState(false);
  const [returning, setReturning] = useState(false);
  /** False until localStorage has been checked, so a saved sign never flashes the landing page. */
  const [ready, setReady] = useState(false);
  /** A saved sign exists (shown as a "resume" option on the landing page). */
  const [saved, setSaved] = useState<Saved | null>(null);
  /** ?vs=<code>: someone challenged you. Kept for the whole flow (sessionStorage), then offered as a Fight link on results. */
  const [vs, setVs] = useState<{ code: string; name: string } | null>(null);
  useEffect(() => {
    let code = new URLSearchParams(location.search).get("vs")?.toUpperCase() ?? "";
    try {
      if (TWIN_CODE.test(code)) sessionStorage.setItem("tastrology:vs", code);
      else code = sessionStorage.getItem("tastrology:vs") ?? "";
    } catch {}
    if (!TWIN_CODE.test(code)) return;
    fetch(`/api/card?code=${code}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { card?: { archetype?: string } } | null) => j?.card && setVs({ code, name: j.card.archetype ?? "them" }))
      .catch(() => {});
  }, []);

  const restore = useCallback(
    (s: Saved) => {
      setReq(s.req);
      setResult(s.result ?? null);
      setVotes(s.votes ?? {});
      setPinned(s.pinned ?? []);
    },
    [setResult],
  );

  // Memory: a return visit lands straight on your sign. History is home -> result so Back goes to the landing page.
  useEffect(() => {
    const s = load();
    if (s?.result) {
      restore(s);
      setSaved(s);
      setStage("result");
      setReturning(true);
      try {
        history.replaceState({ s: "home" }, "");
        history.pushState({ s: "result" }, "");
      } catch {}
    } else {
      try {
        history.replaceState({ s: "home" }, "");
      } catch {}
    }
    setReady(true);
  }, [restore]);

  // Persist only a finished result (never mid-run), so a failed run can't wipe the last good sign.
  useEffect(() => {
    if (stage !== "result" || !result) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ req, result: trim(result), votes, pinned: trimPins(pinned) } satisfies Saved));
    } catch {}
  }, [stage, req, result, votes, pinned]);

  // Browser Back/Forward: Back from reveal/result returns to the landing page; the saved sign stays available.
  useEffect(() => {
    const onPop = () => {
      const s = (history.state as { s?: Stage } | null)?.s;
      // (a Next dev refresh can wipe our marker on an entry; treat unknown as home)
      if (s === "result") {
        const sv = load();
        if (sv?.result) {
          restore(sv);
          setStage("result");
          return;
        }
      }
      cancel();
      setReplanning(false);
      setShare(false);
      setSaved(load());
      setStage("home");
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [cancel, restore]);

  // In-page anchors (#matches, #capsule...) scroll without adding history entries, so Back still means "previous stage".
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href^='#']") as HTMLAnchorElement | null;
      const id = a?.getAttribute("href")?.slice(1);
      if (!a || !id || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: "smooth" });
      try {
        history.replaceState(history.state, "", `#${id}`);
      } catch {}
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const start = useCallback(
    (r: AgentRequest) => {
      if (busy()) return; // double tap / re-entry while a run is in flight
      setReq(r);
      setVotes({});
      setPinned([]);
      setReturning(false);
      setStage("reveal");
      window.scrollTo({ top: 0 });
      try {
        if ((history.state as { s?: Stage } | null)?.s !== "reveal") history.pushState({ s: "reveal" }, "");
      } catch {}
      run(r);
    },
    [run, busy],
  );

  const toResult = () => {
    setStage("result");
    window.scrollTo({ top: 0 });
    try {
      history.replaceState({ s: "result" }, "");
    } catch {}
  };

  /** Back to the landing page without discarding the saved sign. */
  const goHome = () => {
    const s = (history.state as { s?: Stage } | null)?.s;
    if (s && s !== "home") history.back();
    else {
      cancel();
      setSaved(load());
      setStage("home");
    }
  };

  const resume = () => {
    if (!saved?.result) return;
    restore(saved);
    setReturning(true);
    setStage("result");
    window.scrollTo({ top: 0 });
    try {
      history.pushState({ s: "result" }, "");
    } catch {}
  };

  const reset = () => {
    try {
      localStorage.removeItem(STORE);
    } catch {}
    setResult(null);
    setVotes({});
    setPinned([]);
    setSaved(null);
    setReturning(false);
    goHome();
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
    if (!result || running || busy()) return;
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

  // The share card never features a brand the user downvoted.
  const fight = useMemo(() => {
    if (!vs || !result || result.mode === "mock") return undefined;
    const mine = cardCode(buildCard(result));
    return mine === vs.code ? undefined : { href: `/vs/${vs.code}?vs=${mine}`, name: vs.name };
  }, [vs, result]);

  const shareable = useMemo(() => (shown ? { ...shown, brands: shown.brands.filter((b) => votes[b.entity.id] !== "down") } : null), [shown, votes]);

  // Your sky stays with you on the results page: far back, no captions (quiet), so the receipt and cards lead.
  const reduce = Boolean(useReducedMotion());
  const sky = useMemo(
    () => (result ? skyState(result.seeds, result.dna.name, result.dna.lobes.map((l) => l.seedIds), (result.inert ?? []).map((x) => x.id)) : null),
    [result],
  );

  if (!ready) return <div className="min-h-screen" aria-hidden />;

  if (stage === "home")
    return (
      <>
        <Landing onStart={start} />
        {saved?.result && (
          <button
            onClick={resume}
            className="rise fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-paper/90 px-5 py-2.5 text-sm font-medium text-ink shadow-2xl backdrop-blur-md hover:border-ink-3"
          >
            Back to your sign: {saved.result.dna.name} &rarr;
          </button>
        )}
      </>
    );

  if (stage === "reveal")
    return (
      <Reveal
        events={events}
        // A failed run must never advance with the previous (stale) result.
        result={error ? null : result}
        running={running}
        error={error}
        seeds={req?.seeds.map((s) => ({ name: s.name, kind: s.kind }))}
        onDone={toResult}
        onBack={goHome}
        onRetry={() => (req ? start(req) : goHome())}
      />
    );

  return (
    // isolate: the quiet sky (-z-10) stacks inside this root, above the body background and behind the content
    <div className="relative isolate min-h-screen">
      {sky && <Sky f={sky} reduce={reduce} drawn fixed quiet dim={0.4} />}
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
      {error && !replanning && <p className="mx-auto mt-4 max-w-6xl px-4 text-sm text-bad sm:px-6">{error}</p>}

      {shown && <ResultsView result={shown} votes={votes} onVote={vote} onShare={() => setShare(true)} onReplan={replan} pending={pending} fight={fight} />}

      {replanning && (
        <div className="rise fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-xl p-3">
          <div className="rounded-2xl border border-line bg-paper/95 p-2 shadow-2xl backdrop-blur-md">
            <p className="px-3 pt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Re-reading your stars with your feedback…</p>
            <TracePanel events={events} running={running} compact />
          </div>
        </div>
      )}

      {share && shareable && <ShareSheet result={shareable} onClose={() => setShare(false)} />}
    </div>
  );
}
