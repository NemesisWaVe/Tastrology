"use client";

import { Mark } from "@/components/site/Mark";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sky } from "@/components/reveal/Sky";
import { skyState } from "@/components/reveal/traceModel";
import { Landing } from "@/components/landing/Landing";
import { OwnedReading } from "@/components/results/OwnedReading";
import { Reveal } from "@/components/reveal/Reveal";
import { takePendingRun } from "@/lib/authBridge";
import { isPersonaRequest } from "@/lib/personas";
import { clearLatest, codeOf, forgetReading, isFresh, latestCode, loadLatest, loadReading, markFresh, saveReading, type Reading } from "@/lib/readings";
import { TWIN_CODE } from "@/lib/twins";
import type { AgentRequest, StyleResult } from "@/lib/types";
import { useAgentRun } from "@/lib/useAgentRun";
import { befriendInviter, recordScanMint } from "@/lib/telemetry";

type Stage = "home" | "reveal" | "result";

/** The reading on screen at the result stage. `flight`: it arrived from the pack, so the card flies in. */
interface Open {
  reading: Reading & { result: StyleResult };
  latest: boolean;
  returning: boolean;
  flight: boolean;
}

/** A live card's home is /c/<code>; a demo (mock) reading has none and stays on /. */
const homeOf = (r: StyleResult) => {
  const code = r.mode === "mock" ? null : codeOf(r);
  return code ? `/c/${encodeURIComponent(code)}` : "/";
};

/** The reading this history entry was showing: the one for the code in the address bar (/c/<code>), else the latest. */
function readingHere(): Reading | null {
  const code = /^\/c\/([^/?#]+)/.exec(location.pathname)?.[1];
  return (code && loadReading(decodeURIComponent(code).toUpperCase())) || loadLatest();
}

const stateOf = () => (history.state as { s?: Stage } | null)?.s;

export default function Home() {
  const { events, result, running, error, errorReason, run, busy, cancel } = useAgentRun();
  const [stage, setStage] = useState<Stage>("home");
  const [req, setReq] = useState<AgentRequest | undefined>();
  const [current, setCurrent] = useState<Open | null>(null);
  /** The reveal stays mounted (fading) for a moment after "See your receipts", while its card flies to the hero. */
  const [leaving, setLeaving] = useState(false);
  /** False until localStorage has been checked, so a saved sign never flashes the landing page. */
  const [ready, setReady] = useState(false);
  /** A saved sign exists (shown as a "resume" option on the landing page). */
  const [saved, setSaved] = useState<Reading | null>(null);

  // ?vs=<code>: someone challenged you. Kept for the whole session; the reading offers it as a Fight link.
  useEffect(() => {
    const code = new URLSearchParams(location.search).get("vs")?.toUpperCase() ?? "";
    try {
      if (TWIN_CODE.test(code)) sessionStorage.setItem("tastrology:vs", code);
    } catch {}
  }, []);

  const show = useCallback((reading: Reading | null, opts: { returning?: boolean; flight?: boolean } = {}) => {
    if (!reading?.result) return false;
    const code = codeOf(reading.result);
    setCurrent({
      reading: reading as Open["reading"],
      latest: Boolean(code) && code === latestCode(),
      returning: Boolean(opts.returning),
      flight: Boolean(opts.flight),
    });
    setStage("result");
    return true;
  }, []);

  // Memory: a return visit lands straight on your sign, at its card's address. History is home -> result so Back goes
  // to the landing page. "/?new=1" (shop, "New card") starts fresh instead; the card stays in the deck.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("new") === "1") {
      // Clean the URL and mark this entry home, so the landing page is this entry and nothing steps Back.
      try {
        history.replaceState({ s: "home" }, "", "/");
      } catch {}
      clearLatest();
      setReady(true);
      return;
    }
    const here = stateOf();
    // Back onto the landing entry (Next can remount this page on Back) stays on the landing page, with the resume pill.
    const s = here === "home" || here === "reveal" ? null : readingHere();
    // A cold visit opens the reading only right after its mint; later visits get the landing page and the resume pill.
    // Coming Back into the result entry (from /deck, /vs) still shows it.
    if (s?.result && (here === "result" || isFresh(codeOf(s.result)))) {
      show(s, { returning: true });
      // Only on a cold load: coming Back into this entry (from /deck, /vs) it's already the result entry, and pushing
      // again would add a phantom landing page and wipe Forward.
      try {
        if (here !== "result") {
          history.replaceState({ s: "home" }, "", "/");
          history.pushState({ s: "result" }, "", homeOf(s.result));
        }
      } catch {}
    } else {
      try {
        history.replaceState({ s: "home" }, "");
      } catch {}
    }
    setSaved(loadLatest());
    setReady(true);
  }, [show]);

  // Restored from the back/forward cache (iOS Safari keeps whole pages): no popstate fires and nothing re-checks, so a
  // reading burned in the meantime would come back. Re-read storage: a reading that's gone sends the page home.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setSaved(loadLatest());
      setCurrent((c) => {
        const code = c ? codeOf(c.reading.result) : null;
        if (!c || !code || loadReading(code)) return c;
        setStage("home");
        return null;
      });
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // Browser Back/Forward: Back from reveal/result returns to the landing page; the saved sign stays available.
  useEffect(() => {
    const onPop = () => {
      // (a Next dev refresh can wipe our marker on an entry; treat unknown as home)
      if (stateOf() === "result" && show(readingHere())) return;
      cancel();
      setLeaving(false);
      setSaved(loadLatest());
      setStage("home");
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [cancel, show]);

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
        // a fresh state (not history.state, which carries Next's marker), so Next's router keeps this URL too
        history.replaceState({ s: stateOf() }, "", `#${id}`);
      } catch {}
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const start = useCallback(
    (r: AgentRequest) => {
      if (busy()) return; // double tap / re-entry while a run is in flight
      setReq(r);
      setCurrent(null);
      setLeaving(false);
      setStage("reveal");
      window.scrollTo({ top: 0 });
      try {
        if (stateOf() !== "reveal") history.pushState({ s: "reveal" }, "");
      } catch {}
      run(r);
    },
    [run, busy],
  );

  // Back from a sign-in that left the page (e.g. Google): start the reading that was waiting on it.
  // Runs once: the wait can last through a whole sign-up, so a changing `start` must not drop the parked reading.
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    void takePendingRun().then((r) => {
      if (r) startRef.current(r);
    });
  }, []);

  // "See your receipts": the reading becomes the latest, the result mounts under the fading reveal, and the card flies
  // from the pack to the hero (shared layoutId). The page is already at the top, so nothing scrolls. The reading
  // then moves the address bar to the card's home, /c/<code>.
  const reduce = Boolean(useReducedMotion());
  const toResult = () => {
    if (!result || stage !== "reveal") return;
    const reading: Reading = { req, result, votes: {}, pinned: [] };
    const minted = saveReading(reading, { latest: true });
    if (minted && result.mode !== "mock") markFresh(minted);
    if (!isPersonaRequest(req)) try { localStorage.setItem("tastrology:first-card", "1"); } catch {}
    window.dispatchEvent(new Event("tastrology:minted"));
    if (result.mode === "live" && !result.cached) recordScanMint();
    if (result.mode === "live") void befriendInviter();
    // The reveal locks page scroll; unlock it before both cards are measured, or the scrollbar coming back when the
    // reveal unmounts nudges the landed card sideways.
    document.body.style.overflow = "";
    try {
      history.replaceState({ s: "result" }, "");
    } catch {}
    show(reading, { flight: !reduce });
    setLeaving(true);
  };
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(false), reduce ? 250 : 800);
    return () => clearTimeout(t);
  }, [leaving, reduce]);

  /** Back to the landing page without discarding the saved sign. */
  const goHome = () => {
    const s = stateOf();
    if (s && s !== "home") history.back();
    else {
      cancel();
      setSaved(loadLatest());
      setStage("home");
    }
  };

  const resume = () => {
    if (!saved?.result) return;
    show(saved, { returning: true });
    window.scrollTo({ top: 0 });
    try {
      history.pushState({ s: "result" }, "", homeOf(saved.result));
    } catch {}
  };

  /** "New card": forget the latest reading (the card, and its reading under its code, stay) and go to the landing page. */
  const reset = () => {
    clearLatest();
    setCurrent(null);
    setSaved(null);
    goHome();
  };

  // A returning sign that was burned (here or on another device) is gone: drop it and land on the home page.
  const resetRef = useRef(reset);
  resetRef.current = reset;
  const returningCode = current?.returning && current.reading.result.mode !== "mock" ? codeOf(current.reading.result) : null;
  useEffect(() => {
    if (!returningCode) return;
    let off = false;
    fetch(`/api/card?code=${encodeURIComponent(returningCode)}`, { cache: "no-store" })
      .then((r) => {
        if (off || r.status !== 410) return;
        forgetReading(returningCode);
        resetRef.current();
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [returningCode]);

  // Your sky behind the calm "not now" screen.
  const sky = useMemo(
    () => (result ? skyState(result.seeds, result.dna.name, result.dna.lobes.map((l) => l.seedIds), (result.inert ?? []).map((x) => x.id), result.vibes) : null),
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

  // Turned away before any reading started (no card left this month, a full deck, or a regret on the same picks):
  // that's a wait, not a crash, so it gets a calm screen instead of the "something broke" reveal.
  if (stage === "reveal" && error && (errorReason === "credits" || errorReason === "deckfull" || errorReason === "samepicks"))
    return (
      <div className="relative isolate grid min-h-screen place-items-center px-5">
        {sky && <Sky f={sky} reduce={reduce} drawn fixed quiet dim={0.5} />}
        <div className="rise w-full max-w-md text-center">
          <Mark size={44} className="mx-auto" />
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">
            {errorReason === "credits" ? "Between new moons" : errorReason === "deckfull" ? "Deck full" : "Same picks"}
          </p>
          <h1 className="mt-3 font-serif text-4xl italic leading-tight text-ink">
            {errorReason === "credits" ? "Your next card is on its way." : errorReason === "deckfull" ? "Your deck has no room left." : "Pick something different."}
          </h1>
          <p className="mt-4 text-ink-2">{error}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {errorReason === "samepicks" ? (
              <button type="button" onClick={goHome} className="rounded-full bg-accent px-5 py-2.5 font-semibold text-paper">
                Change my picks
              </button>
            ) : (
              <Link href="/vs" className="rounded-full bg-accent px-5 py-2.5 font-semibold text-paper">
                Find a fight
              </Link>
            )}
            <Link href="/deck" className="rounded-full border border-line px-5 py-2.5 text-ink-2 hover:text-ink">
              Your deck
            </Link>
            <button type="button" onClick={goHome} className="px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink">
              Back
            </button>
          </div>
        </div>
      </div>
    );

  // One tree for the reveal and the result, in fixed slots: on "See your receipts" the reveal keeps its place (and its
  // pack) while the reading mounts beside it, which is what lets the card fly between them.
  const code = current ? codeOf(current.reading.result) : null;
  return (
    <>
      {stage === "result" && current && (
        <OwnedReading key={code ?? "reading"} initial={current.reading} latest={current.latest} returning={current.returning} flight={current.flight} onNew={reset} />
      )}
      {(stage === "reveal" || leaving) && (
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
          leaving={leaving}
        />
      )}
    </>
  );
}
