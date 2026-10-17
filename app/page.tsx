"use client";

import { Mark } from "@/components/site/Mark";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sky } from "@/components/reveal/Sky";
import { skyState } from "@/components/reveal/traceModel";
import { ShareSheet } from "@/components/card/ShareSheet";
import { AuthNav } from "@/components/auth/AuthNav";
import { SoundToggle } from "@/components/site/SoundToggle";
import { Landing } from "@/components/landing/Landing";
import { ResultsView, type Vote } from "@/components/results/ResultsView";
import { Reveal } from "@/components/reveal/Reveal";
import { TracePanel } from "@/components/TracePanel";
import { takePendingRun } from "@/lib/authBridge";
import { BRAND } from "@/lib/brand";
import { buildCard, cardCode } from "@/lib/card";
import { addToDeck } from "@/lib/deck";
import { isPersonaRequest } from "@/lib/personas";
import { isSavedResult, slim, trimResult } from "@/lib/saved";
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

/** The saved sign, or null. A save that no longer has the right shape (old version, hand edit) is dropped, not rendered. */
function load(): Saved | null {
  let s: Saved | null = null;
  try {
    const raw = localStorage.getItem(STORE);
    s = raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    s = null;
  }
  if (!s || typeof s !== "object") return null;
  if (s.result !== undefined && !savedResultOk(s.result)) {
    try {
      localStorage.removeItem(STORE);
    } catch {}
    return null;
  }
  return {
    req: s.req && Array.isArray(s.req.seeds) ? s.req : undefined,
    result: s.result,
    votes: s.votes && typeof s.votes === "object" ? s.votes : {},
    pinned: Array.isArray(s.pinned) ? s.pinned.filter((b) => b && typeof b === "object" && b.entity && typeof b.entity.id === "string") : [],
  };
}

function savedResultOk(r: unknown): r is StyleResult {
  if (!isSavedResult(r)) return false;
  try {
    buildCard(r); // the result screen and the deck both walk this; if it throws here it would throw there
    return true;
  } catch {
    return false;
  }
}

export default function Home() {
  const { events, result, running, error, errorReason, run, setResult, busy, cancel } = useAgentRun();
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

  // File each live card into this device's deck (server-side, write-once). Demo personas stay out.
  useEffect(() => {
    if (stage !== "result" || !result || result.mode === "mock" || isPersonaRequest(req)) return;
    addToDeck(cardCode(buildCard(result)));
  }, [stage, result, req]);

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

  // Back from a sign-in that left the page (e.g. Google): start the reading that was waiting on it.
  useEffect(() => {
    let off = false;
    void takePendingRun().then((r) => {
      if (r && !off) start(r);
    });
    return () => {
      off = true;
    };
  }, [start]);

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

  // A returning sign that was burned (here or on another device) is gone: drop it and land on the home page.
  const resetRef = useRef(reset);
  resetRef.current = reset;
  // "/?new=1" (shop, "New sign"): start a fresh reading instead of reopening the saved one. The card stays in the deck.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("new") !== "1") return;
    resetRef.current();
    try {
      history.replaceState(null, "", "/");
    } catch {}
  }, []);
  useEffect(() => {
    if (!returning || !saved?.result) return;
    let code: string;
    try {
      code = cardCode(buildCard(saved.result));
    } catch {
      return;
    }
    let off = false;
    fetch(`/api/card?code=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then((r) => {
        if (!off && r.status === 410) resetRef.current();
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [returning, saved]);

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
      <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-line/60 bg-paper/70 px-3 py-3 backdrop-blur-md sm:px-6">
        <button onClick={reset} className="flex items-center gap-2 font-display text-base sm:text-lg font-bold tracking-tight">
          <Mark size={32} />
          {BRAND.name}
        </button>
        <span className="flex items-center gap-2 sm:gap-4">
          <a href="/shop" className="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 transition hover:text-ink sm:inline">
            Shop
          </a>
          <a href="/deck" className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 transition hover:text-ink whitespace-nowrap py-2">
            <span className="hidden sm:inline">My </span>Deck
          </a>
          <SoundToggle />
          <AuthNav />
          <button onClick={reset} className="shrink-0 whitespace-nowrap rounded-full border border-line px-2.5 py-1.5 text-[13px] sm:text-sm text-ink-2 hover:border-ink-3 hover:text-ink sm:px-4">
            New sign
          </button>
        </span>
      </nav>

      {returning && (
        <p className="rise mx-auto mt-4 max-w-6xl px-4 text-sm text-ink-3 sm:px-6">
          Welcome back. Your sign and your feedback are where you left them.
        </p>
      )}
      {error && !replanning && (errorReason === "credits" || errorReason === "deckfull" ? (
        <div className="mx-auto mt-6 flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-4 sm:px-6">
          <p className="font-serif text-[19px] italic text-ink-2">{error}</p>
          <a href="/vs" className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-paper">Find a fight</a>
          <a href="/deck" className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 hover:text-ink">Your deck</a>
        </div>
      ) : (
        <p className="mx-auto mt-4 max-w-6xl px-4 text-sm text-bad sm:px-6">{error}</p>
      ))}

      {shown && (
        <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
          <ResultsView result={shown} votes={votes} onVote={vote} onShare={() => setShare(true)} onReplan={replan} pending={pending} fight={fight} />
        </main>
      )}

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
