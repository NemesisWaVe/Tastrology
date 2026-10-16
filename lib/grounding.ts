import type { QEntity } from "./types";

/**
 * Grounding ledger: every entity Qloo returns during a run is recorded here.
 * Anything shown as a recommendation must pass `assert`/`filter`, so the LLM
 * can phrase and group results but can never introduce one.
 */
export class GroundingLedger {
  private seen = new Map<string, QEntity>();

  record(entities: QEntity[]) {
    for (const e of entities) if (!this.seen.has(e.id)) this.seen.set(e.id, e);
  }

  has(id: string) {
    return this.seen.has(id);
  }

  get(id: string) {
    return this.seen.get(id);
  }

  /** Keeps only items whose id was returned by Qloo in this run. */
  filter<T>(items: T[], idOf: (t: T) => string): { kept: T[]; dropped: T[] } {
    const kept: T[] = [];
    const dropped: T[] = [];
    for (const it of items) (this.has(idOf(it)) ? kept : dropped).push(it);
    return { kept, dropped };
  }

  /** Drop any id the LLM produced that Qloo never returned. */
  sanitizeIds(ids: unknown): string[] {
    if (!Array.isArray(ids)) return [];
    return ids.map(String).filter((id) => this.has(id));
  }
}

/** "Neuromancer (Sprawl, #1)" → "Neuromancer"; "The Lunchbox" → "Lunchbox". Plain text, no card import. */
function stripSeed(name: string): string {
  const base = name.split(" / ")[0].replace(/\s*[([][^()[\]]*[)\]]\s*/g, " ").replace(/:.*$/, "").trim();
  const noun = base.replace(/^(the|a|an)\s+/i, "").replace(/\s+\d{1,4}$/, "").trim();
  return noun || base || name;
}

/** The noun in "The <Seed> Who …": the stripped name if it is 1-2 words, else its longest word ("Made in Heaven" becomes "Heaven"). */
export function shortSeed(name: string): string {
  const w = stripSeed(name).split(/\s+/);
  return w.length <= 2 ? w.join(" ") : w.reduce((a, b) => (b.length > a.length ? b : a));
}

/**
 * Grounds an LLM sign name "The <Noun> Who <Verb>" in the run's seeds. An exact seed noun is kept; a clipped one
 * ("The Daft Who…") gets its seed's full short name back; an invented noun is swapped for `lead`. Null if it can't be fixed.
 */
export function groundSignName(name: string, seedNames: string[], lead?: string): string | null {
  const m = /^The\s+(.+?)\s+Who\s+(.+)$/.exec(name.trim());
  if (!m) return null;
  const [, noun, verb] = m;
  const lc = (t: string) => t.toLowerCase();
  const seeds = seedNames.map((n) => ({ short: shortSeed(n), full: stripSeed(n) }));
  if (seeds.some((x) => lc(x.short) === lc(noun) || lc(x.full) === lc(noun))) return name.trim();
  const nounWords = lc(noun).split(/\s+/);
  const clipped = seeds.find((x) => nounWords.every((w) => lc(x.full).split(/\s+/).includes(w)));
  const pick = clipped?.short ?? (lead ? shortSeed(lead) : "");
  if (!pick) return null;
  const out = `The ${pick} Who ${verb}`;
  return out.split(/\s+/).length <= 6 && out.length <= 48 ? out : null;
}

/** A tagline is only allowed if it names at least one of the run's seeds (case-insensitive). */
export function tagMentionsSeed(tagline: string, seedNames: string[]): boolean {
  const t = tagline.toLowerCase();
  return seedNames.some((n) => {
    const full = stripSeed(n).toLowerCase();
    return full.length >= 3 && t.includes(full);
  });
}

/** The LLM's tagline if it names a seed; otherwise the deterministic one. */
export function chooseTagline(candidate: string, seedNames: string[], fallback: string): string {
  return candidate && tagMentionsSeed(candidate, seedNames) ? candidate : fallback;
}
