import { upstash } from "@/lib/cache";
import { clientId } from "@/lib/ratelimit";
import { TWIN_CODE } from "@/lib/twins";

export const runtime = "nodejs";

const BRAND_ID = /^[A-Za-z0-9_-]{4,64}$/;
const SRC = new Set(["deck", "share", "receipt", "results", "drift", "recast"]);

/**
 * Counts a brand click-out (docs/design/brand-return-data.md §4): totals by day, brand, card and source. No user ids,
 * no IPs stored; one count per browser per brand per hour.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code).toUpperCase();
  const j = (await request.json().catch(() => null)) as { brand?: unknown; src?: unknown } | null;
  const brand = String(j?.brand ?? "");
  const src = SRC.has(String(j?.src)) ? String(j?.src) : "deck";
  if (!TWIN_CODE.test(code) || !BRAND_ID.test(brand)) return new Response(null, { status: 204 });
  const first = await upstash([["SET", `tm:ckd:${clientId(request.headers)}:${brand}`, "1", "EX", 3600, "NX"]]);
  if (!first || first[0] !== "OK") return new Response(null, { status: 204 });
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  await upstash([
    ["INCR", "tm:ck:total"],
    ["INCR", `tm:ck:d:${d}`],
    ["ZINCRBY", "tm:ck:brands", 1, brand],
    ["INCR", `tm:ck:card:${code}`],
    ["INCR", `tm:ck:src:${src}`],
  ]);
  return new Response(null, { status: 204 });
}
