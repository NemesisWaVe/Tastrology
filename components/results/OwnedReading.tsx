"use client";

import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthNav } from "@/components/auth/AuthNav";
import { ShareSheet } from "@/components/card/ShareSheet";
import { Sky } from "@/components/reveal/Sky";
import { skyState } from "@/components/reveal/traceModel";
import { Mark } from "@/components/site/Mark";
import { SoundToggle } from "@/components/site/SoundToggle";
import { TracePanel } from "@/components/TracePanel";
import { clearDraft } from "@/lib/authBridge";
import { BRAND } from "@/lib/brand";
import { addToDeck } from "@/lib/deck";
import { isPersonaRequest } from "@/lib/personas";
import { codeOf, saveReading, type Reading } from "@/lib/readings";
import { TWIN_CODE } from "@/lib/twins";
import type { BrandMatch, StyleResult } from "@/lib/types";
import { useAgentRun } from "@/lib/useAgentRun";
import { ResultsView, type Vote } from "./ResultsView";

/**
 * Your own reading of a card: hero, receipts, matches, capsule and the re-plan loop. The same view right after the
 * reveal on / and on the card's home, /c/<code>, whenever this device holds the reading.
 */
export function OwnedReading({
  initial,
  latest: latestAtStart,
  returning = false,
  onNew,
  flight = false,
  verified,
  onPull,
  after,
}: {
  initial: Reading & { result: StyleResult };
  /** This is the device's latest reading (home reopens it); a re-read always becomes the latest. */
  latest: boolean;
  returning?: boolean;
  /** The wordmark and "New sign". */
  onNew: () => void;
  /** The card just flew in from the pack: the hero skips its own entrance so the shared card lands cleanly. */
  flight?: boolean;
  /** On /c: whether the server holds the card ("Verified original") or only this device does. */
  verified?: boolean;
  onPull?: () => void;
  after?: ReactNode;
}) {
  const { events, running, error, errorReason, run, busy, cancel } = useAgentRun();
  const [req] = useState(initial.req);
  const [result, setResult] = useState<StyleResult>(initial.result);
  const [votes, setVotes] = useState<Record<string, Vote>>(initial.votes);
  const [pinned, setPinned] = useState<BrandMatch[]>(initial.pinned);
  const [latest, setLatest] = useState(latestAtStart);
  const [replanning, setReplanning] = useState(false);
  const [share, setShare] = useState(false);
  useEffect(() => cancel, [cancel]);

  // Persist every change under the card code (and as the latest reading when it is). A live card keeps the address
  // bar on its home, /c/<code>, including after a re-read mints a new code.
  useEffect(() => {
    const code = saveReading({ req, result, votes, pinned }, { latest });
    if (latest && !isPersonaRequest(req)) clearDraft();
    if (!code || result.mode === "mock") return;
    const path = `/c/${encodeURIComponent(code)}`;
    if (location.pathname !== path)
      try {
        // A fresh state object (not history.state, which carries Next's own marker), so Next's router takes the new URL
        // as its own and doesn't put the old one back on its next update.
        history.replaceState({ s: (history.state as { s?: string } | null)?.s }, "", path);
      } catch {}
  }, [req, result, votes, pinned, latest]);

  // File each live card into this device's deck (server-side, write-once). Demo personas stay out.
  useEffect(() => {
    if (result.mode === "mock" || isPersonaRequest(req)) return;
    const code = codeOf(result);
    if (code) addToDeck(code);
  }, [result, req]);

  /** Someone challenged you (?vs=<code> on arrival, kept for the session): results answer that fighter. */
  const [vs, setVs] = useState<{ code: string; name: string } | null>(null);
  useEffect(() => {
    let code = "";
    try {
      code = sessionStorage.getItem("tastrology:vs") ?? "";
    } catch {}
    if (!TWIN_CODE.test(code)) return;
    let off = false;
    fetch(`/api/card?code=${code}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { card?: { archetype?: string } } | null) => !off && j?.card && setVs({ code, name: j.card.archetype ?? "them" }))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, []);

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
    const prev = result.feedback ?? { liked: [], disliked: [] };
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    return liked.length + disliked.length > 0 && !(same(liked, prev.liked) && same(disliked, prev.disliked));
  }, [liked, disliked, result]);

  // Feedback loop: up-voted brands become Qloo signals, down-voted ones are excluded, and the agent re-plans.
  const replan = async () => {
    if (running || busy()) return;
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
      ...(result.vibes?.length ? { vibes: result.vibes.map(({ id, name }) => ({ id, name })) } : {}),
      budget: req?.budget,
      goal: req?.goal,
      feedback: { liked, disliked },
      previous: { brandIds: result.brands.map((b) => b.entity.id), names },
    });
    setReplanning(false);
    if (next) {
      setResult(next);
      setLatest(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Liked brands stay visible even when Qloo excludes them from the next round (they're signals now).
  const shown = useMemo(() => {
    const keep = pinned.filter((p) => votes[p.entity.id] === "up" && !result.brands.some((b) => b.entity.id === p.entity.id));
    return { ...result, brands: [...keep, ...result.brands] };
  }, [result, pinned, votes]);

  const fight = useMemo(() => {
    if (!vs || result.mode === "mock") return undefined;
    const mine = codeOf(result);
    return !mine || mine === vs.code ? undefined : { href: `/vs/${vs.code}?vs=${mine}`, name: vs.name };
  }, [vs, result]);

  // The share card never features a brand the user downvoted.
  const shareable = useMemo(() => ({ ...shown, brands: shown.brands.filter((b) => votes[b.entity.id] !== "down") }), [shown, votes]);

  // Your sky stays with you on the reading: far back, no captions (quiet), so the receipt and cards lead.
  const reduce = Boolean(useReducedMotion());
  const sky = useMemo(
    () => skyState(result.seeds, result.dna.name, result.dna.lobes.map((l) => l.seedIds), (result.inert ?? []).map((x) => x.id)),
    [result],
  );

  return (
    // isolate: the quiet sky (-z-10) stacks inside this root, above the body background and behind the content
    <div className="relative isolate min-h-screen">
      <Sky f={sky} reduce={reduce} drawn fixed quiet dim={0.4} />
      <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-line/60 bg-paper/70 px-3 py-3 backdrop-blur-md sm:px-6">
        <button onClick={onNew} className="flex items-center gap-2 font-display text-base sm:text-lg font-bold tracking-tight">
          <Mark size={32} />
          {BRAND.name}
        </button>
        <span className="flex items-center gap-2 sm:gap-4">
          <Link href="/shop" className="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 transition hover:text-ink sm:inline">
            Shop
          </Link>
          <Link href="/deck" className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 transition hover:text-ink whitespace-nowrap py-2">
            <span className="hidden sm:inline">My </span>Deck
          </Link>
          <SoundToggle />
          <AuthNav />
          <button onClick={onNew} className="shrink-0 whitespace-nowrap rounded-full border border-line px-2.5 py-1.5 text-[13px] sm:text-sm text-ink-2 hover:border-ink-3 hover:text-ink sm:px-4">
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
          <Link href="/vs" className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-paper">Find a fight</Link>
          <Link href="/deck" className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 hover:text-ink">Your deck</Link>
        </div>
      ) : (
        <p className="mx-auto mt-4 max-w-6xl px-4 text-sm text-bad sm:px-6">{error}</p>
      ))}

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <ResultsView
          result={shown}
          votes={votes}
          onVote={vote}
          onShare={() => setShare(true)}
          onReplan={replan}
          pending={pending}
          fight={fight}
          flight={flight}
          verified={verified}
          onPull={onPull}
          after={after}
        />
      </main>

      {replanning && (
        <div className="rise fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-xl p-3">
          <div className="rounded-2xl border border-line bg-paper/95 p-2 shadow-2xl backdrop-blur-md">
            <p className="px-3 pt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Re-reading your stars with your feedback…</p>
            <TracePanel events={events} running={running} compact />
          </div>
        </div>
      )}

      {share && <ShareSheet result={shareable} linkable={shareable.mode !== "mock"} onClose={() => setShare(false)} />}
    </div>
  );
}
