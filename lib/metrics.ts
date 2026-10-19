import { upstash, upstashConfigured } from "./cache";

export const FUNNEL_EVENTS = ["landed", "started", "minted", "shared", "scanned", "scan_minted", "friend_added"] as const;
export type FunnelEvent = typeof FUNNEL_EVENTS[number];
export const CLIENT_EVENTS: readonly string[] = ["landed", "shared", "scanned", "scan_minted"];
export const dayKey = (date = new Date()) => `tm:funnel:${date.toISOString().slice(0, 10)}`;

export async function countEvent(event: FunnelEvent) {
  await upstash([["HINCRBY", dayKey(), event, 1], ["EXPIRE", dayKey(), 45 * 86400]]);
}

export async function funnelCounts() {
  if (!upstashConfigured()) return { available: false, days: [] };
  const dates = Array.from({ length: 14 }, (_, index) => new Date(Date.now() - index * 86400000));
  const response = await upstash(dates.map((date) => ["HGETALL", dayKey(date)]));
  if (!response) return { available: false, days: [] };
  return { available: true, days: dates.map((date, index) => {
    const values = response[index];
    const counts = Object.fromEntries(FUNNEL_EVENTS.map((event) => [event, 0]));
    if (Array.isArray(values)) for (let cursor = 0; cursor + 1 < values.length; cursor += 2) {
      if (FUNNEL_EVENTS.includes(values[cursor])) counts[values[cursor]] = Math.max(0, Number(values[cursor + 1]) || 0);
    }
    return { date: date.toISOString().slice(0, 10), ...counts };
  }) };
}
