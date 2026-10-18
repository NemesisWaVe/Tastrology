import { AGENT_VERSION } from "@/lib/agent";
import { qlooMode } from "@/lib/qloo";
import { SEED_KINDS, type AgentRequest } from "@/lib/types";
import { VIBE_ID_RE, VIBES_MAX } from "@/lib/vibes";
import { blocked } from "@/lib/guard";

export const GOAL_MAX = 200;
export const BODY_MAX_BYTES = 16 * 1024;
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

const ids = (v: unknown, max = 60): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 128).slice(0, max) : [];

/** Validates and clamps a raw request body. Returns an error string when it can't be used. */
export function normalizeRequest(raw: unknown): AgentRequest | string {
  const b = (raw ?? {}) as Record<string, unknown>;
  // 2 to 8 named loves, or 1 named love plus at least one vibe (lib/vibes.ts).
  const vibeCount = Array.isArray(b.vibes) ? b.vibes.length : 0;
  if (!Array.isArray(b.seeds) || b.seeds.length < (vibeCount ? 1 : 2) || b.seeds.length > 8) return "Add between 2 and 8 seeds.";
  const seeds = (b.seeds as Record<string, unknown>[]).map((s) => ({
    id: String(s?.id ?? "").slice(0, 128),
    name: String(s?.name ?? "").slice(0, 120),
    kind: s?.kind as AgentRequest["seeds"][number]["kind"],
  }));
  if (seeds.some((s) => !s.name.trim())) return "Every seed needs a name.";
  if (seeds.some((s) => !SEED_KINDS.includes(s.kind))) return "One of those picks isn't a type we can read.";
  if (seeds.some((s) => s.id && !ID_RE.test(s.id))) return "One of those picks has a bad id. Pick it from the search list.";
  // The content guard (lib/guard.ts): nothing explicit reaches Qloo, the LLM prompt or a card.
  if (seeds.some((s) => blocked(s.name))) return "One of those picks can't go on a card. Try something else.";
  const req: AgentRequest = { seeds };
  if (Array.isArray(b.vibes) && b.vibes.length) {
    if (b.vibes.length > VIBES_MAX) return `Pick up to ${VIBES_MAX} vibes.`;
    const vibes = (b.vibes as Record<string, unknown>[]).map((v) => ({ id: String(v?.id ?? ""), name: String(v?.name ?? "").trim().slice(0, 60) }));
    if (vibes.some((v) => !VIBE_ID_RE.test(v.id) || !v.name)) return "One of those vibes isn't one we can read. Pick it from the search list.";
    if (vibes.some((v) => blocked(v.name) || blocked(v.id))) return "One of those vibes can't go on a card. Try something else.";
    req.vibes = vibes.filter((v, i) => vibes.findIndex((x) => x.id === v.id) === i);
  }
  if (b.budget === 1 || b.budget === 2 || b.budget === 3) req.budget = b.budget;
  const goal = typeof b.goal === "string" ? b.goal.trim().slice(0, GOAL_MAX) : "";
  if (goal && blocked(goal)) return "That occasion can't go on a card. Try another, or leave it blank.";
  if (goal) req.goal = goal;
  const fb = b.feedback as Record<string, unknown> | undefined;
  if (fb) req.feedback = { liked: ids(fb.liked), disliked: ids(fb.disliked) };
  const prev = b.previous as Record<string, unknown> | undefined;
  if (prev) {
    const names: Record<string, string> = {};
    for (const [k, v] of Object.entries((prev.names ?? {}) as Record<string, unknown>).slice(0, 60))
      if (typeof v === "string") names[k.slice(0, 128)] = v.slice(0, 80);
    req.previous = { brandIds: ids(prev.brandIds), names };
  }
  return req;
}

/** Cache / dedupe key: everything that changes the output of a run. */
export function cacheKey(req: AgentRequest, llm = process.env.LLM_MODEL ?? ""): string {
  return JSON.stringify({
    v: AGENT_VERSION,
    m: qlooMode(),
    llm,
    s: req.seeds.map((s) => `${s.id}|${s.kind}|${s.name.toLowerCase()}`).sort(),
    b: req.budget ?? 0,
    g: (req.goal ?? "").trim().slice(0, GOAL_MAX).toLowerCase(),
    l: [...(req.feedback?.liked ?? [])].sort(),
    d: [...(req.feedback?.disliked ?? [])].sort(),
    p: [...(req.previous?.brandIds ?? [])].sort(),
    // Only when present, so every key minted before vibes stays the same.
    ...(req.vibes?.length ? { vb: req.vibes.map((v) => v.id).sort() } : {}),
  });
}
