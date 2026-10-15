"use client";

import { useEffect, useRef, useState } from "react";
import type { EntityKind } from "@/lib/types";

export interface Seed {
  id: string;
  name: string;
  kind: EntityKind;
  subtitle?: string;
}

export const KIND_LABEL: Record<string, string> = {
  artist: "Artist",
  movie: "Film",
  tv_show: "TV",
  book: "Book",
  place: "Place",
  podcast: "Podcast",
  videogame: "Game",
  brand: "Brand",
};

export const KIND_ICON: Record<string, string> = {
  artist: "♪",
  movie: "◐",
  tv_show: "▭",
  book: "❡",
  place: "⌖",
  podcast: "◉",
  videogame: "✦",
  brand: "◆",
};

const FILTERS: (EntityKind | "all")[] = ["all", "artist", "movie", "tv_show", "book", "place", "podcast", "videogame"];

export function SeedPicker({ seeds, onChange }: { seeds: Seed[]; onChange: (s: Seed[]) => void }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<EntityKind | "all">("all");
  const [hits, setHits] = useState<Seed[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const req = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const id = ++req.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}${kind !== "all" ? `&types=${kind}` : ""}`);
        const data = (await res.json()) as { results: Seed[] };
        if (id === req.current) {
          setHits(data.results ?? []);
          setActive(0);
        }
      } finally {
        if (id === req.current) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q, kind]);

  const add = (s: Seed) => {
    if (seeds.length >= 8 || seeds.some((x) => x.id === s.id)) return;
    onChange([...seeds, s]);
    setQ("");
    setHits([]);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3" role="tablist" aria-label="Filter by type">
        {FILTERS.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`text-xs px-2.5 py-1 rounded-full border transition ${kind === k ? "bg-ink text-paper border-ink" : "border-line text-ink-2 hover:border-ink-3"}`}
          >
            {k === "all" ? "Anything" : KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="relative">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, hits.length - 1));
            if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
            if (e.key === "Enter" && hits[active]) add(hits[active]);
          }}
          placeholder={seeds.length >= 8 ? "That's plenty: 8 max" : "Search an artist, film, book, place, game…"}
          disabled={seeds.length >= 8}
          className="w-full rounded-xl border border-line bg-card px-4 py-3.5 text-[15px] outline-none focus:border-ink placeholder:text-ink-3"
          aria-label="Search Qloo for something you love"
          role="combobox"
          aria-controls="seed-results"
          aria-expanded={open && hits.length > 0}
        />
        {loading && <span className="absolute right-4 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-accent pulse-dot" />}
        {open && hits.length > 0 && (
          <ul className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-line bg-card shadow-lg" role="listbox" id="seed-results">
            {hits.map((h, i) => (
              <li key={h.id}>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(h)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${i === active ? "bg-paper-2" : ""}`}
                >
                  <span className="w-5 text-center text-ink-3">{KIND_ICON[h.kind]}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm font-medium">{h.name}</span>
                    {h.subtitle && <span className="block truncate text-xs text-ink-3">{h.subtitle}</span>}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-ink-3">{KIND_LABEL[h.kind]}</span>
                </button>
              </li>
            ))}
            <li className="border-t border-line px-4 py-1.5 text-[10px] uppercase tracking-wider text-ink-3">Results from Qloo search</li>
          </ul>
        )}
      </div>

      <div className="mt-3 flex min-h-9 flex-wrap gap-2">
        {seeds.map((s) => (
          <span key={s.id} className="rise inline-flex items-center gap-1.5 rounded-full bg-ink py-1.5 pl-3 pr-1.5 text-sm text-paper">
            <span className="opacity-60">{KIND_ICON[s.kind]}</span>
            {s.name}
            <button
              onClick={() => onChange(seeds.filter((x) => x.id !== s.id))}
              className="ml-0.5 grid h-5 w-5 place-items-center rounded-full text-paper/70 hover:bg-paper/15 hover:text-paper"
              aria-label={`Remove ${s.name}`}
            >
              ×
            </button>
          </span>
        ))}
        {seeds.length === 0 && <span className="py-1.5 text-sm text-ink-3">Add 3 to 8 things you love. Mix types for a sharper read.</span>}
      </div>
    </div>
  );
}
