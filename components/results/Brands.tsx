"use client";

import { useState } from "react";
import { ablationLines, displayName } from "@/lib/card";
import type { BrandMatch, QEntity } from "@/lib/types";
import { Thumb, cleanStyle, type Vote } from "./ui";

/**
 * A brand as a specimen plate: catalogue number, an ink-stamped logo, Qloo's own description, and a small star chart
 * of the loves that pulled it in (line weight = each love's share of the pull). The link is real or labelled:
 * the brand's site from Qloo, else its Instagram handle from Qloo, else a plain web search, said as such.
 * `hero` lays the top match out wide.
 */
export function BrandCard({
  b,
  i,
  seeds,
  vote,
  onVote,
  hero = false,
}: {
  b: BrandMatch;
  i: number;
  seeds: QEntity[];
  vote?: Vote;
  onVote: (id: string, v: Vote | null) => void;
  hero?: boolean;
}) {
  const e = b.entity;
  const style = cleanStyle(e.style).slice(0, 3);
  const aff = Math.round(b.affinity * 100);
  const cuts = ablationLines(b, seeds).slice(0, 3);
  const [open, setOpen] = useState(false);
  const drivers = b.because
    .map((id) => ({ id, s: seeds.find((x) => x.id === id), v: b.explain[id] ?? 0 }))
    .filter((d) => d.s)
    .sort((x, y) => y.v - x.v);
  const lead = drivers[0];
  const share = lead ? Math.round(lead.v * 100) : 0;
  const link = brandLink(e);

  return (
    <article
      className={`rise group relative flex flex-col overflow-hidden rounded-[22px] border p-4 transition duration-300 sm:p-5 ${
        vote === "up"
          ? "border-accent/70 shadow-[0_0_0_1px_rgba(198,255,61,0.25),0_20px_50px_-30px_rgba(198,255,61,0.6)]"
          : vote === "down"
            ? "border-bad/30 saturate-0 [&>*:not(:first-child)]:opacity-40"
            : "border-line hover:border-ink-3/60"
      } ${hero ? "sm:col-span-2 xl:col-span-3" : ""}`}
      style={{
        animationDelay: `${Math.min(i, 10) * 40}ms`,
        // engraved paper: faint rays from the top-left corner over the card colour
        background: "repeating-conic-gradient(from 200deg at 0% 0%, rgb(255 236 200 / .028) 0 .6deg, transparent .6deg 3deg), var(--card)",
      }}
    >
      {/* hairline specimen frame */}
      <span aria-hidden className="pointer-events-none absolute inset-[7px] rounded-[16px] border border-[rgb(233_185_92/0.16)]" />

      <div className="relative flex items-center justify-between gap-3 font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">
        <span>
          No. {String(i + 1).padStart(2, "0")} · {b.category}
          {e.tier ? (
            <span className="ml-2 tracking-normal text-ink-2">
              {"$".repeat(e.tier)}
              <span className="text-ink-3/40">{"$".repeat(3 - e.tier)}</span>
            </span>
          ) : null}
          {b.side ? <span className="ml-2 text-[color:var(--m,#f472b6)]">☽ side B</span> : null}
        </span>
        <span className="flex gap-1.5">
          <VoteBtn on={vote === "up"} tone="up" label={`More like ${e.name}`} onClick={() => onVote(e.id, vote === "up" ? null : "up")} />
          <VoteBtn on={vote === "down"} tone="down" label={`Less like ${e.name}`} onClick={() => onVote(e.id, vote === "down" ? null : "down")} />
        </span>
      </div>

      <div className={`relative mt-4 flex gap-4 ${hero ? "sm:items-center sm:gap-7" : "items-start"}`}>
        <Stamp image={e.image} name={e.name} size={hero ? 92 : 64} />
        <div className="min-w-0 flex-1">
          <h3 className={`font-serif leading-[1] tracking-[-0.01em] ${hero ? "text-[34px] sm:text-[48px]" : "text-[27px]"}`}>{e.name}</h3>
          {e.founded && <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Est. {e.founded}</p>}
          {(e.subtitle || b.why) && (
            <p className={`mt-2 font-serif italic leading-snug text-ink-2 ${hero ? "text-[17px] sm:text-[19px]" : "line-clamp-3 text-[15px]"}`}>{e.subtitle || b.why}</p>
          )}
        </div>
        {hero && lead && <PullChart b={b} drivers={drivers} big />}
      </div>

      {/* the pull: who sent this brand to you */}
      {lead && (
        <div className="relative mt-4 flex items-center gap-3">
          {!hero && <PullChart b={b} drivers={drivers} />}
          <p className="min-w-0 text-[13.5px] leading-snug text-ink-2">
            <b className="font-display text-[22px] font-semibold text-ink tabular-nums">{share}%</b> of the pull from{" "}
            <span className="text-ink">{displayName(lead.s!.name)}</span>
            {drivers[1] && (
              <>
                , {Math.round(drivers[1].v * 100)}% from {displayName(drivers[1].s!.name)}
              </>
            )}
            .
          </p>
        </div>
      )}

      {style.length > 0 && (
        <p className="relative mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          {style.map((st, k) => (
            <span key={st}>
              {k > 0 && <span className="px-1.5 text-ink-3/50">·</span>}
              {st}
            </span>
          ))}
        </p>
      )}

      <div className="min-h-3 flex-1" />

      <div className="relative mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line/70 pt-3.5">
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-paper transition hover:bg-accent"
        >
          {link.label} <span aria-hidden>↗</span>
        </a>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">{link.note}</span>
        <span className="ml-auto flex items-center gap-3">
          <span className="font-mono text-[10.5px] text-ink-3">affinity .{String(aff).padStart(2, "0")}</span>
          {cuts.length > 0 && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3 underline decoration-dotted underline-offset-4 transition hover:text-ink"
            >
              {open ? "receipt −" : "receipt +"}
            </button>
          )}
        </span>
        {open && (
          <ul className="w-full space-y-1 font-mono text-[12px] leading-snug text-ink-2">
            {cuts.map((c) => (
              <li key={c.name}>
                <span className="text-bad">−{c.drop}</span> without {c.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

/** Where a brand card links: only real places. */
function brandLink(e: QEntity): { href: string; label: string; note: string } {
  if (e.site) {
    const host = (() => {
      try {
        return new URL(e.site).hostname.replace(/^www\./, "");
      } catch {
        return "site";
      }
    })();
    return { href: e.site, label: `Visit ${host}`, note: "official site · via Qloo" };
  }
  if (e.instagram) return { href: `https://www.instagram.com/${e.instagram}/`, label: `@${e.instagram}`, note: "instagram · via Qloo" };
  return { href: `https://duckduckgo.com/?q=${encodeURIComponent(e.name)}`, label: `Search ${e.name}`, note: "web search" };
}

/** The logo as an ink stamp on paper, with a perforated edge. */
function Stamp({ image, name, size }: { image?: string; name: string; size: number }) {
  const [bad, setBad] = useState(false);
  return (
    <span className="relative grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size }}>
      <span aria-hidden className="absolute inset-0 rounded-full border border-dashed border-[rgb(233_185_92/0.45)]" />
      <span className="grid place-items-center overflow-hidden rounded-full bg-[#f3f0e8]" style={{ width: size - 8, height: size - 8, padding: size * 0.13 }}>
        {image && !bad ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={`${name} logo`} onError={() => setBad(true)} className="h-full w-full object-contain mix-blend-multiply [filter:grayscale(1)_contrast(1.15)]" loading="lazy" />
        ) : (
          <span className="font-serif text-[1.6em] italic text-[#151418]">{name[0]}</span>
        )}
      </span>
    </span>
  );
}

/** The brand as a star, with lines to the loves that pulled it in; line weight = that love's share. */
function PullChart({ b, drivers, big = false }: { b: BrandMatch; drivers: { id: string; s?: QEntity; v: number }[]; big?: boolean }) {
  const w = big ? 190 : 92;
  const h = big ? 110 : 54;
  const bx = w * 0.82;
  const by = h * 0.5;
  const pts = drivers.slice(0, 3).map((d, k, a) => ({ ...d, x: w * 0.16, y: a.length === 1 ? h / 2 : h * (0.18 + (0.64 * k) / (a.length - 1)) }));
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 overflow-visible" aria-label={`Pulled in by ${drivers.map((d) => d.s?.name).join(", ")}`}>
      {pts.map((p) => (
        <line key={p.id} x1={p.x} y1={p.y} x2={bx} y2={by} stroke="var(--accent)" strokeOpacity={0.35 + p.v * 0.6} strokeWidth={0.6 + p.v * (big ? 4 : 2.6)} strokeLinecap="round" />
      ))}
      {pts.map((p) => (
        <g key={`${p.id}s`}>
          <circle cx={p.x} cy={p.y} r={big ? 13 : 8} fill="var(--paper-2)" stroke="rgb(255 255 255 / .35)" strokeWidth="0.8" />
          <foreignObject x={p.x - (big ? 11 : 6.5)} y={p.y - (big ? 11 : 6.5)} width={big ? 22 : 13} height={big ? 22 : 13}>
            <Thumb src={p.s?.image} name={p.s?.name ?? "?"} size={big ? 22 : 13} />
          </foreignObject>
        </g>
      ))}
      <circle cx={bx} cy={by} r={big ? 5 : 3.4} fill="var(--accent)" />
      <circle cx={bx} cy={by} r={big ? 9 : 6} fill="none" stroke="var(--accent)" strokeOpacity="0.5" strokeWidth="0.8" />
      <path d={`M${bx - (big ? 14 : 9)} ${by}H${bx + (big ? 14 : 9)}M${bx} ${by - (big ? 14 : 9)}V${by + (big ? 14 : 9)}`} stroke="var(--accent)" strokeOpacity="0.45" strokeWidth="0.6" />
      {/* the brand as a star; the loves as the stars that point to it */}
      <title>{b.entity.name}</title>
    </svg>
  );
}

function VoteBtn({ on, tone, label, onClick }: { on: boolean; tone: "up" | "down"; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-full border text-[13px] font-bold transition active:scale-90 ${
        on ? (tone === "up" ? "border-accent bg-accent text-black" : "border-bad bg-bad text-black") : "border-line bg-paper/40 text-ink-2 hover:border-ink-3 hover:text-ink"
      }`}
    >
      {tone === "up" ? "↑" : "↓"}
    </button>
  );
}
