import { searchEntities } from "@/lib/qloo";
import { searchVibes } from "@/lib/vibes";
import { blocked, care, clean, nearest } from "@/lib/guard";
import { allow, clientId } from "@/lib/ratelimit";
import { SEED_KINDS, type EntityKind } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const kinds = (url.searchParams.get("types") ?? "").split(",").filter((k): k is EntityKind => SEED_KINDS.includes(k as EntityKind));
  if (q.length < 2) return Response.json({ results: [] });
  // The content guard (lib/guard.ts): explicit searches get nothing back, and explicit results are dropped.
  // A blocked search still leads somewhere: the nearest clean neighbours, or a help line when someone may be struggling.
  if (blocked(q))
    return Response.json({ results: [], vibes: [], blocked: true, care: care(q), suggest: care(q) ? [] : nearest(q) }, { headers: { "cache-control": "public, max-age=300" } });
  // Own bucket: typing in autocomplete must not eat into the agent-run allowance.
  if (!(await allow(`search:${clientId(request.headers)}`, 120, 10 * 60 * 1000)))
    return Response.json({ results: [], error: "Too many searches. Give it a minute." }, { status: 429 });
  try {
    // vibes=only: the Vibes tab, tags alone (no entity search, one Qloo call). vibes=1: a few mixed into "everything".
    if (url.searchParams.get("vibes") === "only")
      return Response.json({ results: [], vibes: clean(await searchVibes(q, 8).catch(() => [])).slice(0, 6) }, { headers: { "cache-control": "public, max-age=300" } });
    const wantVibes = url.searchParams.get("vibes") === "1" && !kinds.length && q.length >= 3;
    const [results, vibes] = await Promise.all([searchEntities(q, kinds.length ? kinds : SEED_KINDS, 10), wantVibes ? searchVibes(q).catch(() => []) : []]);
    return Response.json(
      { results: clean(results).map((r) => ({ id: r.id, name: r.name, kind: r.kind, subtitle: r.subtitle, image: r.image })), vibes: clean(vibes) },
      { headers: { "cache-control": "public, max-age=300" } },
    );
  } catch (err) {
    console.error(JSON.stringify({ evt: "search_error", error: String((err as Error)?.message ?? err) }));
    return Response.json({ results: [], error: "Search is unavailable right now." }, { status: 502 });
  }
}
