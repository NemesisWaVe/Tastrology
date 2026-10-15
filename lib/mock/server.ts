/**
 * Answers Qloo-shaped GET requests from the synthetic graph, so mock and live
 * mode share one normalization path in lib/qloo.ts.
 */
import { ALL, AXES, BY_ID, cos, tagId, topAxes, type Axis, type MockEntity, type Vec } from "./graph";

const urnKind = (urn: string) => urn.replace("urn:entity:", "").replace("video_game", "videogame");

function rawEntity(m: MockEntity, extra?: object) {
  return {
    entity_id: m.id,
    name: m.name,
    type: "urn:entity",
    subtype: `urn:entity:${m.kind}`,
    popularity: m.pop,
    properties: { short_description: m.subtitle, mock_tier: m.tier, mock_category: m.category },
    tags: topAxes(m.vec, 4).map((a) => ({ id: tagId(a), name: AXES.find((x) => x[0] === a)![1], type: "urn:tag:style:mock" })),
    ...extra,
  };
}

const axisFromTag = (t: string) => t.replace("urn:tag:style:mock:", "") as Axis;

function signals(params: URLSearchParams): { id: string; vec: Vec }[] {
  const out: { id: string; vec: Vec }[] = [];
  for (const id of (params.get("signal.interests.entities") ?? "").split(",").filter(Boolean)) {
    const m = BY_ID.get(id);
    if (m) out.push({ id, vec: m.vec });
  }
  for (const t of (params.get("signal.interests.tags") ?? "").split(",").filter(Boolean)) {
    out.push({ id: t, vec: { [axisFromTag(t)]: 1 } });
  }
  return out;
}

export function mockQloo(path: string, params: URLSearchParams): unknown {
  const take = Math.min(Number(params.get("take") ?? 20), 50);

  if (path === "/search") {
    const q = (params.get("query") ?? "").toLowerCase().trim();
    const types = (params.get("types") ?? "").split(",").filter(Boolean).map(urnKind);
    const results = ALL.filter((m) => (!types.length || types.includes(m.kind)) && m.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) || b.pop - a.pop)
      .slice(0, take)
      .map((m) => rawEntity(m));
    return { success: true, results };
  }

  if (path === "/v2/tags") {
    const q = (params.get("filter.query") ?? "").toLowerCase();
    const tags = AXES.filter(([, name]) => name.toLowerCase().includes(q)).map(([a, name]) => ({ id: tagId(a), name, type: "urn:tag:style:mock" }));
    return { success: true, results: { tags: tags.slice(0, take) } };
  }

  if (path === "/v2/insights") {
    const type = params.get("filter.type") ?? "";
    const sigs = signals(params);
    if (!sigs.length) return { success: false, error: "at least one valid signal or filter is required" };

    if (type === "urn:tag") {
      const score: Partial<Record<Axis, number>> = {};
      for (const s of sigs) for (const [a, w] of Object.entries(s.vec)) score[a as Axis] = (score[a as Axis] ?? 0) + (w ?? 0);
      const max = Math.max(...Object.values(score).map(Number));
      const tags = (Object.entries(score) as [Axis, number][])
        .sort((x, y) => y[1] - x[1])
        .slice(0, take)
        .map(([a, s]) => ({ id: tagId(a), name: AXES.find((x) => x[0] === a)![1], type: "urn:tag:style:mock", query: { affinity: +(0.55 + 0.44 * (s / max)).toFixed(3) } }));
      return { success: true, results: { tags } };
    }

    const kind = urnKind(type);
    const exclude = new Set((params.get("filter.exclude.entities") ?? "").split(",").filter(Boolean));
    const sigIds = new Set(sigs.map((s) => s.id));
    const filterTags = (params.get("filter.tags") ?? "").split(",").filter(Boolean).map(axisFromTag);
    const explain = params.get("feature.explainability") === "true";

    const scored = ALL.filter((m) => m.kind === kind && !exclude.has(m.id) && !sigIds.has(m.id))
      .filter((m) => !filterTags.length || filterTags.some((a) => (m.vec[a] ?? 0) >= 0.3))
      .map((m) => {
        const contrib = sigs.map((s) => ({ id: s.id, c: -Math.log(1 - 0.62 * Math.max(0, cos(s.vec, m.vec))) }));
        const total = contrib.reduce((t, x) => t + x.c, 0);
        const affinity = (1 - Math.exp(-total)) * 0.94 + 0.05 * m.pop;
        const ex = contrib
          .filter((x) => total > 0 && x.c / total >= 0.04)
          .map((x) => ({ entity_id: x.id, score: +(x.c / total).toFixed(3) }))
          .sort((a, b) => b.score - a.score);
        return { m, affinity, ex };
      })
      .sort((a, b) => b.affinity - a.affinity)
      .slice(0, take);

    return {
      success: true,
      results: {
        entities: scored.map(({ m, affinity, ex }) =>
          rawEntity(m, { query: { affinity: +affinity.toFixed(4), ...(explain ? { explainability: { "signal.interests.entities": ex } } : {}) } }),
        ),
      },
    };
  }

  return { success: false, error: `No path matching ${path}` };
}
