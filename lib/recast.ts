import { ddbGetStatus, ddbQuery, ddbTransact } from "./ddb";
import { insights } from "./qloo";
import { bumpDaily } from "./ratelimit";
import { getReceipt, liteSnap, snapOf, type Snap } from "./receipt";
import { dustOn } from "./stardust";

/**
 * Recast: point a card's loves at a new territory and see which brands there it pulls in. The card stays the card
 * (same loves, code and rarity); only the brand reading is new. Bought with earned Stardust, one Qloo call each.
 *   CARD#<code>  RECAST#<lens>   json (Snap), at, season, by     one per lens, recastable after a week
 *   CARD#<code>  STYLE          living = 1                        Living sigils, bought once
 *   USER#<id>    LEDGER#recast#<code>#<lens>#<at> / LEDGER#living#<code>
 */
export const RECAST_DUST = 40;
export const LIVING_DUST = 100;
const RECAST_DAILY_MAX = Number(process.env.RECAST_DAILY_MAX) || 150;
const WEEK = 7 * 86_400_000;

export const recastOn = () => dustOn() && process.env.RECAST !== "0";

export const LENSES = [
  { id: "fashion", label: "Fashion", tag: "urn:tag:genre:brand:fashion" },
  { id: "beauty", label: "Health & Beauty", tag: "urn:tag:genre:brand:health_and_beauty" },
  { id: "food", label: "Food & Drink", tag: "urn:tag:genre:brand:food_and_beverage" },
  { id: "travel", label: "Travel", tag: "urn:tag:genre:brand:travel" },
] as const;
export type LensId = (typeof LENSES)[number]["id"];
export const lensOf = (id: string) => LENSES.find((l) => l.id === id);

/** The month's featured lens. Recasts into it that month carry a season mark you can't get later. */
export function seasonOf(now = Date.now()): { lens: LensId; month: string } {
  const d = new Date(now);
  return { lens: LENSES[(d.getUTCFullYear() * 12 + d.getUTCMonth()) % LENSES.length].id, month: d.toISOString().slice(0, 7) };
}

export interface RecastRow {
  lens: LensId;
  at: number;
  season?: string;
  snap: Snap;
}

export async function recastsOf(code: string): Promise<RecastRow[]> {
  const page = await ddbQuery(`CARD#${code}`, "RECAST#", 10).catch(() => null);
  const out: RecastRow[] = [];
  for (const it of page?.items ?? []) {
    try {
      out.push({ lens: String(it.SK).slice(7) as LensId, at: Number(it.at) || 0, season: it.season ? String(it.season) : undefined, snap: JSON.parse(String(it.json)) as Snap });
    } catch {}
  }
  return out.sort((a, b) => b.at - a.at);
}

type Fail = "not-owner" | "bad-lens" | "too-soon" | "no-receipt" | "busy" | "poor" | "empty" | "error";
const CCF = "ConditionalCheckFailed";

async function ownMint(userId: string, code: string): Promise<"ok" | "not-owner" | "error"> {
  const own = await ddbGetStatus(`OWNER#${userId}`, `CARD#${code}`);
  if (own.status === "error" || own.status === "off") return "error";
  return own.status === "found" && Number(own.value.minted) === 1 ? "ok" : "not-owner";
}

export async function recastCard(userId: string, code: string, lensId: string, now = Date.now()): Promise<{ status: "recast"; row: RecastRow } | { status: Fail }> {
  const lens = lensOf(lensId);
  if (!lens) return { status: "bad-lens" };
  const own = await ownMint(userId, code);
  if (own !== "ok") return { status: own };
  const prev = await ddbGetStatus(`CARD#${code}`, `RECAST#${lens.id}`);
  if (prev.status === "error") return { status: "error" };
  if (prev.status === "found" && now - (Number(prev.value.at) || 0) < WEEK) return { status: "too-soon" };
  const rec = await getReceipt(code);
  const snap = rec.status === "found" ? snapOf(rec.rec) : null;
  const loves = snap?.loves.filter((l) => l.id) ?? [];
  if (!loves.length) return { status: "no-receipt" };
  // Look before charging: a failed or empty call costs nothing.
  const w = await ddbGetStatus(`USER#${userId}`, "WALLET");
  if (w.status !== "found" || (Number(w.value.dust) || 0) < RECAST_DUST) return { status: "poor" };
  if ((await bumpDaily("recast")) > RECAST_DAILY_MAX) return { status: "busy" };
  const brands = await insights({ type: "brand", entityIds: loves.map((l) => l.id), filterTags: [lens.tag], take: 8, explain: true }).catch(() => null);
  if (!brands) return { status: "error" };
  if (!brands.length) return { status: "empty" };
  const s = seasonOf(now);
  const row: RecastRow = { lens: lens.id, at: now, ...(s.lens === lens.id ? { season: s.month } : {}), snap: liteSnap(loves, brands, now) };
  const U = `USER#${userId}`;
  const r = await ddbTransact([
    { update: { PK: U, SK: "WALLET" }, set: "SET dust = dust - :cost, v = v + :one", condition: "dust >= :cost", values: { ":cost": RECAST_DUST, ":one": 1 } },
    { put: { PK: U, SK: `LEDGER#recast#${code}#${lens.id}#${now}`, delta: -RECAST_DUST, unit: "dust", reason: "recast", ref: code, at: now }, condition: "attribute_not_exists(PK)" },
    {
      put: { PK: `CARD#${code}`, SK: `RECAST#${lens.id}`, json: JSON.stringify(row.snap), at: now, by: userId, ...(row.season ? { season: row.season } : {}) },
      condition: "attribute_not_exists(PK) OR #at <= :weekAgo",
      names: { "#at": "at" },
      values: { ":weekAgo": now - WEEK },
    },
    // The card face only needs which lenses: one attribute per lens on STYLE, so no read-modify-write.
    { update: { PK: `CARD#${code}`, SK: "STYLE" }, set: "SET #l = :at", names: { "#l": `r_${lens.id}` }, values: { ":at": now } },
  ]);
  if (!r) return { status: "error" };
  if (!r.ok) return { status: r.reasons[0] === CCF ? "poor" : r.reasons[2] === CCF ? "too-soon" : "error" };
  return { status: "recast", row };
}

/** Living sigils for a card you minted. Holo and Secret have them already. */
export async function buyLiving(userId: string, code: string, rarity: string, now = Date.now()): Promise<"bought" | "has" | "not-owner" | "poor" | "error"> {
  if (rarity === "holo" || rarity === "secret") return "has";
  const own = await ownMint(userId, code);
  if (own !== "ok") return own;
  const U = `USER#${userId}`;
  const r = await ddbTransact([
    { update: { PK: U, SK: "WALLET" }, set: "SET dust = dust - :cost, v = v + :one", condition: "dust >= :cost", values: { ":cost": LIVING_DUST, ":one": 1 } },
    { put: { PK: U, SK: `LEDGER#living#${code}`, delta: -LIVING_DUST, unit: "dust", reason: "living", ref: code, at: now }, condition: "attribute_not_exists(PK)" },
    { update: { PK: `CARD#${code}`, SK: "STYLE" }, set: "SET living = :one", condition: "attribute_not_exists(living)", values: { ":one": 1 } },
  ]);
  if (!r) return "error";
  if (r.ok) return "bought";
  return r.reasons[0] === CCF ? "poor" : r.reasons[1] === CCF || r.reasons[2] === CCF ? "has" : "error";
}
