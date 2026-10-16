import { AGENT_VERSION } from "@/lib/agent";
import { qlooMode } from "@/lib/qloo";
import { SEED_KINDS, type AgentRequest } from "@/lib/types";

export const GOAL_MAX = 200;
export const BODY_MAX_BYTES = 16 * 1024;
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

const ids = (v: unknown, max = 60): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 128).slice(0, max) : [];

/** Validates and clamps a raw request body. Returns an error string when it can't be used. */
export function normalizeRequest(raw: unknown): AgentRequest | string {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (!Array.isArray(b.seeds) || b.seeds.length < 2 || b.seeds.length > 8) return "Add between 2 and 8 seeds.";
  const seeds = (b.seeds as Record<string, unknown>[]).map((s) => ({
    id: String(s?.id ?? "").slice(0, 128),
    name: String(s?.name ?? "").slice(0, 120),
    kind: s?.kind as AgentRequest["seeds"][number]["kind"],
  }));
  if (seeds.some((s) => !s.name.trim())) return "Every seed needs a name.";
  if (seeds.some((s) => !SEED_KINDS.includes(s.kind))) return "One of those picks isn't a type we can read.";
  if (seeds.some((s) => s.id && !ID_RE.test(s.id))) return "One of those picks has a bad id. Pick it from the search list.";
  const req: AgentRequest = { seeds };
  if (b.budget === 1 || b.budget === 2 || b.budget === 3) req.budget = b.budget;
  const goal = typeof b.goal === "string" ? b.goal.trim().slice(0, GOAL_MAX) : "";
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
  });
}
