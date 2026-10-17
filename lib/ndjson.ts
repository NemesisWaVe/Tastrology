/**
 * Splits a growing NDJSON buffer into parsed lines plus the unfinished tail. A line that isn't valid JSON (a proxy
 * splicing in an HTML error page, a truncated write) is skipped and counted, never thrown: one bad line must not
 * cost the whole reading.
 */
export function splitNdjson<T = unknown>(buf: string): { items: T[]; rest: string; bad: number } {
  const lines = buf.split("\n");
  const rest = lines.pop() ?? "";
  const items: T[] = [];
  let bad = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      items.push(JSON.parse(line) as T);
    } catch {
      bad++;
    }
  }
  return { items, rest, bad };
}
