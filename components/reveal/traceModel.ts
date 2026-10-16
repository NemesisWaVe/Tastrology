import { proxied } from "@/lib/card";
import type { QlooCallLog, StyleResult, TraceEvent } from "@/lib/types";

/**
 * Turns the raw agent trace into what the "reading your taste" scene draws. Everything here is
 * read off real events (labels, Qloo call params, summaries): nothing is invented for show.
 */

export interface SeedHint {
  name: string;
  kind?: string;
  image?: string;
}

export interface SeedNode {
  name: string;
  kind?: string;
  id?: string;
  image?: string;
  /** Qloo has read this seed's aesthetic (its per-seed tag call has come back). */
  read: boolean;
  /** Split off into Side B by the self-critique. */
  odd: boolean;
}

export type ToolEvent = Extract<TraceEvent, { type: "tool" }>;

export type FeedRow =
  | { kind: "step"; key: string; id: string; label: string; status: "run" | "done" | "warn"; detail?: string }
  | { kind: "thought"; key: string; text: string }
  | { kind: "tool"; key: string; e: ToolEvent };

export interface Word {
  text: string;
  tone: "tag" | "brand" | "side" | "bridge";
  sub?: string;
}

export interface SceneModel {
  seeds: SeedNode[];
  rows: FeedRow[];
  calls: number;
  cached: number;
  /** Current headline: the latest step label. */
  headline: string;
  status: "run" | "done" | "warn";
  /** The most recent tool event, drives which seeds light up. */
  active?: ToolEvent;
  words: Word[];
  split: boolean;
  planner: boolean;
}

const entityIds = (c: QlooCallLog) => (c.params["signal.interests.entities"] ?? "").split(",").filter(Boolean);
const kindOf = (t?: string) => t?.replace("urn:entity:", "");
const qlooImage = (id: string) => proxied(`https://images.qloo.com/i/${id}-420x-auto.jpg`);

export function buildScene(events: TraceEvent[], hints?: SeedHint[]): SceneModel {
  const rows: FeedRow[] = [];
  let calls = 0;
  let cached = 0;
  let headline = "Waking up the agent";
  let status: SceneModel["status"] = "run";
  let active: ToolEvent | undefined;
  let split = false;
  let planner = false;
  let names: { name: string; kind?: string }[] = hints?.map((h) => ({ name: h.name, kind: h.kind })) ?? [];
  let ids: string[] = [];
  const oddIds = new Set<string>();
  let oddName: string | undefined;
  const words: Word[] = [];
  const addWords = (list: string[], tone: Word["tone"]) => {
    for (const raw of list) {
      const m = raw.trim().match(/^(.*?)(?:\s+(0?\.\d+))?(?:\s+\((\w+)\))?$/);
      const text = (m?.[1] ?? raw).trim();
      if (text && !words.some((w) => w.text === text)) words.push({ text, tone, sub: m?.[2] ?? m?.[3] });
    }
  };

  events.forEach((e, i) => {
    if (e.type === "step") {
      headline = e.label;
      status = e.status;
      const at = rows.findIndex((r) => r.kind === "step" && r.id === e.id);
      const row: FeedRow = { kind: "step", key: at >= 0 ? rows[at].key : `s${i}`, id: e.id, label: e.label, status: e.status, detail: e.detail };
      if (at >= 0) rows[at] = row;
      else rows.push(row);
      const n = e.label.match(/Resolving (\d+) taste seeds/);
      if (n && !names.length) names = Array.from({ length: Number(n[1]) }, () => ({ name: "" }));
      if (e.id === "resolve" && e.status === "done" && e.detail) {
        const resolved = e.detail.split(" · ");
        if (resolved.length === names.length || !names.length) names = resolved.map((name, k) => ({ name, kind: names[k]?.kind }));
      }
      if (e.id === "tags" && e.status === "warn") split = true;
      const side = e.id === "sideb" && e.label.match(/for your (.+) side/);
      if (side) oddName = side[1];
      if (e.id === "plan") planner = true;
    } else if (e.type === "thought") {
      rows.push({ kind: "thought", key: `t${i}`, text: e.text });
      if (e.text.startsWith("Planner")) planner = true;
    } else if (e.type === "tool") {
      rows.push({ kind: "tool", key: `x${i}`, e });
      active = e;
      calls += e.calls.length;
      cached += e.calls.filter((c) => c.cached).length;
      if (e.name === "search_entities") {
        const fromCalls = e.calls.map((c) => ({ name: c.params.query ?? "", kind: kindOf(c.params.types) }));
        if (!hints?.length && fromCalls.length) names = fromCalls;
        else names = names.map((n, k) => ({ ...n, kind: n.kind ?? fromCalls[k]?.kind }));
      }
      if (e.name === "get_tags") {
        const per = e.calls.map((c) => entityIds(c)).filter((x) => x.length === 1).map((x) => x[0]);
        if (per.length) ids = per;
        const cons = e.summary.match(/^Consensus:\s*(.+)$/);
        if (cons) addWords(cons[1].split(","), "tag");
      }
      if (e.name === "get_insights") {
        if (/side B/i.test(e.args)) {
          for (const c of e.calls) entityIds(c).forEach((id) => oddIds.add(id));
          addWords(e.summary.split(","), "side");
        } else if (/place|movie|artist|book/.test(e.args) && !/^brand/.test(e.args)) {
          addWords(e.summary.split(","), "bridge");
        } else {
          const top = e.summary.match(/top:\s*(.+)$/);
          if (top) addWords(top[1].split(","), "brand");
        }
      }
    }
  });

  const seeds: SeedNode[] = names.map((n, k) => {
    const id = ids.length === names.length ? ids[k] : undefined;
    // By name first: once a seed drops out, positions no longer line up with the hints.
    const hint = hints?.find((h) => h.name.toLowerCase() === n.name.toLowerCase()) ?? (hints?.length === names.length ? hints[k] : undefined);
    return {
      name: n.name,
      kind: n.kind ?? hint?.kind,
      id,
      image: hint?.image ? proxied(hint.image) : id ? qlooImage(id) : undefined,
      read: Boolean(id),
      odd: Boolean((id && oddIds.has(id)) || (oddName && oddName.includes(n.name) && n.name)),
    };
  });

  return { seeds, rows, calls, cached, headline, status, active, words, split, planner };
}

/** "tag overlap 1% vs 10% among the rest" from the critique, when the agent wrote it. */
export function overlapFigures(r: StyleResult): { odd: number; rest?: number } | null {
  for (const c of r.critique) {
    const m = c.match(/tag overlap (\d+)% vs (\d+)%/);
    if (m) return { odd: Number(m[1]), rest: Number(m[2]) };
  }
  const c = r.contradictions[0];
  return c ? { odd: Math.round(c.overlap * 100) } : null;
}

export const KIND_LABEL: Record<string, string> = {
  artist: "Artist",
  movie: "Film",
  tv_show: "Series",
  book: "Book",
  place: "Place",
  podcast: "Podcast",
  videogame: "Game",
};
