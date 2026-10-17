import type { CardData } from "./card";

/** How taste moved between two of your cards: which loves stayed, left and arrived, and which signs changed. */
export interface TasteMove {
  kept: string[];
  dropped: string[];
  added: string[];
  signs: { slot: "Sun" | "Moon" | "Rising"; from: string; to: string }[];
}

const key = (s: string) => s.trim().toLowerCase();

export function tasteMove(before: CardData, after: CardData): TasteMove {
  const a = new Map(before.evolvesFrom.map((x) => [key(x.name), x.name]));
  const b = new Map(after.evolvesFrom.map((x) => [key(x.name), x.name]));
  const signs: TasteMove["signs"] = [];
  for (const [slot, k] of [["Sun", "sun"], ["Moon", "moon"], ["Rising", "rising"]] as const) {
    const from = before.bigThree[k].name;
    const to = after.bigThree[k].name;
    if (key(from) !== key(to)) signs.push({ slot, from, to });
  }
  return {
    kept: [...b.keys()].filter((k) => a.has(k)).map((k) => b.get(k)!),
    dropped: [...a.keys()].filter((k) => !b.has(k)).map((k) => a.get(k)!),
    added: [...b.keys()].filter((k) => !a.has(k)).map((k) => b.get(k)!),
    signs,
  };
}

const list = (xs: string[], max = 3) => (xs.length > max ? `${xs.slice(0, max).join(", ")} and ${xs.length - max} more` : xs.join(", "));

/** One plain sentence for the timeline. */
export function moveLine(m: TasteMove): string {
  if (!m.dropped.length && !m.added.length && !m.signs.length) return "Same loves, same signs. Your taste held still.";
  const parts: string[] = [];
  if (m.kept.length) parts.push(`Kept ${list(m.kept)}.`);
  if (m.dropped.length) parts.push(`Dropped ${list(m.dropped)}.`);
  if (m.added.length) parts.push(`New: ${list(m.added)}.`);
  for (const s of m.signs) parts.push(`${s.slot} moved from ${s.from} to ${s.to}.`);
  return parts.join(" ");
}
