import { driftFor, rereadBrands } from "@/lib/drift";
import { allow, clientId } from "@/lib/ratelimit";
import { backfillReceipt, getReceipt, putLite, snapOf } from "@/lib/receipt";
import { isSavedResult } from "@/lib/saved";
import { upstash } from "@/lib/cache";
import { burnedAt, getTwin, TWIN_CODE } from "@/lib/twins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
const DAY = 86_400_000;
const codeOf = async (params: Promise<{ code: string }>) => decodeURIComponent((await params).code).toUpperCase();

/**
 * A card's brands and receipt (docs/design/brand-return-data.md). Public like the card.
 *   ?drift=1   also this week's brand drift (one cached Qloo call per card per week)
 *   ?reread=1  for a card with no saved receipt: re-read its brands once (bounded daily)
 *   ?full=1    include the trimmed reading, for the receipt stub
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = await codeOf(params);
  if (!TWIN_CODE.test(code)) return Response.json({ error: "bad code" }, { status: 400 });
  const q = new URL(request.url).searchParams;
  const who = clientId(request.headers);
  if (!(await allow(`receipt:${who}`, 120, 10 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429 });
  if (await burnedAt(code)) return Response.json({ status: "burned" }, { status: 410, headers: { "cache-control": "public, max-age=60" } });

  const found = await getReceipt(code);
  if (found.status === "error") return Response.json({ status: "error" }, { status: 503, headers: { ...NO_STORE, "retry-after": "5" } });
  if (found.status === "missing") {
    if (q.get("reread") !== "1") return Response.json({ status: "faded" }, { headers: NO_STORE });
    if (!(await allow(`reread:${who}`, 6, 60 * 60 * 1000))) return Response.json({ status: "faded", error: "Try again in a bit." }, { status: 429, headers: NO_STORE });
    const card = await getTwin(code);
    const snap = card ? await rereadBrands(card).catch(() => null) : null;
    if (!snap) return Response.json({ status: "faded", error: "Couldn't re-read it just now." }, { headers: NO_STORE });
    await putLite(code, snap);
    return Response.json({ status: "lite", snap }, { headers: NO_STORE });
  }

  if (found.status !== "found") return Response.json({ status: "faded" }, { headers: NO_STORE });
  const rec = found.rec;
  const snap = snapOf(rec);
  if (!snap) return Response.json({ status: "faded" }, { headers: NO_STORE });
  // Opens of cards older than a day are the return rate (counted, no ids).
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  void upstash([["INCR", `tm:rv:${d}`], ...(Date.now() - snap.at > DAY ? [["INCR", "tm:rv:ret"]] : [])]).catch(() => {});
  const drift = q.get("drift") === "1" && Date.now() - snap.at > DAY ? await driftFor(code, snap).catch(() => null) : null;
  return Response.json(
    { status: snap.lite ? "lite" : "fresh", snap, drift, ...(q.get("full") === "1" && rec.result ? { result: rec.result } : {}) },
    { headers: { "cache-control": "private, max-age=60" } },
  );
}

/** Backfill from the browser that minted the card: the reading must produce this exact code. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = await codeOf(params);
  if (!TWIN_CODE.test(code)) return Response.json({ error: "bad code" }, { status: 400 });
  if (!(await allow(`receiptpost:${clientId(request.headers)}`, 30, 60 * 60 * 1000))) return Response.json({ error: "slow down" }, { status: 429 });
  const text = await request.text().catch(() => "");
  if (text.length > 400_000) return Response.json({ error: "too large" }, { status: 413 });
  let result: unknown;
  try {
    result = (JSON.parse(text) as { result?: unknown }).result;
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  if (!isSavedResult(result)) return Response.json({ error: "bad result" }, { status: 400 });
  const out = await backfillReceipt(code, result);
  if (out === "mismatch") return Response.json({ error: "not this card" }, { status: 409 });
  return Response.json({ ok: out !== "error", status: out }, { status: out === "error" ? 503 : 200, headers: NO_STORE });
}
