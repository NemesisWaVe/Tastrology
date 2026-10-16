"use client";

import { useState } from "react";
import type { TraceEvent } from "@/lib/types";

type Row =
  | { kind: "step"; id: string; label: string; status: "run" | "done" | "warn"; detail?: string }
  | { kind: "thought"; text: string }
  | { kind: "tool"; e: Extract<TraceEvent, { type: "tool" }> };

export function toRows(events: TraceEvent[]): Row[] {
  const rows: Row[] = [];
  for (const e of events) {
    if (e.type === "step") {
      const i = rows.findIndex((r) => r.kind === "step" && r.id === e.id);
      const row: Row = { kind: "step", id: e.id, label: e.label, status: e.status, detail: e.detail };
      if (i >= 0) rows[i] = row;
      else rows.push(row);
    } else if (e.type === "thought") rows.push({ kind: "thought", text: e.text });
    else if (e.type === "tool") rows.push({ kind: "tool", e });
  }
  return rows;
}

/** What each agent step means, in words a non-developer would use. The agent's own label stays one tap away. */
const PLAIN: Record<string, { run: string; done: string }> = {
  plan: { run: "Deciding what to look up", done: "Made a plan" },
  resolve: { run: "Finding your picks in Qloo", done: "Found your picks in Qloo" },
  tags: { run: "Reading the vibe of each pick", done: "Read the vibe of each pick" },
  insights: { run: "Pulling brands people with your taste like", done: "Pulled a shortlist of brands" },
  ablate: { run: "Checking which pick earned which brand", done: "Checked which pick earned which brand" },
  critique: { run: "Throwing out matches it can't back up", done: "Kept the matches it can back up" },
  sideb: { run: "Searching for the side of you that doesn't fit", done: "Found brands for your other side" },
  bridges: { run: "Looking for films, books and places to go with it", done: "Found films, books and places to go with it" },
};

interface Group {
  step?: Extract<Row, { kind: "step" }>;
  thoughts: string[];
  tools: Extract<TraceEvent, { type: "tool" }>[];
}

function group(rows: Row[]): Group[] {
  const out: Group[] = [];
  for (const r of rows) {
    if (r.kind === "step") out.push({ step: r, thoughts: [], tools: [] });
    else {
      if (!out.length) out.push({ thoughts: [], tools: [] });
      const g = out[out.length - 1];
      if (r.kind === "thought") g.thoughts.push(r.text);
      else g.tools.push(r.e);
    }
  }
  return out;
}

export function TracePanel({ events, running, compact = false }: { events: TraceEvent[]; running: boolean; compact?: boolean }) {
  const groups = group(toRows(events));
  const calls = events.reduce((n, e) => n + (e.type === "tool" ? e.calls.length : 0), 0);
  const cached = events.reduce((n, e) => n + (e.type === "tool" ? e.calls.filter((c) => c.cached).length : 0), 0);

  return (
    <section className="rounded-2xl border border-line bg-card" aria-live="polite">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${running ? "bg-accent pulse-dot" : "bg-good"}`} />
          <h2 className="text-sm font-semibold tracking-tight">{running ? "What the agent is doing" : "What the agent did"}</h2>
        </div>
        <span className="font-mono text-[11px] text-ink-3">
          {calls} lookup{calls === 1 ? "" : "s"} in Qloo
          {cached ? ` · ${cached} reused` : ""}
        </span>
      </header>
      <ol className={`space-y-0.5 overflow-y-auto px-2 py-2 ${compact ? "max-h-72" : "max-h-[60vh]"}`}>
        {groups.map((g, i) => (
          <li key={g.step?.id ?? `pre-${i}`} className="rise">
            <StepGroup g={g} />
          </li>
        ))}
        {running && groups.length === 0 && <li className="px-2 py-1.5 text-sm text-ink-3">Sending your picks to the agent…</li>}
      </ol>
    </section>
  );
}

function StepGroup({ g }: { g: Group }) {
  const [open, setOpen] = useState(false);
  const r = g.step;
  const status = r?.status ?? "done";
  const plain = r ? PLAIN[r.id] : undefined;
  const title = plain ? (status === "run" ? plain.run : plain.done) : (r?.label ?? "Notes");
  const hasMore = Boolean(r?.label || r?.detail || g.thoughts.length || g.tools.length);
  const icon = status === "run" ? <span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" /> : status === "warn" ? "!" : "✓";
  const tone = status === "warn" ? "bg-warn-soft text-warn" : status === "done" ? "bg-good-soft text-good" : "bg-accent-soft";
  const nCalls = g.tools.reduce((n, t) => n + t.calls.length, 0);

  return (
    <div>
      <button
        onClick={() => hasMore && setOpen(!open)}
        aria-expanded={hasMore ? open : undefined}
        className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-paper-2"
      >
        <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${tone}`}>{icon}</span>
        <span className="min-w-0 flex-1 text-[13.5px] font-medium leading-snug">{title}</span>
        {hasMore && (
          <span className="shrink-0 pt-0.5 font-mono text-[10px] text-ink-3">
            {open ? "less" : nCalls ? `${nCalls} lookup${nCalls === 1 ? "" : "s"}` : "more"}
          </span>
        )}
      </button>
      {open && (
        <div className="mb-1.5 ml-8 mr-1 space-y-2 rounded-lg bg-paper-2 p-2.5 text-[12px] leading-relaxed text-ink-2">
          {r && plain && <p className="text-ink">{r.label}</p>}
          {r?.detail && <p className="text-ink-3">{r.detail}</p>}
          {g.thoughts.map((t, i) => (
            <p key={i} className="border-l-2 border-line pl-2 italic">
              {t}
            </p>
          ))}
          {g.tools.map((e, i) => (
            <ToolDetail key={i} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolDetail({ e }: { e: Extract<TraceEvent, { type: "tool" }> }) {
  return (
    <div className="border-t border-line/70 pt-2 font-mono text-[10.5px]">
      <p>
        <code className="rounded bg-ink px-1.5 py-0.5 text-paper">{e.name}</code> <span className="text-ink-2">{e.summary}</span>
      </p>
      {e.calls.map((c, i) => (
        <div key={i} className="mt-1 leading-relaxed text-ink-3">
          <span className="text-ink-2">GET {c.endpoint}</span> · {c.count} results · {c.cached ? "cache" : `${c.ms}ms`}
          <div className="break-all">
            {Object.entries(c.params).map(([k, v]) => (
              <div key={k}>
                <span className="text-accent">{k}</span>={v.length > 90 ? v.slice(0, 90) + "…" : v}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
