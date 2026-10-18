import { searchEntities } from "@/lib/qloo";
import { searchVibes } from "@/lib/vibes";
import { allow, clientId } from "@/lib/ratelimit";
import { SEED_KINDS, type EntityKind } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const kinds = (url.searchParams.get("types") ?? "").split(",").filter((k): k is EntityKind => SEED_KINDS.includes(k as EntityKind));
  if (q.length < 2) return Response.json({ results: [] });
  // Own bucket: typing in autocomplete must not eat into the agent-run allowance.
  if (!(await allow(`search:${clientId(request.headers)}`, 120, 10 * 60 * 1000)))
    return Response.json({ results: [], error: "Too many searches. Give it a minute." }, { status: 429 });
  try {
    // vibes=only: the Vibes tab, tags alone (no entity search, one Qloo call). vibes=1: a few mixed into "everything".
    if (url.searchParams.get("vibes") === "only")
      return Response.json({ results: [], vibes: await searchVibes(q, 6).catch(() => []) }, { headers: { "cache-control": "public, max-age=300" } });
    const wantVibes = url.searchParams.get("vibes") === "1" && !kinds.length && q.length >= 3;
    const [results, vibes] = await Promise.all([searchEntities(q, kinds.length ? kinds : SEED_KINDS, 10), wantVibes ? searchVibes(q).catch(() => []) : []]);
    return Response.json(
      { results: results.map((r) => ({ id: r.id, name: r.name, kind: r.kind, subtitle: r.subtitle, image: r.image })), vibes },
      { headers: { "cache-control": "public, max-age=300" } },
    );
  } catch (err) {
    console.error(JSON.stringify({ evt: "search_error", error: String((err as Error)?.message ?? err) }));
    return Response.json({ results: [], error: "Search is unavailable right now." }, { status: 502 });
  }
}
