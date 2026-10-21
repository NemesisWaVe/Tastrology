export type EntityKind =
  | "artist"
  | "movie"
  | "tv_show"
  | "book"
  | "place"
  | "podcast"
  | "videogame"
  | "brand"
  | "destination"
  | "person";

export const SEED_KINDS: EntityKind[] = [
  "artist",
  "movie",
  "tv_show",
  "book",
  "place",
  "podcast",
  "videogame",
];

export interface QTag {
  id: string;
  name: string;
  /** Qloo's 0-1 popularity for the tag, when it sends one. */
  popularity?: number;
}

/** A Qloo entity, normalized from either the live API or the mock graph. */
export interface QEntity {
  id: string;
  name: string;
  kind: EntityKind;
  image?: string;
  subtitle?: string;
  tags: QTag[];
  popularity?: number;
  /** query.affinity from an insights call (0-1). */
  affinity?: number;
  /** query.explainability: signal entity id -> normalized influence (0-1). */
  explain?: Record<string, number>;
  /** Price band: from Qloo price_range_usd_min (live) or the mock graph. */
  tier?: 1 | 2 | 3;
  /** Qloo brand properties: personal_style + aesthetic_properties. */
  style?: string[];
  /** Qloo properties.official_site (brands; not always present). */
  site?: string;
  /** Qloo properties.external.instagram id (a handle), when Qloo has one. */
  instagram?: string;
  /** Qloo properties.founded_year. */
  founded?: string;
}

export interface InsightsParams {
  type: EntityKind | "tag";
  audience?: Audience;
  entityIds: string[];
  tagIds?: string[];
  filterTags?: string[];
  excludeIds?: string[];
  /** filter.tag.types, for urn:tag insights. */
  tagTypes?: string[];
  popularity?: { min?: number; max?: number };
  take?: number;
  explain?: boolean;
}

export interface QlooCallLog {
  endpoint: string;
  params: Record<string, string>;
  ms: number;
  cached: boolean;
  count: number;
}

export interface BrandMatch {
  entity: QEntity;
  affinity: number;
  category: string;
  /** Qloo explainability share per seed id (0-1). */
  explain: Record<string, number>;
  /** Affinity lost when the seed is removed (leave-one-out re-query). */
  ablation: Record<string, number>;
  /** Seed ids that most drive this brand, strongest first. */
  because: string[];
  why?: string;
  /** 1 = picked by the separate query for the minority side of a split taste. */
  side?: 1;
}

export interface RejectedBrand {
  entity: QEntity;
  affinity: number;
  reason: string;
}

export interface Contradiction {
  a: string;
  b: string;
  overlap: number;
}

export interface Lobe {
  seedIds: string[];
  keywords: QTag[];
}

export interface Bridge {
  entity: QEntity;
  because: string[];
  why?: string;
}

export interface CapsuleSlot {
  category: string;
  brandIds: string[];
}

export interface StyleResult {
  runId: string;
  /** Set when a regret credit paid for this reading: the card can't outrank the one it replaced (regret-burn.md). */
  redraw?: { cap: "common" | "rare" | "holo" | "secret" };
  /** The mint's rarity roll (lib/roll.ts). Absent on older cards and demo personas: they keep the taste-scored tier. */
  roll?: { tier: "common" | "rare" | "holo" | "secret"; u: number; season: string };
  /** Demo personas only: the fixed tier each one shows, so the home page displays Rare, Holo Rare and Secret Rare. */
  showcase?: "common" | "rare" | "holo" | "secret";
  mode: "live" | "mock";
  planner: "llm" | "autopilot";
  cached?: boolean;
  createdAt: number;
  seeds: QEntity[];
  /** Tastes that aren't one named thing (Qloo tags), and what they were read as. Never part of rarity. */
  vibes?: { id: string; name: string; via: string[]; image?: string }[];
  dna: {
    name: string;
    tagline: string;
    keywords: QTag[];
    lobes: Lobe[];
  };
  brands: BrandMatch[];
  rejected: RejectedBrand[];
  contradictions: Contradiction[];
  bridges: Bridge[];
  capsule: CapsuleSlot[];
  critique: string[];
  stats: { qlooCalls: number; ms: number; llmSteps: number };
  grounding?: { verified: number; displayed: number; source: "qloo" | "synthetic" };
  /** Average pairwise Jaccard of the seeds' aesthetic tag sets (0-1). Feeds the rarity score. */
  overlap?: number;
  /** Seeds that barely move any brand pick; `influence` is their avg share (0-1). Never invented: absent when none. */
  inert?: { id: string; influence: number }[];
  feedback?: { liked: string[]; disliked: string[] };
  changes?: { added: QTag[]; removed: QTag[]; why: string[] };
}

/**
 * Values a run has already computed from Qloo, streamed as they land so the reading scene can draw them.
 * Never anything the final result doesn't also back. Scores are whole 0–100.
 */
export type SceneData =
  | { kind: "seeds"; seeds: { id: string; name: string; kind: string; image?: string }[] }
  | { kind: "tags"; perSeed: Record<string, string[]>; consensus: string[]; sides: string[][] }
  | { kind: "brands"; brands: { id: string; name: string; affinity: number }[] }
  /** One leave-one-out call: how far each top brand's affinity fell without `seed`. */
  | { kind: "ablation"; seed: string; drops: Record<string, number> }
  | { kind: "critique"; kept: string[]; rejected: { id: string; why: "fluke" | "budget" }[]; strongest?: string; inert: string[] }
  | { kind: "bridges"; bridges: { id: string; name: string; kind: string }[] }
  /** The vibes picked next to the loves, and what each was read as (lib/vibes.ts). */
  | { kind: "vibes"; vibes: { name: string; via: string[]; image?: string }[] };

export type TraceEvent = { at?: number } & (
  | { type: "step"; id: string; label: string; status: "run" | "done" | "warn"; detail?: string }
  | { type: "data"; data: SceneData }
  | { type: "thought"; text: string }
  | { type: "tool"; name: string; args: string; calls: QlooCallLog[]; summary: string }
  | { type: "result"; result: StyleResult }
  | { type: "error"; message: string; reason?: "upstream" | "deadline" });

export interface AgentRequest {
  seeds: { id: string; name: string; kind: EntityKind }[];
  /** Up to 2 Qloo tags ("ramen", "shoegaze") picked next to the named loves (lib/vibes.ts). */
  vibes?: { id: string; name: string }[];
  budget?: 1 | 2 | 3;
  goal?: string;
  feedback?: { liked: string[]; disliked: string[] };
  /** Previous round, for the "what changed" diff. Names are display labels only, never recommendations. */
  previous?: { brandIds: string[]; names?: Record<string, string> };
  /** Who the reading is for, from the account profile (never the request body): steers Qloo and drops items made for another audience. */
  audience?: Audience;
}

/** Gender as picked on the profile; "" is "rather not say". Only woman/man become a Qloo demographic signal. */
export type Audience = "woman" | "man" | "nonbinary" | "";

