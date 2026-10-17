"use client";

import { useCallback, useRef, useState } from "react";
import { signInForRun } from "./authBridge";
import { turnstileToken } from "./turnstile";
import type { AgentRequest, StyleResult, TraceEvent } from "./types";

/** Turn transport / agent failures into something a person can act on. Never surface raw status text. */
function friendly(status: number | null, raw: string | undefined, retryAfterS: number | null): string {
  const wait = retryAfterS ? ` Give it about ${retryAfterS} second${retryAfterS === 1 ? "" : "s"}, then try again.` : " Give it a minute, then try again.";
  if (status === 429 || /rate.?limit|too many|429|quota/i.test(raw ?? "")) return `The stars are crowded right now.${wait} A demo persona opens instantly.`;
  if (status === 503) return "Tastrology is full right now, so new readings are on hold for a bit. The demo personas on the home page still open instantly.";
  if (status === 401) return "Fresh readings need an account. Sign in and try again; the demo personas open without one.";
  if (status === 402) return raw || "You're out of readings. The shop has more.";
  if (status === 409) return "That reading already ran. Start a new one.";
  if (status === 403) return "We couldn't confirm you're a person, so this reading didn't start. Refresh and try again.";
  if (status === 413) return "That request was too big. Try fewer or shorter picks.";
  if (status === 400 && raw) return raw;
  if (raw && /at least 2 seeds/i.test(raw)) return "Qloo couldn't find enough of those picks. Try the full name, or pick a suggestion from the list.";
  if (status !== null && status >= 500) return "Our readers tripped mid-run. Nothing was lost, so you can try again.";
  if (status === null && /fetch|network|load failed|abort/i.test(raw ?? "")) return "Couldn't reach the server. Check your connection and try again.";
  if (raw && /stopped without an answer/i.test(raw)) return "The reading ended before it found an answer. Try again.";
  return "Something went sideways while reading your taste. Try again in a moment.";
}

const QUEUE_MARK = "Queue:";
const SIGNIN_MARK = "Sign-in:";

/** One id per reading, reused across its retries, so the server charges a credit at most once for it. */
function newRunId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}
const MAX_QUEUE_TRIES = 4;

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
      const runId = newRunId();
      const post = (extra: Record<string, string> = {}) =>
        fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json", "x-run-id": runId, ...extra }, body: JSON.stringify(req), signal: ac.signal });
      let res = await post();
      // Fresh readings need an account (when accounts are on): open sign-in, then retry once signed in.
      if (res.status === 401 && ((await res.clone().json().catch(() => ({}))) as { reason?: string }).reason === "signin") {
        setEvents((prev) => [...prev, { type: "thought", text: `${SIGNIN_MARK} Sign in and your reading starts right here.` }]);
        const ok = await signInForRun(req, ac.signal);
        if (id !== seq.current) return null;
        setEvents((prev) => prev.filter((e) => !(e.type === "thought" && e.text.startsWith(SIGNIN_MARK))));
        if (ok) res = await post();
      }
      // Bot check requested (fresh runs only): get a Turnstile token once, then the server's cookie covers retries.
      if (res.status === 403 && ((await res.clone().json().catch(() => ({}))) as { reason?: string }).reason === "verify") {
        const token = await turnstileToken().catch(() => "");
        if (id !== seq.current) return null;
        res = await post({ "x-turnstile": token });
      }
      // Every reader busy: wait in line (honest countdown in the trace), retrying a few times before giving up.
      for (let tries = 0; res.status === 503 && tries < MAX_QUEUE_TRIES; tries++) {
        const j = (await res.clone().json().catch(() => ({}))) as { reason?: string };
        if (j.reason !== "slots") break;
        const ra = parseRetryAfter(res.headers.get("retry-after")) ?? 15;
        for (let left = ra; left > 0; left -= 5) {
          if (id !== seq.current) return null;
          setEvents((prev) => [...prev.filter((e) => !(e.type === "thought" && e.text.startsWith(QUEUE_MARK))), { type: "thought", text: `${QUEUE_MARK} Every reader is busy. You're in line; next try in ${left}s.` }]);
          await new Promise((r) => setTimeout(r, Math.min(5, left) * 1000));
        }
        if (id !== seq.current) return null;
        res = await post();
      }
      if (res.ok) setEvents((prev) => prev.filter((e) => !(e.type === "thought" && e.text.startsWith(QUEUE_MARK))));
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
