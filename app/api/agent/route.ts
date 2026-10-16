import { runAgent } from "@/lib/agent";
import { kvCache } from "@/lib/cache";
import { buildCard } from "@/lib/card";
import { llmConfigured } from "@/lib/llm";
import { PERSONAS } from "@/lib/personas";
import { allow, bumpDaily, clientId } from "@/lib/ratelimit";
import { registerFighter, toSheet } from "@/lib/fighters";
import { registerTwin } from "@/lib/twins";
import type { AgentRequest, StyleResult, TraceEvent } from "@/lib/types";
import { BODY_MAX_BYTES, cacheKey, normalizeRequest } from "./key";

export const runtime = "nodejs";
export const maxDuration = 60;

type Recorded = { events: TraceEvent[]; result: StyleResult };

/** Replayable runs, keyed by everything that changes the output. Memory, plus Upstash when configured (TTL ≤ 6h). */
const results = kvCache<Recorded>("results", 300);
/** Last successful run for a request, whatever planner produced it. Only served when a fresh run fails. */
const lastGood = kvCache<Recorded>("lastgood", 300);

/** One shared run per key: identical concurrent requests subscribe to it instead of starting their own. */
interface Flight {
  events: TraceEvent[];
  listeners: Set<(e: TraceEvent) => void>;
  done: Promise<StyleResult>;
  ac: AbortController;
}
const g = globalThis as unknown as { __tmFlights?: Map<string, Flight> };
const flights = (g.__tmFlights ??= new Map<string, Flight>());

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const FRESH_LIMIT = 10;
const DAILY_RUNS_MAX = 400;
const MAX_FLIGHTS = 16;
const BUSY = { error: "busy", hint: "Try one of the demo personas" };
const RATE_MSG = `You've started a lot of readings in the last few minutes. Wait a bit, or try a demo persona like ${PERSONAS[1]?.name ?? "the ones on the home page"}; those load instantly.`;

function logRun(x: { runId: string | null; planner: string | null; qlooCalls: number | null; ms: number; cached: boolean; error: string | null }) {
  console.log(JSON.stringify({ evt: "agent_run", ...x }));
}

function startFlight(key: string, fallbackKey: string, req: AgentRequest): Flight {
  const t0 = Date.now();
  const ac = new AbortController();
  const f = { events: [], listeners: new Set(), ac } as unknown as Flight;
  const run = runAgent(
    req,
    (e) => {
      f.events.push(e);
      for (const l of f.listeners) l(e);
    },
    ac.signal,
  ).then(
    async (result) => {
      const rec = { events: f.events, result };
      // Register the card's twin server-side, before the result is returned or cached. (Stage C: also write the fighter sheet here.)
      if (result.mode !== "mock") {
        const code = await registerTwin(buildCard(result));
        await registerFighter(code, toSheet(result));
      }
      // Don't pin a fallback run: next time the LLM may be back (Qloo calls are cached either way).
      if (!llmConfigured() || result.planner === "llm") await results.set(key, rec);
      await lastGood.set(fallbackKey, rec);
      logRun({ runId: result.runId, planner: result.planner, qlooCalls: result.stats.qlooCalls, ms: Date.now() - t0, cached: false, error: null });
      return result;
    },
    (err: Error) => {
      logRun({ runId: null, planner: null, qlooCalls: null, ms: Date.now() - t0, cached: false, error: ac.signal.aborted ? "client aborted" : String(err?.message ?? err) });
      throw err;
    },
  );
  f.done = run.finally(() => {
    if (flights.get(key) === f) flights.delete(key);
  });
  f.done.catch(() => {});
  flights.set(key, f);
  return f;
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > BODY_MAX_BYTES) return Response.json({ error: "Request too large." }, { status: 413 });
    raw = JSON.parse(text);
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const body = normalizeRequest(raw);
  if (typeof body === "string") return Response.json({ error: body }, { status: 400 });

  const key = cacheKey(body);
  const fallbackKey = cacheKey(body, "*");
  const cached = await results.get(key);
  let flight = cached ? undefined : flights.get(key);
  if (flight?.ac.signal.aborted) flight = undefined; // its last listener left; start fresh
  if (!cached && !flight) {
    const who = clientId(request.headers);
    if (!(await allow(`agent:${who}`, RATE_LIMIT, RATE_WINDOW_MS))) return Response.json({ error: RATE_MSG }, { status: 429 });
    // Fresh runs only (not replays, not joins): they cost Qloo and LLM calls.
    if (flights.size >= MAX_FLIGHTS) return Response.json(BUSY, { status: 503, headers: { "retry-after": "30" } });
    if (!(await allow(`fresh:${who}`, FRESH_LIMIT, RATE_WINDOW_MS))) return Response.json({ error: RATE_MSG }, { status: 429 });
    if ((await bumpDaily("runs")) > DAILY_RUNS_MAX) return Response.json(BUSY, { status: 503, headers: { "retry-after": "600" } });
    flight = startFlight(key, fallbackKey, body);
  }

  const enc = new TextEncoder();
  let closed = false;
  let detach = () => {};
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: TraceEvent) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          closed = true;
          detach();
        }
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {}
      };
      request.signal?.addEventListener("abort", () => {
        closed = true;
        detach();
      });

      if (cached) {
        logRun({ runId: cached.result.runId, planner: cached.result.planner, qlooCalls: cached.result.stats.qlooCalls, ms: 0, cached: true, error: null });
        // Replay the recorded trace quickly so the run stays inspectable.
        for (const e of cached.events) {
          if (closed) return;
          send(e);
          await new Promise((r) => setTimeout(r, 70));
        }
        send({ type: "result", result: { ...cached.result, cached: true } });
        finish();
        return;
      }

      const f = flight!;
      for (const e of f.events) send(e); // joined a shared run: catch up on what it already emitted
      const listener = (e: TraceEvent) => send(e);
      f.listeners.add(listener);
      detach = () => {
        f.listeners.delete(listener);
        if (!f.listeners.size) f.ac.abort(); // nobody is listening any more: stop the work
      };
      try {
        const result = await f.done;
        send({ type: "result", result });
      } catch (err) {
        if (!closed) {
          const fallback = (await results.get(key)) ?? (await lastGood.get(fallbackKey));
          if (fallback) {
            send({ type: "thought", text: "This run failed, so here is the last good reading for exactly this request." });
            send({ type: "result", result: { ...fallback.result, cached: true } });
          } else send({ type: "error", message: (err as Error)?.message || "Agent failed" });
        }
      }
      f.listeners.delete(listener);
      finish();
    },
    cancel() {
      closed = true;
      detach();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
