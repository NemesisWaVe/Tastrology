"use client";

import { useReducedMotion } from "motion/react";
import { displayName, proxied } from "@/lib/card";
import type { Snap, SnapBrand } from "@/lib/receipt";
import { sfx } from "@/lib/sound";

const img = (u?: string) => (u ? (u.startsWith("/") ? u : proxied(u)) : undefined);

/** Brands decoded on this device, per card: a signal stays decoded, and new ones (fresh weeks) arrive sealed. */
const key = (code: string) => `tastrology:decoded:${code}`;
export function readDecoded(code: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(code)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function writeDecoded(code: string, ids: string[]) {
  try {
    localStorage.setItem(key(code), JSON.stringify(ids.slice(-200)));
  } catch {}
}

/** Fixed star dust, so the panel reads as space without a canvas or an animation loop. */
const DUST = Array.from({ length: 46 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return { x: r(1) * 100, y: r(2) * 100, s: r(3) < 0.15 ? 2 : 1, o: 0.25 + r(4) * 0.55 };
});

/**
 * The brands as a small sky (docs/design/brand-return-ui.md): your loves are the stars of your constellation; tap one
 * and the sky glides to it, with the brands it pulled in orbiting as sealed signals. Tap a signal to decode it: its
 * logo resolves and its row below unlocks. Curiosity first, then the link out.
 */
export function PulledSky({
  loves,
  sel,
  onSel,
  pulled,
  decoded,
  onDecode,
}: {
  loves: Snap["loves"];
  sel: string;
  onSel: (id: string) => void;
  pulled: SnapBrand[];
  decoded: Set<string>;
  onDecode: (b: SnapBrand) => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const n = loves.length;
  // Neighbours sit at most ~36% apart, so with one love centred the next is still in view to travel to.
  const span = Math.min(68, 36 * (n - 1));
  const pts = loves.map((l, i) => ({
    ...l,
    x: n === 1 ? 50 : 50 - span / 2 + (i * span) / (n - 1),
    y: 50 + Math.sin(i * 2.1 + 0.7) * 22,
  }));
  const at = pts.find((p) => p.id === sel) ?? pts[0];
  const left = pulled.filter((b) => !decoded.has(b.id)).length;

  return (
    <div className="relative mt-5 aspect-[5/4] w-full overflow-clip rounded-3xl border border-line/70 sm:aspect-[16/11]" style={{ background: "radial-gradient(120% 90% at 50% 40%, #141026 0%, #08080d 70%)" }}>
      {/* far stars: still */}
      {DUST.map((d, i) => (
        <span key={i} aria-hidden className="absolute rounded-full bg-white" style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.s, height: d.s, opacity: d.o }} />
      ))}
      {/* nebula tint behind the chosen love */}
      <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl" style={{ background: "radial-gradient(circle, rgb(198 255 61 / 0.18), rgb(140 90 255 / 0.12) 45%, transparent 70%)" }} />

      {/* the constellation: glides so the chosen love sits at the centre */}
      <div
        className="absolute inset-0"
        style={{ transform: `translate(${50 - at.x}%, ${50 - at.y}%)`, transition: reduce ? "none" : "transform 900ms cubic-bezier(.2,.7,.2,1)" }}
      >
        <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {pts.slice(1).map((p, i) => (
            <line key={p.id} x1={pts[i].x} y1={pts[i].y} x2={p.x} y2={p.y} stroke="rgb(233 240 255 / .22)" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>

        {pts.map((p, i) => {
          const on = p.id === at.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              aria-label={`${displayName(p.name)}: see what it pulled in`}
              onClick={() => {
                sfx("tick", { i });
                onSel(p.id);
              }}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2 p-3"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              <span
                className={`block rounded-full transition-all duration-500 ${on ? "h-4 w-4 bg-accent" : "h-2.5 w-2.5 bg-[#e9f0ff] hover:scale-125"}`}
                style={on ? { boxShadow: "0 0 0 6px rgb(198 255 61 / .15), 0 0 28px 6px rgb(198 255 61 / .45)" } : { boxShadow: "0 0 10px 2px rgb(233 240 255 / .35)" }}
              />
              <span className={`absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] ${on ? "text-accent" : "text-ink-3"}`}>
                {displayName(p.name).slice(0, 18)}
              </span>
            </button>
          );
        })}

        {/* the chosen love's orbit: its brands as signals, turning slowly */}
        {pulled.length > 0 && (
          <div
            key={at.id}
            className="pointer-events-none absolute aspect-square w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/10 sm:w-[48%]"
            style={{ left: `${at.x}%`, top: `${at.y}%` }}
          >
            <div className={`absolute inset-0 ${reduce ? "" : "animate-[spin_70s_linear_infinite]"}`}>
              {pulled.map((b, i) => {
                const ang = (i / pulled.length) * Math.PI * 2 - Math.PI / 2;
                const open = decoded.has(b.id);
                return (
                  <div
                    key={b.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${50 + Math.cos(ang) * 50}%`, top: `${50 + Math.sin(ang) * 50}%` }}
                  >
                    {/* keep the signal upright while the orbit turns */}
                    <div className={reduce ? "" : "animate-[spin_70s_linear_infinite_reverse]"}>
                      <button
                        type="button"
                        onClick={() => onDecode(b)}
                        aria-label={open ? `${b.name}, decoded` : `Decode signal ${i + 1}`}
                        className="pointer-events-auto relative grid h-12 w-12 place-items-center rounded-full transition-transform duration-300 hover:scale-110 sm:h-14 sm:w-14"
                      >
                        {open ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {b.image ? <img src={img(b.image)} alt="" className="h-full w-full rounded-full border-2 border-accent/70 bg-white object-cover shadow-[0_0_20px_rgba(198,255,61,0.45)]" /> : <span className="grid h-full w-full place-items-center rounded-full border-2 border-accent/70 bg-paper-2 font-display text-lg font-bold">{b.name[0]}</span>}
                            <span className="absolute left-1/2 top-full mt-1 max-w-[110px] -translate-x-1/2 truncate whitespace-nowrap rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-ink">{b.name}</span>
                          </>
                        ) : (
                          <>
                            <span className={`absolute inset-0 rounded-full border border-accent/60 ${reduce ? "" : "animate-ping"}`} style={{ animationDuration: `${2.2 + i * 0.4}s` }} />
                            <span className="grid h-9 w-9 place-items-center rounded-full border border-dashed border-accent/80 bg-black/70 font-mono text-[13px] font-bold text-accent sm:h-10 sm:w-10">?</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <p className="pointer-events-none absolute inset-x-0 top-3 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3">
        {pulled.length === 0 ? "Quiet star. Try another." : left ? `${left} signal${left === 1 ? "" : "s"} from ${displayName(at.name)} · tap to decode` : `All decoded · ${displayName(at.name)}`}
      </p>
    </div>
  );
}
