import { findTags, insights, searchEntities } from "./qloo";
import type { QEntity, QlooCallLog } from "./types";

/**
 * Vibes: tastes that aren't one named thing. "Ramen", "shoegaze", "hiking", "vintage". They're Qloo tags, picked
 * next to your named loves (at least 2 of those, at most VIBES_MAX vibes), and they only steer the brand query:
 * they never count toward rarity, so typing broad words can't farm a Holo.
 *
 * A bare tag is a weak brand signal (ramen alone pulls in museums), so each family is turned into something
 * Qloo reads well, tested on the live API:
 *   music  genre:music:*                  -> its top 2 artists (k-pop -> BLACKPINK, BoA)
 *   food   cuisine / dish / menu tags     -> brands named for it (ramen -> Top Ramen, matcha -> Matcha Maiden)
 *   other  keywords, activities, styles   -> the tag itself as a signal (hiking -> Arc'teryx, Merrell)
 */
export const VIBES_MAX = 2;
export const VIBE_ID_RE = /^urn:tag:[a-z0-9_:.-]{3,160}$/;

export interface Vibe {
  id: string;
  name: string;
}
export type VibeFamily = "music" | "food" | "screen" | "place" | "other";

/** Tag families worth offering, best first. Everything else (occupations, amenities, hotel genres...) is noise here. */
const FAMILIES: [RegExp, VibeFamily, string][] = [
  [/^urn:tag:genre:music:/, "music", "Music genre"],
  [/^urn:tag:(cuisine|specialty_dish|menu_highlight):/, "food", "Food"],
  [/^urn:tag:genre:media:/, "screen", "Screen genre"],
  [/^urn:tag:(keyword|activities|style|subgenre|setting):/, "other", "Vibe"],
  [/^urn:tag:category:place:/, "place", "Kind of place"],
];

export function familyOf(id: string): { family: VibeFamily; label: string; rank: number } | null {
  const i = FAMILIES.findIndex(([re]) => re.test(id));
  return i < 0 ? null : { family: FAMILIES[i][1], label: FAMILIES[i][2], rank: i };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Up to `take` vibes for what someone typed: one per distinct name, from the best family. */
export async function searchVibes(q: string, take = 3): Promise<(Vibe & { label: string })[]> {
  const tags = await findTags(q, 15);
  const best = new Map<string, { id: string; name: string; label: string; rank: number }>();
  for (const t of tags) {
    const f = familyOf(t.id);
    if (!f) continue;
    const k = norm(t.name).replace(/ /g, "");
    if (!k) continue;
    const cur = best.get(k);
    if (!cur || f.rank < cur.rank) best.set(k, { id: t.id, name: t.name, label: f.label, rank: f.rank });
  }
  return [...best.values()]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, take)
    .map(({ id, name, label }) => ({ id, name, label }));
}

/** What the brand query gets from the vibes: anchor entities and/or plain tag signals. Failures just drop out. */
export async function resolveVibes(vibes: Vibe[], log?: QlooCallLog[]): Promise<{ anchors: QEntity[]; tags: string[]; via: Record<string, string[]> }> {
  const anchors: QEntity[] = [];
  const tags: string[] = [];
  const via: Record<string, string[]> = {};
  await Promise.all(
    vibes.slice(0, VIBES_MAX).map(async (v) => {
      const f = familyOf(v.id)?.family ?? "other";
      if (f === "music" || f === "screen") {
        const type = f === "music" ? "artist" : "tv_show";
        const top = await insights({ type, entityIds: [], filterTags: [v.id], take: 2 }, log).catch(() => []);
        if (top.length) {
          anchors.push(...top);
          via[v.id] = top.map((x) => x.name);
        } else tags.push(v.id);
      } else if (f === "food") {
        const word = norm(v.name).split(" ")[0];
        const hits = await searchEntities(v.name, ["brand"], 5, log).catch(() => []);
        const named = hits.filter((h) => norm(h.name).includes(word)).slice(0, 2);
        if (named.length) {
          anchors.push(...named);
          via[v.id] = named.map((x) => x.name);
        } else tags.push(v.id);
      } else tags.push(v.id);
    }),
  );
  return { anchors, tags, via };
}
