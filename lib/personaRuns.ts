import { createHash } from "node:crypto";
import { LRU } from "./cache";
import { ddbGetStatus, ddbPutIfAbsent } from "./ddb";
import { s3Get, s3PutIfAbsent } from "./s3";
import type { StyleResult, TraceEvent } from "./types";

/**
 * The demo personas, read once and kept: every later visitor replays the same run, so the landing page never spends a
 * Qloo call. Stored like a receipt (our derived reading and its trace, not raw Qloo responses), write-once.
 *   PERSONA#<hash>  RUN   json        DynamoDB
 *   personas/v1/<hash>.json           S3 copy
 */
export type PersonaRun = { events: TraceEvent[]; result: StyleResult };

const mem = new LRU<PersonaRun>(20, 24 * 3600 * 1000);
const MAX_BYTES = 350_000;
const id = (key: string) => createHash("sha256").update(key).digest("base64url").slice(0, 24);

export async function getPersonaRun(key: string): Promise<PersonaRun | null> {
  const k = id(key);
  const hit = mem.get(k);
  if (hit) return hit;
  const d = await ddbGetStatus(`PERSONA#${k}`, "RUN");
  const raw = d.status === "found" ? String(d.value.json) : await s3Get(`personas/v1/${k}.json`).catch(() => null);
  if (!raw) return null;
  try {
    const run = JSON.parse(raw) as PersonaRun;
    if (!run?.result || !Array.isArray(run.events)) return null;
    mem.set(k, run);
    return run;
  } catch {
    return null;
  }
}

/** Keeps a persona run for good. Only a full LLM-planned live run qualifies, so the demo always shows the best version. */
export async function putPersonaRun(key: string, run: PersonaRun): Promise<void> {
  if (run.result.mode === "mock" || run.result.planner !== "llm") return;
  const json = JSON.stringify(run);
  if (json.length > MAX_BYTES) return;
  const k = id(key);
  mem.set(k, run);
  await Promise.allSettled([ddbPutIfAbsent({ PK: `PERSONA#${k}`, SK: "RUN", json, at: Date.now() }), s3PutIfAbsent(`personas/v1/${k}.json`, json)]);
}
