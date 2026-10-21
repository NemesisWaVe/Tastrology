import "server-only";
import { findTags, insights, searchEntities, withQlooLane } from "./qloo";
import { hasWords, pickVibes, scoreTags, termKey, VALIDATE_TYPE, type ScoredVibe } from "./vibes";
import type { EntityKind, QEntity, QlooCallLog } from "./types";

/**
 * Typeahead for the picker: what someone typed, read the way they meant it.
 *
 * Qloo answers one word two ways: named things (/search) and tags (/v2/tags). Both are noisy on their own. "Minecraft"
 * is a game, and also a music genre nobody listens to; "sneakers" is a style (Nike, Vans), and also a 1992 film and a
 * pistachio dessert on some menu. So the two answers check each other:
 *
 *  1. Both calls run at once (plus the stem of "sneakerhead"-style words, see IDENTITY).
 *  2. Tags are scored (lib/vibes scoreTags): family, exact name, popularity floors that drop menu and keyword noise.
 *  3. A strong named thing ("Minecraft" the game, popularity >= 0.9, top 3, same name) contests a same-named genre tag.
 *     The genre wins only if it leads somewhere real: its top artists / shows / brands are popular (one cached
 *     insights call, the same one the reading makes later). The music genre "Minecraft" leads to unknowns: dropped.
 *     The style "Sneakers" leads to Nike: kept, and it goes first.
 *  4. A vibe that matches the words exactly goes first unless a strong named thing contests it unchecked. Bars and
 *     shops that are only called the word ("Sneakers Pub") are dropped once the vibe is on offer.
 *  5. Same-named things of several kinds: the work before the company behind it (Minecraft the game before the
 *     Minecraft brand), and empty duplicates go.
 */

export interface Hit {
  id: string;
  name: string;
  kind: EntityKind | "vibe";
  subtitle?: string;
  image?: string;
}

/** "sneakerhead", "anime fan", "k-pop lover": the thing itself is the first part. */
const IDENTITY = /^(.{3,}?)[\s-]?(heads?|lovers?|fans?|nerds?|geeks?|addicts?|enthusiasts?|junkies?|buffs?|freaks?|collectors?|stans?)$/i;
export const stemOf = (q: string): string | null => {
  const m = q.trim().match(IDENTITY);
  return m && termKey(m[1]).length >= 3 ? m[1].trim() : null;
};

const STRONG_POP = 0.9;
/** A genre counts as real when one of its top entities is at least this popular. */
const REAL_POP = 0.95;
/** Longest the genre check may add to a keystroke; past it the vibe is offered, just not first. */
const CHECK_MS = 900;
const VIBE_NOTE = "a vibe, not one thing";

// No popularity at all means an empty record (a shop called "Sneakerhead"), never a strong one.
const strongNamed = (q: string, ents: QEntity[]) => ents.slice(0, 3).find((e) => termKey(e.name) === termKey(q) && (e.popularity ?? 0) >= STRONG_POP);

/** Does this genre tag lead to popular artists / shows / brands? null = couldn't tell in time. */
async function leadsSomewhere(v: ScoredVibe, log?: QlooCallLog[]): Promise<boolean | null> {
  const type = VALIDATE_TYPE[v.family as keyof typeof VALIDATE_TYPE];
  if (!type) return null;
  const check = insights({ type, entityIds: [], filterTags: [v.id], take: 2 }, log).then(
    // Empty: a music or style genre with nothing in it is fake ("gamer"), but Qloo never fills screen genres this way.
    (xs) => (xs.length ? xs.some((x) => (x.popularity ?? 0) >= REAL_POP) : v.family === "screen" ? null : false),
    () => null,
  );
  return Promise.race([check, new Promise<null>((r) => setTimeout(() => r(null), CHECK_MS))]);
}

/** Same-named entities: works before the brand behind them, near-empty duplicates dropped. Otherwise Qloo's order. */
export function tidyNamed(ents: QEntity[]): QEntity[] {
  const byName = new Map<string, QEntity[]>();
  for (const e of ents) byName.set(termKey(e.name), [...(byName.get(termKey(e.name)) ?? []), e]);
  const out: QEntity[] = [];
  const placed = new Set<string>();
  for (const e of ents) {
    const k = termKey(e.name);
    if (placed.has(k)) continue;
    placed.add(k);
    const group = byName.get(k)!;
    // A twin with no popularity at all is an empty record (Qloo's "Minecraft" TV show) next to the real one.
    const top = Math.max(...group.map((x) => x.popularity ?? 0));
    out.push(...group.filter((x) => group.length === 1 || (x.popularity ?? 0) >= 0.1 || top < 0.1).sort((a, b) => Number(a.kind === "brand") - Number(b.kind === "brand")));
  }
  return out;
}

const toHit = (e: QEntity): Hit => ({ id: e.id, name: e.name, kind: e.kind, subtitle: e.subtitle, image: e.image });
const vibeHit = (v: ScoredVibe): Hit => ({ id: v.id, name: v.name, kind: "vibe", subtitle: `${v.label} · ${VIBE_NOTE}` });

/**
 * Puts named results and scored vibes in one list. `checked` holds the genre checks already made (id -> real?).
 * Pure: the Qloo calls happen in searchTaste.
 */
export function rank(q: string, ents: QEntity[], vibes: ScoredVibe[], checked: Map<string, boolean | null>, take = 7): Hit[] {
  const strong = strongNamed(q, ents);
  const ok = pickVibes(q, vibes.filter((v) => checked.get(v.id) !== false));
  // Exact vibes lead, unless a strong named thing contests one that wasn't shown to be real.
  const lead = ok.filter((v) => v.exact && (!strong || checked.get(v.id) === true || (v.family === "food" && strong.kind === "place")));
  const follow = ok.filter((v) => !lead.includes(v));
  // With a vibe leading, places that are only called the word ("Sneakers Bistro", a "Ramen" shop) are noise.
  const word = termKey(stemOf(q) ?? q);
  const named = tidyNamed(lead.some((v) => v.family !== "place") ? ents.filter((e) => !(e.kind === "place" && termKey(e.name).includes(word))) : ents);
  // At most 2 vibes lead; without a lead, at most 2 ride along after the top named hits.
  const ride = lead.length ? follow.slice(0, 1) : follow.slice(0, 2);
  const hits = [...lead.slice(0, 2).map(vibeHit), ...named.slice(0, 3).map(toHit), ...ride.map(vibeHit), ...named.slice(3).map(toHit)];
  const seen = new Set<string>();
  return hits.filter((h) => !seen.has(`${h.kind}|${h.id}`) && seen.add(`${h.kind}|${h.id}`)).slice(0, take);
}

export interface TasteResult {
  hits: Hit[];
  results: QEntity[];
  vibes: { id: string; name: string; label: string }[];
}

/**
 * One typeahead answer. mode "mix": named things plus vibes (the "everything" tab). "named": one kind only.
 * "vibes": the Vibes tab, tags alone. Runs in the search lane: fast to give up, never behind readings.
 */
export function searchTaste(q: string, kinds: EntityKind[], mode: "mix" | "named" | "vibes", log?: QlooCallLog[]): Promise<TasteResult> {
  return withQlooLane("search", async () => {
    const stem = stemOf(q);
    const wantTags = mode !== "named" && q.length >= 3;
    const [ents, tags, stemTags] = await Promise.all([
      mode === "vibes" ? Promise.resolve([] as QEntity[]) : searchEntities(q, kinds, 10, log),
      wantTags ? findTags(q, 15, log).catch(() => []) : Promise.resolve([]),
      wantTags && stem ? findTags(stem, 15, log).catch(() => []) : Promise.resolve([]),
    ]);
    let vibes = wantTags ? scoreTags(q, tags) : [];
    // "anime fan": named things must at least be about anime (not "Fan's Cafe", "Stan Wadlow Park").
    const about = stem && !strongNamed(q, ents) ? ents.filter((e) => hasWords(e.name, stem)) : ents;
    // "sneakerhead": the stem's tags, read as if the stem was typed, when the word itself names nothing strong
    // ("Radiohead" is a band, not a fan of radio).
    if (stem && !vibes.some((v) => v.exact) && !strongNamed(q, ents)) {
      const fromStem = scoreTags(stem, stemTags);
      vibes = [...fromStem, ...vibes];
      q = stem;
    }
    const checked = new Map<string, boolean | null>();
    const strong = mode === "mix" ? strongNamed(q, ents) : undefined;
    // Only contested genres get checked: exact, of a family that resolves to entities, against a strong name (or on
    // the Vibes tab, where there are no names to weigh them against).
    if (strong || mode === "vibes") {
      const contested = vibes.filter((v) => v.exact && v.family in VALIDATE_TYPE).slice(0, 3);
      const res = await Promise.all(contested.map((v) => leadsSomewhere(v, log)));
      contested.forEach((v, i) => checked.set(v.id, res[i]));
    }
    const plain = (v: ScoredVibe) => ({ id: v.id, name: v.name, label: v.label });
    if (mode === "vibes") {
      const real = pickVibes(q, vibes.filter((v) => checked.get(v.id) !== false)).slice(0, 6);
      return { hits: real.map(vibeHit), results: [], vibes: real.map(plain) };
    }
    if (mode === "named") return { hits: tidyNamed(about).slice(0, 7).map(toHit), results: about, vibes: [] };
    return { hits: rank(q, about, vibes, checked), results: about, vibes: pickVibes(q, vibes.filter((v) => checked.get(v.id) !== false)).slice(0, 3).map(plain) };
  });
}
