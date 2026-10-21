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
 *   style  genre:brand:*                  -> its top 2 brands (sneakers -> Nike)
 *   food   cuisine / dish / menu tags     -> brands named for it (ramen -> Top Ramen, matcha -> Matcha Maiden)
 *   other  keywords, activities, styles   -> the tag itself as a signal (hiking -> Arc'teryx, Merrell)
 */
export const VIBES_MAX = 2;
export const VIBE_ID_RE = /^urn:tag:[a-z0-9_:.-]{3,160}$/;

export interface Vibe {
  id: string;
  name: string;
}
export type VibeFamily = "music" | "style" | "food" | "screen" | "place" | "other";

/**
 * Tag families worth offering, best first, each with the Qloo popularity a tag needs to be offered at all.
 * Everything else (occupations, amenities, decor, nearby attractions...) is noise here.
 * Dish and menu tags are the noisiest: menus name dishes after anything ("Sneakers" is a pistachio dessert, "Hades" a
 * burger), so they only count when they are exactly what was typed and popular.
 */
const FAMILIES: { re: RegExp; family: VibeFamily; label: string; floor: number; exact?: boolean }[] = [
  { re: /^urn:tag:genre:music:/, family: "music", label: "Music genre", floor: 0 },
  { re: /^urn:tag:genre:brand:/, family: "style", label: "Style", floor: 0 },
  { re: /^urn:tag:cuisine:/, family: "food", label: "Food", floor: 0.5 },
  { re: /^urn:tag:genre:media:/, family: "screen", label: "Screen genre", floor: 0 },
  { re: /^urn:tag:(keyword|activities|style|subgenre|setting|audience):/, family: "other", label: "Vibe", floor: 0.5 },
  { re: /^urn:tag:(specialty_dish|menu_highlight):/, family: "food", label: "Food", floor: 0.9, exact: true },
  { re: /^urn:tag:category:place:/, family: "place", label: "Kind of place", floor: 0.5 },
];

export function familyOf(id: string): { family: VibeFamily; label: string; rank: number } | null {
  const i = FAMILIES.findIndex((f) => f.re.test(id));
  return i < 0 ? null : { family: FAMILIES[i].family, label: FAMILIES[i].label, rank: i };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** One key for "Sneakers", "sneaker", "K-Pop" and "kpop": lowercase, no spaces or marks, no plural s. */
export const termKey = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join("");

/**
 * Every word of `term` starts a word of `name` (plural-blind): "Kyoto Cuisine" has kyoto, "Sneakerheads" has sneaker;
 * "Game Remixes" lacks gamer.
 */
export const hasWords = (name: string, term: string) => {
  const words = name.split(/[^A-Za-z0-9]+/).map(termKey).filter(Boolean);
  const need = term.split(/[^A-Za-z0-9]+/).map(termKey).filter(Boolean);
  const whole = termKey(term);
  return need.length > 0 && (need.every((w) => words.some((x) => x.startsWith(w))) || words.some((x) => x.startsWith(whole)));
};

export type ScoredVibe = Vibe & { label: string; family: VibeFamily; exact: boolean; score: number };

/** Ranks raw tags for a term: an exact name beats everything, then family, then popularity. */
export function scoreTags(term: string, tags: { id: string; name: string; popularity?: number }[]): ScoredVibe[] {
  const want = termKey(term);
  const best = new Map<string, ScoredVibe>();
  for (const t of tags) {
    const i = FAMILIES.findIndex((f) => f.re.test(t.id));
    if (i < 0) continue;
    const f = FAMILIES[i];
    const k = termKey(t.name);
    if (!k) continue;
    const exact = k === want;
    // Mock and older responses carry no popularity: they pass.
    if ((t.popularity ?? 1) < f.floor || (f.exact && !exact)) continue;
    const score = (exact ? 100 : 0) - i * 10 + (t.popularity ?? 0.5);
    // One per name and label: "Ramen" the cuisine and "Ramen" the dish are one food; "Anime" the music genre and
    // "Anime" the screen genre are two different things, and both stay for search to weigh (see pickVibes).
    const key = `${f.label}|${k}`;
    const cur = best.get(key);
    if (!cur || score > cur.score) best.set(key, { id: t.id, name: t.name, label: f.label, family: f.family, exact, score });
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/**
 * What to offer from scored vibes, best first: the best one per name, plus a second for the same name only when it
 * is a different kind of genre ("Anime": music and screen), never a plain "Vibe" twin of a genre. Loose matches must
 * still contain the words ("Kyoto cuisine" for kyoto; not "Atlantic Ocean" for frank ocean).
 */
export function pickVibes(term: string, vibes: ScoredVibe[]): ScoredVibe[] {
  const per = new Map<string, ScoredVibe[]>();
  const out: ScoredVibe[] = [];
  for (const v of vibes) {
    const k = termKey(v.name);
    if (!v.exact && !hasWords(v.name, term)) continue;
    const got = per.get(k) ?? [];
    if (got.length >= 2 || (got.length === 1 && (v.family === "other" || v.family === "place"))) continue;
    per.set(k, [...got, v]);
    out.push(v);
  }
  return out;
}

/** Up to `take` vibes for what someone typed, best first. */
export async function searchVibes(q: string, take = 3): Promise<(Vibe & { label: string })[]> {
  return pickVibes(q, scoreTags(q, await findTags(q, 15)))
    .slice(0, take)
    .map(({ id, name, label }) => ({ id, name, label }));
}

/** Where a genre tag's own entities live: what it resolves to, and how search checks the tag is a real genre. */
export const VALIDATE_TYPE = { music: "artist", screen: "tv_show", style: "brand" } as const;

/** What the brand query gets from the vibes: anchor entities and/or plain tag signals. Failures just drop out. */
export async function resolveVibes(
  vibes: Vibe[],
  log?: QlooCallLog[],
): Promise<{ anchors: QEntity[]; tags: string[]; via: Record<string, string[]>; image: Record<string, string> }> {
  const anchors: QEntity[] = [];
  const tags: string[] = [];
  const via: Record<string, string[]> = {};
  // A tag has no picture, so a vibe shows the picture of what it was read as (Matcha Maiden for matcha), when Qloo has one.
  const image: Record<string, string> = {};
  const pic = (id: string, xs: QEntity[]) => {
    const src = xs.find((x) => x.image)?.image;
    if (src) image[id] = src;
  };
  await Promise.all(
    vibes.slice(0, VIBES_MAX).map(async (v) => {
      const f = familyOf(v.id)?.family ?? "other";
      if (f === "music" || f === "screen" || f === "style") {
        const type = VALIDATE_TYPE[f];
        const top = await insights({ type, entityIds: [], filterTags: [v.id], take: 2 }, log).catch(() => []);
        if (top.length) {
          anchors.push(...top);
          via[v.id] = top.map((x) => x.name);
          pic(v.id, top);
        } else tags.push(v.id);
      } else if (f === "food") {
        const word = norm(v.name).split(" ")[0];
        const hits = await searchEntities(v.name, ["brand"], 5, log).catch(() => []);
        const named = hits.filter((h) => norm(h.name).includes(word)).slice(0, 2);
        if (named.length) {
          anchors.push(...named);
          via[v.id] = named.map((x) => x.name);
          pic(v.id, named);
        } else tags.push(v.id);
      } else tags.push(v.id);
    }),
  );
  return { anchors, tags, via, image };
}
