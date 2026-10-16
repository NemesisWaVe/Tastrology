// Pre-warms the result + Qloo caches by running every demo persona once.
// Usage: node scripts/warm.mjs [BASE_URL]   (default http://localhost:3000; Node 22.18+ for .ts imports)
// Sends exactly what the UI sends for a persona, so the cache keys match.
import { PERSONAS, personaRequest } from "../lib/personas.ts";

const BASE = (process.argv[2] || process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

for (const p of PERSONAS) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/api/agent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(personaRequest(p)),
    });
    if (!res.ok) {
      console.log(`${p.key}: HTTP ${res.status} ${await res.text()}`);
      continue;
    }
    // Read the whole stream: closing early would cancel the run.
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    const r = lines.find((l) => l.type === "result")?.result;
    const err = lines.find((l) => l.type === "error")?.message;
    console.log(
      r
        ? `${p.key}: ${r.cached ? "already cached" : "warmed"} · planner=${r.planner} · ${r.brands.length} brands · ${r.stats.qlooCalls} Qloo calls · ${Date.now() - t0}ms`
        : `${p.key}: failed (${err ?? "no result"})`,
    );
  } catch (e) {
    console.log(`${p.key}: ${e.message}`);
  }
}
