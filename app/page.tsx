"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Results, type Vote } from "@/components/Results";
import { SeedPicker, type Seed } from "@/components/SeedPicker";
import { ShareCard } from "@/components/ShareCard";
import { TracePanel } from "@/components/TracePanel";
import { PERSONAS, type Persona } from "@/lib/personas";
import type { AgentRequest, BrandMatch, StyleResult, TraceEvent } from "@/lib/types";

type Stage = "home" | "run" | "result";
const STORE = "tastemirror:v1";

interface Saved {
  seeds: Seed[];
  budget?: 1 | 2 | 3;
  goal?: string;
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
  const [stage, setStage] = useState<Stage>("home");
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [budget, setBudget] = useState<1 | 2 | 3 | undefined>();
  const [goal, setGoal] = useState("");
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [result, setResult] = useState<StyleResult | null>(null);
  const [votes, setVotes] = useState<Record<string, Vote>>({});
  const [pinned, setPinned] = useState<BrandMatch[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState(false);
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    const s = load();
    if (!s) return;
    setSeeds(s.seeds ?? []);
    setBudget(s.budget);
    setGoal(s.goal ?? "");
    setVotes(s.votes ?? {});
    setPinned(s.pinned ?? []);
    if (s.result) {
      setResult(s.result);
      setStage("result");
      setReturning(true);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ seeds, budget, goal, result: result ?? undefined, votes, pinned } satisfies Saved));
    } catch {}
  }, [seeds, budget, goal, result, votes, pinned]);

  const run = useCallback(async (req: AgentRequest) => {
    setStage("run");
    setRunning(true);
    setError(null);
    setEvents([]);
    setReturning(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let got: StyleResult | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as TraceEvent;
          if (e.type === "result") got = e.result;
          else if (e.type === "error") throw new Error(e.message);
          else setEvents((prev) => [...prev, e]);
        }
      }
      if (!got) throw new Error("The agent stopped without an answer.");
      setResult(got);
      setStage("result");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }, []);

  const startPersona = (p: Persona) => {
    const s = p.seeds.map((x) => ({ id: `${x.kind}:${x.name}`, name: x.name, kind: x.kind }));
    setSeeds(s);
    setBudget(p.budget);
    setGoal("");
    setVotes({});
    setPinned([]);
    run({ seeds: p.seeds.map((x) => ({ id: "", ...x })), budget: p.budget });
  };

  const startCustom = () => {
    setVotes({});
    setPinned([]);
    run({ seeds: seeds.map(seedReq), budget, goal: goal.trim() || undefined });
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
    return !(same(liked, prev.liked) && same(disliked, prev.disliked)) && liked.length + disliked.length > 0;
  }, [liked, disliked, result]);

  const replan = () => {
    if (!result) return;
    const pins = [...pinned.filter((p) => liked.includes(p.entity.id)), ...result.brands.filter((b) => liked.includes(b.entity.id) && !pinned.some((p) => p.entity.id === b.entity.id))];
    setPinned(pins);
    const names: Record<string, string> = {};
    for (const b of [...result.brands, ...pins]) names[b.entity.id] = b.entity.name;
    run({
      seeds: result.seeds.map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
      budget,
      goal: goal.trim() || undefined,
      feedback: { liked, disliked },
      previous: { brandIds: result.brands.map((b) => b.entity.id), names },
    });
  };

  const reset = () => {
    setStage("home");
    setResult(null);
    setEvents([]);
    setVotes({});
    setPinned([]);
    setError(null);
    setReturning(false);
  };

  const shown = result ? { ...result, brands: [...pinned.filter((p) => !result.brands.some((b) => b.entity.id === p.entity.id) && votes[p.entity.id] === "up"), ...result.brands] } : null;

  return (
    <div className="min-h-screen">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <button onClick={reset} className="flex items-center gap-2">
          <span className="mirror grid h-8 w-8 place-items-center rounded-full border border-line font-serif text-lg">T</span>
          <span className="font-serif text-2xl tracking-tight">TasteMirror</span>
        </button>
        <span className="hidden rounded-full border border-line px-3 py-1 text-[11px] text-ink-2 sm:block">Agents, but with taste · powered by Qloo</span>
      </nav>

      {stage === "home" && (
        <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <section className="grid gap-10 pt-6 lg:grid-cols-[1.1fr_1fr] lg:pt-14">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">No quiz · no purchase history</p>
              <h1 className="mt-4 font-serif text-[56px] leading-[0.92] sm:text-[76px]">
                Your taste already
                <br />
                knows <em>your style.</em>
              </h1>
              <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-ink-2">
                Name a few things you love: films, music, books, places. An agent interrogates <b className="text-ink">Qloo&apos;s cross-domain taste graph</b>, stress-tests what it finds, and
                hands you the fashion & beauty brands that fit who you are. It shows its work for every one.
              </p>
              <div className="mt-8">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-3">Try a persona: one click, ~10 seconds</p>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {PERSONAS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => startPersona(p)}
                      className="group rounded-2xl border border-line bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-ink hover:shadow-md"
                    >
                      <span className="text-2xl">{p.emoji}</span>
                      <p className="mt-2 font-serif text-[21px] leading-tight">{p.name}</p>
                      <p className="mt-1 text-xs leading-snug text-ink-3">{p.blurb}</p>
                      <p className="mt-3 text-xs font-semibold text-accent group-hover:underline">Run agent →</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-line bg-card p-5 shadow-[0_1px_0_rgba(0,0,0,0.03)] sm:p-7">
              <h2 className="font-serif text-3xl">Or bring your own taste</h2>
              <p className="mb-5 mt-1 text-sm text-ink-2">Autocomplete searches Qloo&apos;s entity graph directly.</p>
              <SeedPicker seeds={seeds.filter((s) => !s.id.includes(":"))} onChange={setSeeds} />
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-ink-2">
                  Budget
                  <select
                    value={budget ?? ""}
                    onChange={(e) => setBudget(e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : undefined)}
                    className="mt-1 block w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm font-normal"
                  >
                    <option value="">Any</option>
                    <option value="1">$ · budget (≈ under ₹3k / $40)</option>
                    <option value="2">$$ · mid (≈ ₹3k–15k / $40–180)</option>
                    <option value="3">$$$ · premium</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-ink-2">
                  Style goal (optional)
                  <input
                    value={goal}
                    onChange={(e) => setGoal(e.target.value.slice(0, 120))}
                    placeholder="e.g. office-ready but not boring"
                    className="mt-1 block w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm font-normal placeholder:text-ink-3"
                  />
                </label>
              </div>
              <button
                onClick={startCustom}
                disabled={seeds.filter((s) => !s.id.includes(":")).length < 3}
                className="mt-6 w-full rounded-xl bg-ink py-3.5 text-[15px] font-semibold text-paper transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-35"
              >
                Find my style
              </button>
            </div>
          </section>

          <section className="mt-20 grid gap-6 border-t border-line pt-10 sm:grid-cols-3">
            {[
              ["01", "Grounded, always", "Every brand, place and title comes from a Qloo API response. The AI explains; it never invents."],
              ["02", "Shows its work", "Leave-one-out re-queries and Qloo explainability prove which of your loves earned each brand."],
              ["03", "Doubts itself", "Contradicting tastes get split, not averaged. One-seed flukes get rejected before you see them."],
            ].map(([n, t, d]) => (
              <div key={n}>
                <p className="font-mono text-xs text-accent">{n}</p>
                <p className="mt-1 font-serif text-2xl">{t}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{d}</p>
              </div>
            ))}
          </section>
        </main>
      )}

      {stage !== "home" && (
        <main className="mx-auto grid max-w-6xl gap-6 px-4 pb-28 sm:px-6 lg:grid-cols-[1fr_360px]">
          <div className="order-2 min-w-0 lg:order-1">
            {returning && stage === "result" && (
              <p className="rise mb-4 rounded-xl bg-paper-2 px-4 py-2.5 text-sm text-ink-2">
                Welcome back. Your Style DNA and feedback are where you left them.{" "}
                <button onClick={reset} className="font-semibold text-ink underline">
                  Start over
                </button>
              </p>
            )}
            {error && (
              <div className="rise rounded-2xl border border-bad/30 bg-bad-soft p-5 text-bad">
                <p className="font-semibold">The agent hit a snag: {error}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={reset} className="rounded-full bg-bad px-4 py-2 text-sm font-semibold text-white">
                    Back
                  </button>
                  {PERSONAS.map((p) => (
                    <button key={p.key} onClick={() => startPersona(p)} className="rounded-full border border-bad/40 px-4 py-2 text-sm">
                      Try {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {stage === "run" && !error && <Skeleton seeds={seeds} />}
            {stage === "result" && shown && <Results result={shown} votes={votes} onVote={vote} onShare={() => setShare(true)} />}
          </div>
          <aside className="order-1 lg:order-2">
            <div className="lg:sticky lg:top-4">
              <TracePanel events={stage === "result" && events.length === 0 && result ? [{ type: "step", id: "restore", label: "Restored from your last visit", status: "done" }] : events} running={running} compact={stage === "result"} />
              {stage === "result" && (
                <button onClick={reset} className="mt-3 w-full rounded-xl border border-line bg-card py-2.5 text-sm font-medium text-ink-2 hover:border-ink-3">
                  ← New taste profile
                </button>
              )}
            </div>
          </aside>
        </main>
      )}

      {stage === "result" && pending && (
        <div className="rise fixed inset-x-0 bottom-4 z-40 mx-auto w-[calc(100%-2rem)] max-w-xl">
          <div className="flex items-center gap-3 rounded-2xl bg-ink p-2 pl-5 text-paper shadow-2xl">
            <p className="flex-1 text-sm">
              <b>{liked.length}</b> ↑ · <b>{disliked.length}</b> ↓ feedback ready
            </p>
            <button onClick={replan} disabled={running} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              Re-plan with Qloo →
            </button>
          </div>
        </div>
      )}

      {share && result && <ShareCard result={result} onClose={() => setShare(false)} />}
    </div>
  );
}

function seedReq(s: Seed) {
  return { id: s.id.includes(":") ? "" : s.id, name: s.name, kind: s.kind };
}

function Skeleton({ seeds }: { seeds: Seed[] }) {
  return (
    <div className="space-y-6">
      <div className="mirror rounded-3xl border border-line p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-ink-2">Reading your taste</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {seeds.map((s, i) => (
            <span key={s.id} className="rise rounded-full bg-ink px-3 py-1.5 text-sm text-paper" style={{ animationDelay: `${i * 80}ms` }}>
              {s.name}
            </span>
          ))}
        </div>
        <div className="shimmer mt-6 h-12 w-2/3 rounded-xl" />
        <div className="shimmer mt-3 h-4 w-1/2 rounded" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="shimmer h-36 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
