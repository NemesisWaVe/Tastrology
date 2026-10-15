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
}

export interface InsightsParams {
  type: EntityKind | "tag";
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
  mode: "live" | "mock";
  planner: "llm" | "autopilot";
  cached?: boolean;
  createdAt: number;
  seeds: QEntity[];
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
  feedback?: { liked: string[]; disliked: string[] };
  changes?: { added: QTag[]; removed: QTag[]; why: string[] };
}

export type TraceEvent =
  | { type: "step"; id: string; label: string; status: "run" | "done" | "warn"; detail?: string }
  | { type: "thought"; text: string }
  | { type: "tool"; name: string; args: string; calls: QlooCallLog[]; summary: string }
  | { type: "result"; result: StyleResult }
  | { type: "error"; message: string };

export interface AgentRequest {
  seeds: { id: string; name: string; kind: EntityKind }[];
  budget?: 1 | 2 | 3;
  goal?: string;
  feedback?: { liked: string[]; disliked: string[] };
  /** Previous round, for the "what changed" diff. Names are display labels only, never recommendations. */
  previous?: { brandIds: string[]; names?: Record<string, string> };
}
