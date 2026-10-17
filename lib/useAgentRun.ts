"use client";

import { useCallback, useRef, useState } from "react";
import { signInForRun } from "./authBridge";
import { splitNdjson } from "./ndjson";
import { turnstileToken } from "./turnstile";
import type { AgentRequest, StyleResult, TraceEvent } from "./types";

/** Turn transport / agent failures into something a person can act on. Never surface raw status text. */
function friendly(status: number | null, raw: string | undefined, retryAfterS: number | null, reason?: string): string {
  if (reason === "upstream") return "Qloo is having a moment. Try a demo persona or come back in a minute.";
  if (reason === "deadline") return "That reading ran long and timed out. Try again; what it already fetched is saved, so the next go is quicker.";
  if (reason === "running") return "Your reading is still going on our side. Give it a minute and try again; it won't charge you twice.";
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
const POLL_MARK = "Still reading:";
const RECONNECT_MARK = "Reconnecting…";
/** Waits before each reconnect after the stream drops mid-run. */
const RECONNECT_MS = [1000, 3000, 6000];
/** 202 "running" polls (about 4s apart): enough to outlast one full run on the server. */
const MAX_POLLS = 40;

/** The server finished the run with an error event: retrying the stream won't help. */
class AgentError extends Error {
  constructor(
    message: string,
    readonly reason?: string,
  ) {
    super(message);
  }
}
/** The stream ended or broke before a result arrived: worth reconnecting. */
class StreamCut extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isThought = (e: TraceEvent, mark: string) => e.type === "thought" && e.text.startsWith(mark);

async function httpError(res: Response) {
  const j = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
  const ra = parseRetryAfter(res.headers.get("retry-after"));
  return Object.assign(new Error(j.error ?? `Request failed (${res.status})`), { status: res.status, retryAfter: ra, reason: j.reason });
}

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
      // Same body and run id on every retry, so the server replays, joins or charges once (its ledger is idempotent per run id).
      const post = (extra: Record<string, string> = {}) =>
        fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json", "x-run-id": runId, ...extra }, body: JSON.stringify(req), signal: ac.signal });
      /** POST; while the server says this exact reading is already running (202), wait and ask again. */
      const open = async (extra: Record<string, string> = {}) => {
        let res = await post(extra);
        for (let polls = 0; res.status === 202 && polls < MAX_POLLS && id === seq.current; polls++) {
          setEvents((prev) => [...prev.filter((e) => !isThought(e, POLL_MARK)), { type: "thought", text: `${POLL_MARK} your reading is still running on our side. Checking back in a few seconds.` }]);
          await sleep((parseRetryAfter(res.headers.get("retry-after")) ?? 4) * 1000);
          if (id !== seq.current) break;
          res = await post(extra);
        }
        setEvents((prev) => prev.filter((e) => !isThought(e, POLL_MARK)));
        return res;
      };
      let res = await open();
      if (id !== seq.current) return null;
      // Fresh readings need an account (when accounts are on): open sign-in, then retry once signed in.
      if (res.status === 401 && ((await res.clone().json().catch(() => ({}))) as { reason?: string }).reason === "signin") {
        setEvents((prev) => [...prev, { type: "thought", text: `${SIGNIN_MARK} Sign in and your reading starts right here.` }]);
        const ok = await signInForRun(req, ac.signal);
        if (id !== seq.current) return null;
        setEvents((prev) => prev.filter((e) => !isThought(e, SIGNIN_MARK)));
        if (ok) res = await open();
      }
      // Bot check requested (fresh runs only): get a Turnstile token once, then the server's cookie covers retries.
      if (res.status === 403 && ((await res.clone().json().catch(() => ({}))) as { reason?: string }).reason === "verify") {
        const token = await turnstileToken().catch(() => "");
        if (id !== seq.current) return null;
        res = await open({ "x-turnstile": token });
      }
      // Every reader busy: wait in line (honest countdown in the trace), retrying a few times before giving up.
      for (let tries = 0; res.status === 503 && tries < MAX_QUEUE_TRIES; tries++) {
        const j = (await res.clone().json().catch(() => ({}))) as { reason?: string };
        if (j.reason !== "slots") break;
        const ra = parseRetryAfter(res.headers.get("retry-after")) ?? 15;
        for (let left = ra; left > 0; left -= 5) {
          if (id !== seq.current) return null;
          setEvents((prev) => [...prev.filter((e) => !isThought(e, QUEUE_MARK)), { type: "thought", text: `${QUEUE_MARK} Every reader is busy. You're in line; next try in ${left}s.` }]);
          await sleep(Math.min(5, left) * 1000);
        }
        if (id !== seq.current) return null;
        res = await open();
      }
      if (res.ok) setEvents((prev) => prev.filter((e) => !isThought(e, QUEUE_MARK)));
      if (res.status === 202) throw Object.assign(new Error("still running"), { reason: "running" });
      if (!res.ok || !res.body) {
        const err = await httpError(res);
        if (err.retryAfter) cooldown.current = Date.now() + err.retryAfter * 1000;
        throw err;
      }

      /** Reads one NDJSON stream to its result. Bad lines are skipped; an error event ends the run for good. */
      const read = async (body: ReadableStream<Uint8Array>): Promise<StyleResult> => {
        const reader = body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let got: StyleResult | null = null;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const { items, rest } = splitNdjson<TraceEvent>(buf);
          buf = rest;
          for (const e of items) {
            if (id !== seq.current || !e || typeof e !== "object" || typeof e.type !== "string") continue;
            if (e.type === "result") got = e.result;
            else if (e.type === "error") throw new AgentError(e.message, e.reason);
            else setEvents((prev) => [...prev, e]);
          }
        }
        if (!got) throw new StreamCut("The agent stopped without an answer.");
        return got;
      };

      // The stream can drop mid-run (phone sleeps, network hop). The server keeps the run going, so reconnect with the
      // same body: it replays the cached result, rejoins the run, or says it's still running (202) and we poll.
      let stream: ReadableStream<Uint8Array> | null = res.body;
      let got: StyleResult | null = null;
      for (let attempt = 0; ; attempt++) {
        try {
          if (!stream) throw new StreamCut("network connection lost");
          got = await read(stream);
          break;
        } catch (err) {
          if (id !== seq.current) return null;
          const retryable = !(err instanceof AgentError) && !ac.signal.aborted;
          if (!retryable || attempt >= RECONNECT_MS.length) throw err;
          setEvents((prev) => [...prev.filter((e) => !isThought(e, RECONNECT_MARK)), { type: "thought", text: `${RECONNECT_MARK} the connection dropped. Picking your reading back up.` }]);
          await sleep(RECONNECT_MS[attempt]);
          if (id !== seq.current) return null;
          stream = null;
          let next: Response;
          try {
            next = await open();
          } catch {
            continue; // still offline: next attempt
          }
          if (id !== seq.current) return null;
          if (next.status === 202) throw Object.assign(new Error("still running"), { reason: "running" });
          if (!next.ok || !next.body) throw await httpError(next);
          // The new stream replays the whole trace (cached replay or shared-run catch-up), so start the trace over.
          setEvents([]);
          stream = next.body;
        }
      }
      if (id === seq.current) setResult(got);
      return got;
    } catch (err) {
      if (id === seq.current) {
        const e = err as Error & { status?: number; retryAfter?: number | null; reason?: string };
        // The last good result stays in state; only the error is recorded.
        setError(friendly(e.status ?? null, e.message, e.retryAfter ?? null, e.reason));
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
