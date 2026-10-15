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

export function TracePanel({ events, running, compact = false }: { events: TraceEvent[]; running: boolean; compact?: boolean }) {
  const rows = toRows(events);
  const calls = events.reduce((n, e) => n + (e.type === "tool" ? e.calls.length : 0), 0);
  const cached = events.reduce((n, e) => n + (e.type === "tool" ? e.calls.filter((c) => c.cached).length : 0), 0);

  return (
    <section className="rounded-2xl border border-line bg-card" aria-live="polite">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${running ? "bg-accent pulse-dot" : "bg-good"}`} />
          <h2 className="text-sm font-semibold tracking-tight">Agent trace</h2>
        </div>
        <span className="font-mono text-[11px] text-ink-3">
          {calls} Qloo call{calls === 1 ? "" : "s"}
          {cached ? ` · ${cached} cached` : ""}
        </span>
      </header>
      <ol className={`space-y-1 overflow-y-auto px-3 py-3 ${compact ? "max-h-72" : "max-h-[60vh]"}`}>
        {rows.map((r, i) => (
          <li key={i} className="rise">
            {r.kind === "step" && <StepRow r={r} />}
            {r.kind === "thought" && (
              <p className="ml-6 border-l-2 border-line py-1 pl-3 text-[13px] italic text-ink-2">{r.text}</p>
            )}
            {r.kind === "tool" && <ToolRow e={r.e} />}
          </li>
        ))}
        {running && rows.length === 0 && <li className="px-1 text-sm text-ink-3">Starting the agent…</li>}
      </ol>
    </section>
  );
}

function StepRow({ r }: { r: Extract<Row, { kind: "step" }> }) {
  const icon = r.status === "run" ? <span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" /> : r.status === "warn" ? "!" : "✓";
  const tone = r.status === "warn" ? "bg-warn-soft text-warn" : r.status === "done" ? "bg-good-soft text-good" : "bg-accent-soft";
  return (
    <div className="flex items-start gap-2.5 py-1">
      <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium leading-snug">{r.label}</p>
        {r.detail && <p className="truncate text-xs text-ink-3">{r.detail}</p>}
      </div>
    </div>
  );
}

function ToolRow({ e }: { e: Extract<TraceEvent, { type: "tool" }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ml-6">
      <button onClick={() => setOpen(!open)} className="group flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left hover:bg-paper-2">
        <code className="shrink-0 rounded bg-ink px-1.5 py-0.5 font-mono text-[10.5px] text-paper">{e.name}</code>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2">{e.summary}</span>
        <span className="shrink-0 text-[10px] text-ink-3 group-hover:text-ink-2">{open ? "hide" : `${e.calls.length} call${e.calls.length === 1 ? "" : "s"}`}</span>
      </button>
      {open && (
        <div className="mb-1 ml-2 mt-1 space-y-1.5 rounded-lg bg-paper-2 p-2.5">
          {e.calls.map((c, i) => (
            <div key={i} className="font-mono text-[10.5px] leading-relaxed text-ink-2">
              <span className="font-semibold text-ink">GET {c.endpoint}</span>
              <span className="text-ink-3">
                {" "}
                · {c.count} results · {c.cached ? "cache" : `${c.ms}ms`}
              </span>
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
      )}
    </div>
  );
}
