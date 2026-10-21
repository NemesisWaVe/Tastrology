import { after } from "next/server";
import { warmLove, warmVibe } from "@/lib/agent";
import { blocked } from "@/lib/guard";
import { allow, clientId } from "@/lib/ratelimit";
import { SEED_KINDS, type EntityKind } from "@/lib/types";
import { VIBE_ID_RE } from "@/lib/vibes";

export const runtime = "nodejs";

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/**
 * The picker calls this the moment a love or vibe is added: Qloo starts on the calls that depend on it alone
 * (lib/agent warmLove/warmVibe), so by the time someone mints, those answers are already in the shared cache.
 * Answers at once; the work runs after the response. Nothing here is billed or saved beyond Qloo's own cache.
 */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as { seed?: { id?: unknown; name?: unknown; kind?: unknown }; vibe?: { id?: unknown; name?: unknown } } | null;
  const s = b?.seed;
  const v = b?.vibe;
  const seed =
    s && typeof s.id === "string" && ID_RE.test(s.id) && typeof s.name === "string" && s.name.length <= 200 && SEED_KINDS.includes(s.kind as EntityKind)
      ? { id: s.id, name: s.name, kind: s.kind as EntityKind }
      : null;
  const vibe = v && typeof v.id === "string" && VIBE_ID_RE.test(v.id) && typeof v.name === "string" && v.name.length <= 80 ? { id: v.id, name: v.name } : null;
  if (!seed && !vibe) return new Response(null, { status: 400 });
  if (blocked(seed?.name ?? vibe!.name) || blocked(seed?.id ?? vibe!.id)) return new Response(null, { status: 204 });
  // Own bucket, generous enough for a picker's worth of adds and removes.
  if (!(await allow(`warm:${clientId(request.headers)}`, 60, 10 * 60 * 1000))) return new Response(null, { status: 429 });
  const work = seed ? warmLove(seed) : warmVibe(vibe!);
  try {
    after(work.catch(() => {}));
  } catch {
    void work.catch(() => {});
  }
  return new Response(null, { status: 202 });
}
