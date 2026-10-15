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
