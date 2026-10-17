import { KIND_LABEL, type CardData } from "./card";
import { upstash } from "./cache";
import { insights, searchEntities } from "./qloo";
import { bumpDaily } from "./ratelimit";
import { liteSnap, type Snap, type SnapBrand, type SnapLove } from "./receipt";
import type { EntityKind } from "./types";

/**
 * Brands move even when taste doesn't. "Fresh this week": one brand-only Qloo call per card per week, cached, under a
 * global daily guard so a crowd of returning visitors can't burn the quota (docs/design/brand-return-data.md §3).
 */
const WEEK_S = 7 * 24 * 3600;
const DRIFT_DAILY_MAX = Number(process.env.DRIFT_DAILY_MAX) || 200;
const REREAD_DAILY_MAX = Number(process.env.REREAD_DAILY_MAX) || 100;

export interface Drift {
  asOf: number;
  /** In Qloo's list today, not on the card's receipt. */
  entered: SnapBrand[];
  /** On the receipt, gone from today's list. */
  left: { id: string; name: string }[];
}

async function brandsFor(loves: SnapLove[]) {
  const ids = loves.map((l) => l.id).filter(Boolean);
  if (!ids.length) return [];
  return insights({ type: "brand", entityIds: ids, take: 12, explain: true });
}

/** This week's drift for a card, from cache or one fresh call. Null when there's nothing to compare or the day's budget is spent. */
export async function driftFor(code: string, snap: Snap, now = Date.now()): Promise<Drift | null> {
  const key = `tm:drift:${code}`;
  const hit = await upstash([["GET", key]]);
  let today: SnapBrand[] | null = null;
  let asOf = now;
  if (hit && typeof hit[0] === "string") {
    try {
      const j = JSON.parse(hit[0]) as { asOf: number; brands: SnapBrand[] };
      today = j.brands;
      asOf = j.asOf;
    } catch {}
  }
  if (!today) {
    if ((await bumpDaily("drift")) > DRIFT_DAILY_MAX) return null;
    const fresh = await brandsFor(snap.loves).catch(() => null);
    if (!fresh) return null;
    today = liteSnap(snap.loves, fresh, now).brands;
    await upstash([["SET", key, JSON.stringify({ asOf: now, brands: today }), "EX", WEEK_S]]);
  }
  const had = new Set(snap.brands.map((b) => b.id));
  const has = new Set(today.map((b) => b.id));
  return {
    asOf,
    entered: today.filter((b) => !had.has(b.id)).slice(0, 3),
    left: snap.brands.slice(0, 8).filter((b) => !has.has(b.id)).map((b) => ({ id: b.id, name: b.name })),
  };
}

const KIND_OF = Object.fromEntries(Object.entries(KIND_LABEL).map(([k, v]) => [v, k as EntityKind])) as Record<string, EntityKind>;

/**
 * For a card minted before receipts were kept: find its loves in Qloo again and ask for brands once. The card itself
 * is unchanged; the sheet says plainly that this is a re-read, not the original receipt.
 */
export async function rereadBrands(card: CardData, now = Date.now()): Promise<Snap | null> {
  if ((await bumpDaily("reread")) > REREAD_DAILY_MAX) return null;
  const loves = (
    await Promise.all(
      card.evolvesFrom.slice(0, 8).map(async (l): Promise<SnapLove | null> => {
        const kind = KIND_OF[l.kind] ?? (l.kind as EntityKind);
        const [e] = await searchEntities(l.name, [kind], 1).catch(() => []);
        return e ? { id: e.id, name: l.name, kind: l.kind, image: l.image } : null;
      }),
    )
  ).filter((x): x is SnapLove => Boolean(x));
  if (!loves.length) return null;
  const brands = await brandsFor(loves).catch(() => null);
  if (!brands?.length) return null;
  return liteSnap(loves, brands, now);
}
