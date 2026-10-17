import { createHash, randomUUID } from "node:crypto";
import { after } from "next/server";
import { runAgent } from "@/lib/agent";
import { clerkOn, currentUserId, isAdmin } from "@/lib/auth";
import { ddbPutIfAbsent, ddbUpdate } from "@/lib/ddb";
import { creditsOn, heldRegret, nextRefillAt, refundCredit, refundRegret, RUN_ID_RE, spendCredit, spendRegret } from "@/lib/ledger";
import { deckFull, DECK_FULL_MSG } from "@/lib/deckCap";
import { deviceId } from "@/lib/device";
import { dustOn, refundDust, spendDust } from "@/lib/stardust";
import { kvCache } from "@/lib/cache";
import { buildCard, SEASON } from "@/lib/card";
import { llmConfigured } from "@/lib/llm";
import { isPersonaRequest, PERSONAS } from "@/lib/personas";
import { hasHumanCookie, humanCookie, turnstileOn, verifyTurnstile } from "@/lib/human";
import { acquireSlot, allow, bumpDaily, clientId, clientIp } from "@/lib/ratelimit";
import { registerFighter, toSheet } from "@/lib/fighters";
import { dropLease, leaseHeld, takeLease } from "@/lib/runLease";
import { recordMint } from "@/lib/stats";
import { registerTwin } from "@/lib/twins";
import type { AgentRequest, StyleResult, TraceEvent } from "@/lib/types";
import { BODY_MAX_BYTES, cacheKey, normalizeRequest } from "./key";

export const runtime = "nodejs";
// Hobby allows 300s; readings take 20–60s, and Qloo backoff can stretch one.
export const maxDuration = 150;

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
  /** Settles once the run and its bookkeeping (slot release, mint stats, refund, lease) have all finished. */
  drained: Promise<unknown>;
  ac: AbortController;
}
const g = globalThis as unknown as { __tmFlights?: Map<string, Flight> };
const flights = (g.__tmFlights ??= new Map<string, Flight>());

/** Hard ceiling for one run. Past it the run is aborted (Qloo queue included) and the last good reading, if any, is served. */
const RUN_DEADLINE_MS = 120_000;
/** Autopilot results (LLM configured but skipped or down) are cached briefly: repeat clicks replay, and the LLM gets another go soon. */
const AUTOPILOT_TTL_MS = 10 * 60 * 1000;

/** The run hit RUN_DEADLINE_MS. */
class DeadlineError extends Error {
  readonly reason = "deadline";
  constructor() {
    super("The reading ran out of time.");
  }
}

/** Keeps post-response work alive on serverless (next/server after()). Outside a request scope (tests) it just runs. */
function later(task: Promise<unknown>) {
  const p = task.catch(() => {});
  try {
    after(p);
  } catch {}
}

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const FRESH_LIMIT = 10;
/** Fresh readings per UTC day across every instance. Size it from the monthly budget (Qloo, Bedrock, Vercel GB-hours) ÷ 30. */
const DAILY_RUNS_MAX = Number(process.env.DAILY_RUNS_MAX) || 400;
/** Fresh readings running at once across every instance (Upstash leases), so a spike queues instead of tripping Qloo. */
const RUN_SLOTS = Number(process.env.RUN_SLOTS) || 12;
const SLOT_TTL_MS = 150_000;
/** Per-instance ceiling, in case Upstash is down and slots fall back to local counts. */
const MAX_FLIGHTS = 16;
const BUSY = { error: "busy", hint: "Try one of the demo personas" };
const RATE_MSG = `You've started a lot of readings in the last few minutes. Wait a bit, or try a demo persona like ${PERSONAS[1]?.name ?? "the ones on the home page"}; those load instantly.`;

function logRun(x: { runId: string | null; planner: string | null; qlooCalls: number | null; ms: number; cached: boolean; error: string | null }) {
  console.log(JSON.stringify({ evt: "agent_run", ...x }));
}

/** Who started a fresh run: their own mint is filed in their deck, and a charged credit is refunded if the run fails. */
interface Minter {
  userId: string;
  /** Set when a credit (or dust) was taken for this run (CREDITS_ON=1). */
  runId?: string;
  /** What paid for it: a credit, a regret credit, or READING_DUST Stardust (only with DUST_BUYS_READING=1). */
  paidWith?: "credit" | "dust" | "regret";
  /** Hash of the picks, so a regret credit can't buy back the same card (docs/design/regret-burn.md). */
  pick?: string;
}

/** Files the account's own fresh mint in its deck as minted:1 (upgrading a card it had only claimed or collected). */
async function fileOwnMint(minter: Minter, code: string, card: ReturnType<typeof buildCard>) {
  const PK = `OWNER#${minter.userId}`;
  const SK = `CARD#${code}`;
  // runId + funding let a burn check the ledger (docs/design/burn.md). Every credit is free during the beta; once the shop
  // sells credits, spendCredit must report which kind it took and "paid" goes here (paid mints burn at a flat rate).
  const funding = minter.paidWith === "dust" ? "dust" : minter.paidWith === "regret" ? "regret" : "free";
  const paid: Record<string, string> = { ...(minter.runId ? { runId: minter.runId, funding } : {}), ...(minter.pick ? { pick: minter.pick } : {}) };
  const out = await ddbPutIfAbsent({ PK, SK, code, card: JSON.stringify(card), rarityScore: card.rarityScore, addedAt: Date.now(), minted: 1, source: "mint", ...paid });
  if (out === "exists") {
    const set = minter.runId ? ", runId = :run, funding = :fund" : "";
    const values: Record<string, string | number> = { ":one": 1, ":src": "mint", ...(minter.runId ? { ":run": paid.runId, ":fund": paid.funding } : {}) };
    await ddbUpdate(PK, SK, `SET minted = :one, #s = :src${set}`, { names: { "#s": "source" }, values });
  }
}

function startFlight(key: string, fallbackKey: string, req: AgentRequest, release: () => Promise<void>, minter?: Minter): Flight {
  const t0 = Date.now();
  const ac = new AbortController();
  const deadline = setTimeout(() => ac.abort(new DeadlineError()), RUN_DEADLINE_MS);
  const f = { events: [], listeners: new Set(), ac } as unknown as Flight;
  /** Bookkeeping that must finish even after every client has gone. */
  const tail: Promise<unknown>[] = [];
  const bg = (p: Promise<unknown>) => void tail.push(p.catch(() => {}));
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
        const card = buildCard(result);
        const code = await registerTwin(card);
        await registerFighter(code, toSheet(result));
        if (minter) await fileOwnMint(minter, code, card).catch(() => {});
        bg(recordMint(code, SEASON, card.rarityScore));
      }
      // An LLM run is pinned for the full TTL. A fallback (autopilot) run only briefly: repeat clicks replay it instead of
      // burning a slot, and in 10 minutes the LLM may be back (Qloo calls stay cached either way).
      if (!llmConfigured() || result.planner === "llm") await results.set(key, rec);
      else await results.set(key, rec, AUTOPILOT_TTL_MS);
      await lastGood.set(fallbackKey, rec);
      logRun({ runId: result.runId, planner: result.planner, qlooCalls: result.stats.qlooCalls, ms: Date.now() - t0, cached: false, error: null });
      return result;
    },
    (err: Error) => {
      const why = ac.signal.reason instanceof DeadlineError ? "deadline" : ac.signal.aborted ? "aborted" : String(err?.message ?? err);
      logRun({ runId: null, planner: null, qlooCalls: null, ms: Date.now() - t0, cached: false, error: why });
      throw err;
    },
  );
  const charged = minter?.runId ? { userId: minter.userId, runId: minter.runId, paidWith: minter.paidWith } : null;
  const settled = charged
    ? run.catch((err) => {
        // The run didn't produce a card: give the credit (or dust) back (write-once per run id).
        bg(charged.paidWith === "dust" ? refundDust(charged.userId, charged.runId) : charged.paidWith === "regret" ? refundRegret(charged.userId, charged.runId) : refundCredit(charged.userId, charged.runId));
        throw err;
      })
    : run;
  f.done = settled.finally(() => {
    clearTimeout(deadline);
    if (flights.get(key) === f) flights.delete(key);
    bg(release());
    bg(dropLease(key));
  });
  f.done.catch(() => {});
  f.drained = f.done.then(
    () => Promise.allSettled(tail),
    () => Promise.allSettled(tail),
  );
  flights.set(key, f);
  return f;
}

export async function POST(request: Request) {
  let raw: unknown;
  // Refuse an oversized body before reading it (the byte check below still covers chunked bodies with no length).
  if (Number(request.headers.get("content-length") ?? 0) > BODY_MAX_BYTES) return Response.json({ error: "Request too large." }, { status: 413 });
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
  if (flight?.ac.signal.aborted) flight = undefined; // hit its deadline; start fresh
  /** Set when this request just passed the bot check; rides on whatever response goes back. */
  let setCookie: string | undefined;
  const reply = (body: unknown, init: ResponseInit) => {
    const r = Response.json(body, init);
    if (setCookie) r.headers.append("set-cookie", setCookie);
    return r;
  };
  const running = () => reply({ reason: "running", hint: "Already reading this one. Poll again." }, { status: 202, headers: { "retry-after": "4", "cache-control": "no-store" } });
  // Already running elsewhere (another instance, or our own stream dropped and the client came back): don't start a
  // second run or charge again; the client polls and gets the cached replay once it lands.
  if (!cached && !flight && (await leaseHeld(key))) return running();
  if (!cached && !flight) {
    // Mint gate: demo personas stay anonymous; any other fresh reading needs an account when Clerk is on.
    const persona = isPersonaRequest(body);
    const userId = clerkOn() ? await currentUserId() : null;
    if (clerkOn() && !userId && !persona) return Response.json({ error: "Sign in to mint a fresh card.", reason: "signin" }, { status: 401 });
    const who = userId ? `u:${userId}` : clientId(request.headers);
    // Admins skip the per-person limits, the daily cap and credits. They still queue for a run slot like everyone else.
    const admin = await isAdmin(userId);
    // Bot check before anything that costs quota (anonymous only: Clerk's sign-up already ran one). The token is spent here, so queue retries ride on the cookie.
    if (!userId && !persona && turnstileOn() && !hasHumanCookie(request.headers)) {
      const token = request.headers.get("x-turnstile") ?? "";
      if (!(await verifyTurnstile(token, clientIp(request.headers)))) {
        later(bumpDaily("denied_bot"));
        return Response.json({ error: "Quick check first.", reason: "verify" }, { status: 403 });
      }
      setCookie = humanCookie();
    }
    if (!admin && !(await allow(`agent:${who}`, RATE_LIMIT, RATE_WINDOW_MS))) return reply({ error: RATE_MSG }, { status: 429 });
    // Fresh runs only (not replays, not joins): they cost Qloo and LLM calls.
    const release = flights.size >= MAX_FLIGHTS ? null : await acquireSlot("agent", RUN_SLOTS, SLOT_TTL_MS);
    if (!release) {
      later(bumpDaily("denied_busy"));
      return reply({ ...BUSY, reason: "slots" }, { status: 503, headers: { "retry-after": String(12 + Math.floor(Math.random() * 10)) } });
    }
    // Counted only once a slot is granted, so waiting in line doesn't use up the allowance.
    if (!admin && !(await allow(`fresh:${who}`, FRESH_LIMIT, RATE_WINDOW_MS))) {
      await release();
      return reply({ error: RATE_MSG }, { status: 429 });
    }
    if ((await bumpDaily("runs")) > DAILY_RUNS_MAX && !admin) {
      await release();
      later(bumpDaily("denied_daily"));
      return reply({ ...BUSY, reason: "daily" }, { status: 503, headers: { "retry-after": "600" } });
    }
    // One run per request across instances. Lost the race: someone else just started it.
    if (!(await takeLease(key))) {
      await release();
      return running();
    }
    // Credits last, after every free gate, so being turned away never costs one. Idempotent per run id (the client reuses it across retries).
    let minter: Minter | undefined = userId && !persona ? { userId, pick: createHash("sha256").update(key).digest("base64url").slice(0, 22) } : undefined;
    if (minter && !admin && (await deckFull(minter.userId))) {
      await release();
      await dropLease(key);
      return reply({ error: DECK_FULL_MSG, reason: "deckfull" }, { status: 409 });
    }
    if (minter && creditsOn() && !admin) {
      const hdr = request.headers.get("x-run-id") ?? "";
      const runId = RUN_ID_RE.test(hdr) ? hdr : randomUUID();
      // A held regret credit pays first, but never for the picks of the card it came from.
      const regret = await heldRegret(minter.userId).catch(() => null);
      if (regret?.pick && regret.pick === minter.pick) {
        await release();
        await dropLease(key);
        return reply({ error: "Change at least one pick. The same loves give the same card you just let go.", reason: "samepicks" }, { status: 409 });
      }
      let paidWith: Minter["paidWith"] = regret ? "regret" : "credit";
      let spent = regret ? await spendRegret(minter.userId, runId) : await spendCredit(minter.userId, runId, deviceId(request.headers));
      if (regret && spent === "empty") {
        paidWith = "credit";
        spent = await spendCredit(minter.userId, runId, deviceId(request.headers));
      }
      // Out of credits: Stardust buys a reading only if DUST_BUYS_READING=1. Off by default: burning never frees a card (identity-limits.md).
      if (spent === "empty" && dustOn() && process.env.DUST_BUYS_READING === "1") {
        const d = await spendDust(minter.userId, runId);
        if (d === "spent" || d === "dup" || d === "used") {
          spent = d;
          paidWith = "dust";
        }
      }
      if (spent !== "spent" && spent !== "dup") {
        await release();
        await dropLease(key);
        if (spent === "empty") {
          const at = await nextRefillAt(minter.userId).catch(() => null);
          const days = at ? Math.max(1, Math.ceil((at - Date.now()) / 86_400_000)) : null;
          const when = days ? `Your next card comes at the new moon, in ${days} day${days === 1 ? "" : "s"}.` : "Your next card comes at the new moon.";
          return reply({ error: `${when} Fight someone while you wait.`, reason: "credits", refillAt: at }, { status: 402 });
        }
        if (spent === "used") return reply({ error: "That reading already ran. Start a new one.", reason: "runid" }, { status: 409 });
        return reply({ ...BUSY, reason: "ledger" }, { status: 503, headers: { "retry-after": "20" } });
      }
      minter = { ...minter, runId, paidWith };
    }
    flight = startFlight(key, fallbackKey, body, release, minter);
    // The run outlives this response if the client drops: it finishes, caches its result and releases its slot.
    later(flight.drained);
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
      // A client that leaves only unsubscribes: the run keeps going (under after()) and caches its result, so a
      // reconnect replays it instead of paying for it twice. RUN_DEADLINE_MS bounds it.
      detach = () => {
        f.listeners.delete(listener);
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
          } else {
            const reason = (err as { reason?: unknown })?.reason;
            send({
              type: "error",
              message: (err as Error)?.message || "Agent failed",
              ...(reason === "upstream" || reason === "deadline" ? { reason } : {}),
            });
          }
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
  const headers = new Headers({ "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" });
  if (setCookie) headers.append("set-cookie", setCookie);
  return new Response(stream, { headers });
}
