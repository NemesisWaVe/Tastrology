import { cardCode, buildCard } from "./card";
import { ddbDelete, ddbGetStatus, ddbPutIfAbsent, ddbUpdate } from "./ddb";
import { s3Delete, s3Get, s3PutIfAbsent } from "./s3";
import { trimResult } from "./saved";
import type { QEntity, StyleResult } from "./types";

/**
 * A card's receipt, kept so an old card can still show its brands (docs/design/brand-return-data.md).
 *   CARD#<code>  RECEIPT    json, at        DynamoDB (read first)
 *   receipts/v1/<code>.json                 S3 copy
 * "full": the trimmed reading from the mint (our derived result, never raw Qloo responses), so the receipt stub and
 * the brand sheet render exactly as minted. "lite": a brand-only re-read for cards minted before receipts were kept.
 * Write-once per code: the same loves give the same card, so the first receipt is the true one.
 */
export interface SnapLove {
  id: string;
  name: string;
  kind: string;
  image?: string;
}
export interface SnapBrand {
  id: string;
  name: string;
  image?: string;
  category: string;
  /** 0-1 */
  affinity: number;
  /** love id -> share of the pull (0-1) */
  explain: Record<string, number>;
  /** love id -> affinity points lost without that love */
  ablation: Record<string, number>;
  because: string[];
  site?: string;
  instagram?: string;
  why?: string;
}
export interface Snap {
  at: number;
  lite?: boolean;
  loves: SnapLove[];
  brands: SnapBrand[];
  voids: { name: string; reason: string }[];
}
export interface StoredReceipt {
  v: 1;
  at: number;
  /** The trimmed reading (full receipts only). */
  result?: StyleResult;
  /** Brand-only re-read (old cards). */
  lite?: Snap;
}

const MAX_BYTES = 200_000;
const s3Key = (code: string) => `receipts/v1/${code}.json`;

const brandOf = (b: { entity: QEntity; affinity: number; category?: string; explain?: Record<string, number>; ablation?: Record<string, number>; because?: string[]; why?: string }): SnapBrand => ({
  id: b.entity.id,
  name: b.entity.name,
  image: b.entity.image,
  category: b.category ?? "brand",
  affinity: b.affinity,
  explain: b.explain ?? b.entity.explain ?? {},
  ablation: b.ablation ?? {},
  because: b.because ?? Object.entries(b.explain ?? b.entity.explain ?? {}).sort((x, y) => y[1] - x[1]).map(([k]) => k),
  site: b.entity.site,
  instagram: b.entity.instagram,
  why: b.why,
});

/** What the brand sheet needs, from either kind of receipt. */
export function snapOf(r: StoredReceipt): Snap | null {
  if (r.lite) return r.lite;
  const x = r.result;
  if (!x) return null;
  return {
    at: r.at,
    loves: x.seeds.map((s) => ({ id: s.id, name: s.name, kind: s.kind, image: s.image })),
    brands: x.brands.slice(0, 12).map(brandOf),
    voids: x.rejected.slice(0, 6).map((v) => ({ name: v.entity.name, reason: v.reason })),
  };
}

export function liteSnap(loves: SnapLove[], brands: QEntity[], at = Date.now()): Snap {
  return {
    at,
    lite: true,
    loves,
    brands: brands.slice(0, 8).map((e) => brandOf({ entity: e, affinity: e.affinity ?? 0, category: e.subtitle ?? "brand" })),
    voids: [],
  };
}

async function put(code: string, rec: StoredReceipt): Promise<"created" | "exists" | "error"> {
  const json = JSON.stringify(rec);
  if (json.length > MAX_BYTES) return "error";
  const [d, s] = await Promise.allSettled([ddbPutIfAbsent({ PK: `CARD#${code}`, SK: "RECEIPT", json, at: rec.at }), s3PutIfAbsent(s3Key(code), json)]);
  const out = [d, s].map((x) => (x.status === "fulfilled" ? x.value : "error"));
  return out.includes("created") ? "created" : out.includes("exists") ? "exists" : "error";
}

/** Keeps the reading behind a fresh mint. Fire-and-forget from the agent route. */
export async function putReceipt(code: string, result: StyleResult): Promise<void> {
  if (result.mode === "mock") return;
  await put(code, { v: 1, at: Date.now(), result: trimResult(result) });
}

/**
 * Backfill from the minting browser: accepted only when the result really produces this code (like twins), so a
 * stranger can't write someone else's receipt.
 */
export async function backfillReceipt(code: string, result: StyleResult): Promise<"created" | "exists" | "mismatch" | "error"> {
  try {
    if (cardCode(buildCard(result)) !== code) return "mismatch";
  } catch {
    return "mismatch";
  }
  // A lite re-read may already be there: a full receipt replaces it.
  const cur = await getReceipt(code);
  if (cur.status === "found" && cur.rec.result) return "exists";
  if (cur.status === "found") await dropReceipt(code);
  return put(code, { v: 1, at: Date.now(), result: trimResult(result) });
}

export async function putLite(code: string, snap: Snap): Promise<void> {
  await put(code, { v: 1, at: snap.at, lite: snap });
}

export type ReceiptLookup = { status: "found"; rec: StoredReceipt } | { status: "missing" | "error" };

export async function getReceipt(code: string): Promise<ReceiptLookup> {
  const d = await ddbGetStatus(`CARD#${code}`, "RECEIPT");
  const parse = (s: string): ReceiptLookup => {
    try {
      const rec = JSON.parse(s) as StoredReceipt;
      return rec && rec.v === 1 ? { status: "found", rec } : { status: "missing" };
    } catch {
      return { status: "missing" };
    }
  };
  if (d.status === "found") return parse(String(d.value.json));
  const s = await s3Get(s3Key(code)).catch(() => null);
  if (s) return parse(s);
  return d.status === "error" ? { status: "error" } : { status: "missing" };
}

export async function dropReceipt(code: string): Promise<void> {
  await Promise.allSettled([ddbDelete(`CARD#${code}`, "RECEIPT"), s3Delete(s3Key(code))]);
}

/** Marks when drift was last checked, so the weekly refresh is cheap to gate. */
export async function touchReceipt(code: string, at: number): Promise<void> {
  await ddbUpdate(`CARD#${code}`, "RECEIPT", "SET driftAt = :at", { values: { ":at": at } }).catch(() => {});
}
