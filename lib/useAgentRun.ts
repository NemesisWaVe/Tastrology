"use client";

import { useCallback, useRef, useState } from "react";
import type { AgentRequest, StyleResult, TraceEvent } from "./types";

/** Turn transport / agent failures into something a person can act on. Never surface raw status text. */
function friendly(status: number | null, raw: string | undefined, retryAfterS: number | null): string {
  const wait = retryAfterS ? ` Give it about ${retryAfterS} second${retryAfterS === 1 ? "" : "s"}, then try again.` : " Give it a minute, then try again.";
  if (status === 429 || /rate.?limit|too many|429|quota/i.test(raw ?? "")) return `The stars are crowded right now.${wait} A demo persona opens instantly.`;
  if (status === 503) return "Tastrology is slammed right now and new readings are on hold for a bit. The demo personas on the home page still open instantly.";
  if (status === 413) return "That request was too big. Try fewer or shorter picks.";
  if (status === 400 && raw) return raw;
  if (raw && /at least 2 seeds/i.test(raw)) return "Qloo couldn't find enough of those picks. Try the full name, or pick a suggestion from the list.";
  if (status !== null && status >= 500) return "Our readers tripped mid-run. Nothing was lost, so you can try again.";
  if (status === null && /fetch|network|load failed|abort/i.test(raw ?? "")) return "Couldn't reach the server. Check your connection and try again.";
  if (raw && /stopped without an answer/i.test(raw)) return "The reading ended before it found an answer. Try again.";
  return "Something went sideways while reading your taste. Try again in a moment.";
}

function parseRetryAfter(h: string | null): number | null {
  if (!h) return null;
  const n = Number(h);
  if (Number.isFinite(n)) return Math.min(Math.max(Math.ceil(n), 1), 120);
  const t = Date.parse(h);
  return Number.isFinite(t) ? Math.min(Math.max(Math.ceil((t - Date.now()) / 1000), 1), 120) : null;
}

/** Streams an agent run from /api/agent (NDJSON): live trace events, then the result. */
export function useAgentRun() {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [result, setResult] = useState<StyleResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const inflight = useRef(false);
  const ctrl = useRef<AbortController | null>(null);
  /** Epoch ms before which we shouldn't hit the API again (from a Retry-After header). */
  const cooldown = useRef(0);

  /** True while a run is in flight (synchronous: safe against double taps in the same tick). */
  const busy = useCallback(() => inflight.current, []);

  /** Abandon the current run (e.g. the user navigated Back). The last good result is kept. */
  const cancel = useCallback(() => {
    seq.current++;
    ctrl.current?.abort();
    ctrl.current = null;
    inflight.current = false;
    setRunning(false);
    setError(null);
  }, []);

  const run = useCallback(async (req: AgentRequest): Promise<StyleResult | null> => {
    if (inflight.current) return null; // ignore starts while a run is in flight
    inflight.current = true;
    const id = ++seq.current;
    const ac = new AbortController();
    ctrl.current = ac;
    setRunning(true);
    setError(null);
    setEvents([]);
    try {
      const wait = cooldown.current - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (id !== seq.current) return null;
      const res = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req), signal: ac.signal });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        const ra = parseRetryAfter(res.headers.get("retry-after"));
        if (ra) cooldown.current = Date.now() + ra * 1000;
        throw Object.assign(new Error(j.error ?? `Request failed (${res.status})`), { status: res.status, retryAfter: ra });
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
      if (id === seq.current) {
        const e = err as Error & { status?: number; retryAfter?: number | null };
        // The last good result stays in state; only the error is recorded.
        setError(friendly(e.status ?? null, e.message, e.retryAfter ?? null));
      }
      return null;
    } finally {
      if (id === seq.current) {
        setRunning(false);
        inflight.current = false;
        ctrl.current = null;
      }
    }
  }, []);

  return { events, result, running, error, run, setResult, busy, cancel };
}
