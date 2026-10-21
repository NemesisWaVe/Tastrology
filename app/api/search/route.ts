import { blocked, care, clean, nearest } from "@/lib/guard";
import { withQlooSignal } from "@/lib/qloo";
import { allow, clientId } from "@/lib/ratelimit";
import { normQ } from "@/lib/searchKey";
import { searchTaste } from "@/lib/tasteSearch";
import { SEED_KINDS, type EntityKind, type QlooCallLog } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Answers depend on the words alone (never on who asks), so the CDN keeps them: the popular head of what people type
 * is served from the edge without touching this function or Qloo. The client sends the words already normalized, so
 * "Frank Ocean" and "frank  ocean " share one cached answer.
 */
const CACHED = { "cache-control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = normQ(url.searchParams.get("q") ?? "");
  const kinds = (url.searchParams.get("types") ?? "").split(",").filter((k): k is EntityKind => SEED_KINDS.includes(k as EntityKind));
  if (q.length < 2) return Response.json({ results: [], hits: [] });
  // The content guard (lib/guard.ts): explicit searches get nothing back, and explicit results are dropped.
  // A blocked search still leads somewhere: the nearest clean neighbours, or a help line when someone may be struggling.
  if (blocked(q)) return Response.json({ results: [], vibes: [], hits: [], blocked: true, care: care(q), suggest: care(q) ? [] : nearest(q) }, { headers: CACHED });
  // Own bucket: typing in autocomplete must not eat into the agent-run allowance.
  if (!(await allow(`search:${clientId(request.headers)}`, 120, 10 * 60 * 1000)))
    return Response.json({ results: [], hits: [], error: "Too many searches. Give it a minute." }, { status: 429 });
  // vibes=only: the Vibes tab, tags alone. types=: one kind of named thing. Otherwise everything, vibes mixed in.
  const mode = url.searchParams.get("vibes") === "only" ? "vibes" : kinds.length ? "named" : "mix";
  try {
    // A keystroke that's been typed past cancels its request, and with it any Qloo call still waiting for a slot.
    const log: QlooCallLog[] = [];
    const t0 = Date.now();
    const r = await withQlooSignal(request.signal, () => searchTaste(q, kinds.length ? kinds : SEED_KINDS, mode, log));
    // Where the time went, per Qloo call (visible in the browser's network panel): live calls vs cache hits.
    const timing = [`total;dur=${Date.now() - t0}`, ...log.map((c, i) => `q${i};dur=${c.ms};desc="${c.endpoint}${c.cached ? " cached" : ""}"`)].join(", ");
    return Response.json(
      {
        hits: clean(r.hits),
        results: clean(r.results).map((e) => ({ id: e.id, name: e.name, kind: e.kind, subtitle: e.subtitle, image: e.image })),
        vibes: clean(r.vibes),
      },
      { headers: { ...CACHED, "server-timing": timing } },
    );
  } catch (err) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    const busy = (err as Error)?.name === "TimeoutError";
    console.error(JSON.stringify({ evt: "search_error", busy, error: String((err as Error)?.message ?? err) }));
    return Response.json({ results: [], hits: [], error: busy ? "Search is busy. Keep typing." : "Search is unavailable right now." }, { status: busy ? 503 : 502 });
  }
}
