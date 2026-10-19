"use client";

import { useEffect, useState } from "react";

export function TasteCensus({ score }: { score: number }) {
  const [data, setData] = useState<{ histogram: number[] | null; total: number; signs: { name: string; count: number }[] } | null>(null);
  useEffect(() => { void fetch("/api/stats").then((response) => response.ok ? response.json() : null).then(setData).catch(() => {}); }, []);
  if (!data || (!data.histogram && !data.signs.length)) return null;
  const below = data.histogram?.slice(0, Math.max(0, Math.min(101, Math.round(score)))).reduce((sum, count) => sum + count, 0);
  return <aside className="mt-6 space-y-2 border-l border-accent/40 pl-4 text-sm text-ink-2" aria-label="Community taste statistics">
    {below !== undefined && <p>Your taste mix scores more unusual than {Math.floor(below / data.total * 100)}% of {data.total} recorded cards. This compares taste scores, not foil odds.</p>}
    {data.signs.length > 0 && <p>This week&apos;s most-pulled Sun signs: {data.signs.map((sign) => `${sign.name} (${sign.count})`).join(" · ")}.</p>}
  </aside>;
}
