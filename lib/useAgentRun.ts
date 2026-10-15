"use client";

import { useCallback, useRef, useState } from "react";
import type { AgentRequest, StyleResult, TraceEvent } from "./types";

/** Streams an agent run from /api/agent (NDJSON): live trace events, then the result. */
export function useAgentRun() {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [result, setResult] = useState<StyleResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const run = useCallback(async (req: AgentRequest): Promise<StyleResult | null> => {
    const id = ++seq.current;
    setRunning(true);
    setError(null);
    setEvents([]);
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
          if (!line.trim() || id !== seq.current) continue;
          const e = JSON.parse(line) as TraceEvent;
          if (e.type === "result") got = e.result;
          else if (e.type === "error") throw new Error(e.message);
          else setEvents((prev) => [...prev, e]);
        }
      }
      if (!got) throw new Error("The agent stopped without an answer.");
      if (id === seq.current) setResult(got);
      return got;
    } catch (err) {
      if (id === seq.current) setError((err as Error).message);
      return null;
    } finally {
      if (id === seq.current) setRunning(false);
    }
  }, []);

  return { events, result, running, error, run, setResult };
}
