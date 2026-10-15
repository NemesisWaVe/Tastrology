import { runAgent } from "@/lib/agent";
import { sharedCache } from "@/lib/cache";
import { allow } from "@/lib/ratelimit";
import type { AgentRequest, StyleResult, TraceEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const results = sharedCache<{ events: TraceEvent[]; result: StyleResult }>("results", 300);

function keyOf(req: AgentRequest) {
  return JSON.stringify({
    s: req.seeds.map((s) => s.id || `${s.kind}:${s.name.toLowerCase()}`).sort(),
    b: req.budget ?? 0,
    g: (req.goal ?? "").trim().toLowerCase(),
    l: [...(req.feedback?.liked ?? [])].sort(),
    d: [...(req.feedback?.disliked ?? [])].sort(),
  });
}

export async function POST(request: Request) {
  let body: AgentRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  if (!Array.isArray(body.seeds) || body.seeds.length < 2 || body.seeds.length > 8)
    return Response.json({ error: "Add between 2 and 8 seeds." }, { status: 400 });
  body.seeds = body.seeds.map((s) => ({ id: String(s.id ?? ""), name: String(s.name).slice(0, 120), kind: s.kind }));

  const key = keyOf(body);
  const cached = results.get(key);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!cached && !allow(ip)) return Response.json({ error: "Easy there: too many runs. Try a demo persona or wait a few minutes." }, { status: 429 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: TraceEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      if (cached) {
        // Replay the recorded trace quickly so the run stays inspectable.
        for (const e of cached.events) {
          send(e);
          await new Promise((r) => setTimeout(r, 70));
        }
        send({ type: "result", result: { ...cached.result, cached: true } });
        controller.close();
        return;
      }
      const events: TraceEvent[] = [];
      try {
        const result = await runAgent(body, (e) => {
          events.push(e);
          send(e);
        });
        results.set(key, { events, result });
        send({ type: "result", result });
      } catch (err) {
        send({ type: "error", message: (err as Error).message || "Agent failed" });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
