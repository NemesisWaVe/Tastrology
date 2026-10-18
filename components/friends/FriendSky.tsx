"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScratchReveal } from "@/components/deck/ScratchReveal";
import { levelOf } from "@/lib/friendLevels";
import type { Friend, Player } from "@/lib/friends";
import s from "./sky.module.css";

/**
 * "Your sky": you are the star in the middle, every friend a star bound to you by a filament of light. Closer orbits
 * and brighter colours mean more days fought. Requests either way are nebulae still forming, and a friend you haven't
 * seen arrive yet is born on screen once (the cloud collapses, flashes, ignites, and the bond draws in).
 * Hold a star (or hover it) and their line whispers next to it; tap it and the sky flies in to them, with their line
 * sealed under foil until you scratch it.
 */

const TINT: Record<string, string> = {
  New: "#b9b5ad",
  Good: "#83fff7",
  Great: "#7894ff",
  Ultra: "#d875ff",
  Best: "#c6ff3d",
};
const ORBIT: Record<string, number> = {
  Best: 0.4,
  Ultra: 0.56,
  Great: 0.7,
  Good: 0.84,
  New: 0.92,
};
const SIZE: Record<string, number> = {
  New: 3.4,
  Good: 4,
  Great: 4.8,
  Ultra: 5.6,
  Best: 6.6,
};

/** A small stable hash, so every star keeps its place between visits. */
function hash(t: string) {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (pc: string) => (typeof window === "undefined" ? "" : `tastrology:sky:${pc}`);
function readSeen(key: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

type Body = {
  pc: string;
  label: string;
  kind: "friend" | "in" | "out";
  level: string;
  days: number;
  tag?: string;
  seen?: number;
  fighter?: string;
};

const HOLD_MS = 380;
const ONLINE_MS = 150_000;
/** Lines you've already scratched open, per friend: a new bio arrives sealed again. */
const readKey = (pc: string) => `tastrology:sky:read:${pc}`;
function wasRead(pc: string, tag: string): boolean {
  try {
    return localStorage.getItem(readKey(pc)) === tag;
  } catch {
    return false;
  }
}
function ago(t?: number): string {
  if (!t) return "";
  const d = Date.now() - t;
  if (d < ONLINE_MS) return "Online";
  const m = Math.round(d / 60000);
  return m < 60 ? `Seen ${m}m ago` : m < 1440 ? `Seen ${Math.round(m / 60)}h ago` : `Seen ${Math.round(m / 1440)}d ago`;
}

export function FriendSky({
  me,
  friends,
  incoming,
  sent,
  fighting,
  onPick,
}: {
  me: Player;
  friends: Friend[];
  incoming: Friend[];
  sent: Friend[];
  /** Friends with an open challenge either way: their bond burns. */
  fighting: Set<string>;
  onPick: (pc: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 400 });
  const reduce = useReducedMotion() ?? false;
  // Zoomed in on one friend, and the star being held (its line whispers beside it).
  const [focus, setFocus] = useState<string | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [read, setRead] = useState(false);
  const holdT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const heldFired = useRef(false);
  useEffect(() => {
    if (!focus) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setFocus(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [focus]);
  // Stars appear only once the browser has measured the sky (and read which friends it has already seen born).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setMounted(true);
    const ro = new ResizeObserver(([e]) =>
      setSize({
        w: Math.round(e.contentRect.width),
        h: Math.round(e.contentRect.height),
      }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Births: friends this browser hasn't seen ignite yet. Decided during render so the star never shows up first.
  const key = at(me.pc);
  const seen = useRef<Set<string> | null>(null);
  const born = useRef(new Map<string, number>());
  if (mounted) {
    if (seen.current === null) seen.current = readSeen(key) ?? new Set();
    let batch = 0;
    for (const f of friends) {
      if (seen.current.has(f.pc)) continue;
      seen.current.add(f.pc);
      born.current.set(f.pc, 0.35 + Math.min(batch++, 6) * 0.45);
    }
  }
  const friendKey = friends.map((f) => f.pc).join(",");
  useEffect(() => {
    if (!seen.current) return;
    try {
      localStorage.setItem(key, JSON.stringify([...seen.current]));
    } catch {}
  }, [key, friendKey, mounted]);

  const { w, h } = size;
  // Phones: wider orbits, a little more room under the stars for labels, fewer labels.
  const compact = w < 520;
  const cx = w / 2;
  const cy = h / 2 + (compact ? 8 : 0);

  const dust = useMemo(() => {
    const r = rng(hash(me.pc));
    return Array.from({ length: Math.round((w * h) / 5200) }, () => ({
      x: r() * w,
      y: r() * h,
      r: r() < 0.9 ? 0.6 + r() * 0.6 : 1.3 + r() * 0.5,
      t: 3 + r() * 5,
      d: -r() * 6,
    }));
  }, [me.pc, w, h]);

  const bodies: Body[] = [
    ...friends.map((f) => ({
      pc: f.pc,
      label: f.user ? `@${f.user}` : f.name || f.pc,
      kind: "friend" as const,
      level: levelOf(f.days ?? 0),
      days: f.days ?? 0,
      tag: f.tag,
      seen: f.seen,
      fighter: f.name,
    })),
    ...incoming.map((f) => ({
      pc: f.pc,
      label: f.user ? `@${f.user}` : f.name || f.pc,
      kind: "in" as const,
      level: "New",
      days: 0,
    })),
    ...sent
      .filter((f) => !friends.some((x) => x.pc === f.pc))
      .map((f) => ({
        pc: f.pc,
        label: f.user ? `@${f.user}` : f.name || f.pc,
        kind: "out" as const,
        level: "New",
        days: 0,
      })),
  ].sort((a, b) => hash(a.pc) - hash(b.pc));

  const n = Math.max(bodies.length, 1);
  const rx = Math.max(60, w / 2 - (compact ? 42 : 74));
  const ry = Math.max(60, h / 2 - (compact ? 66 : 52));
  const placed = (mounted ? bodies : []).map((b, i) => {
    const jitter = ((hash(b.pc) % 1000) / 1000 - 0.5) * (Math.PI / n) * 0.7;
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2 + jitter + 0.35;
    const f = b.kind === "friend" ? ORBIT[b.level] : 1;
    const x = cx + Math.cos(a) * rx * f;
    const y = cy + Math.sin(a) * ry * f;
    // The bond bows a little to one side, so the sky reads as drawn rather than plotted.
    const bend = (((hash(b.pc) >> 8) % 100) / 100 - 0.5) * 0.5;
    const mx = (cx + x) / 2 - (y - cy) * bend;
    const my = (cy + y) / 2 + (x - cx) * bend;
    return { ...b, x, y, path: `M${cx},${cy} Q${mx},${my} ${x},${y}` };
  });
  const labels = bodies.length <= (compact ? 9 : 14);
  const fs = compact ? 9.5 : 10.5;
  const stars = friends.length;
  const forming = incoming.length + bodies.filter((b) => b.kind === "out").length;

  // The fly-in: the focused star moves to the upper middle and everything scales up around it.
  const target = placed.find((b) => b.pc === focus && b.kind === "friend");
  const k = compact ? 2.1 : 2.5;
  const zoom = target
    ? { transform: `translate(${w / 2 - target.x * k}px, ${h * (compact ? 0.24 : 0.27) - target.y * k}px) scale(${k})` }
    : { transform: "translate(0px, 0px) scale(1)" };
  const open = (pc: string) => {
    const b = placed.find((x) => x.pc === pc);
    setHeld(null);
    setFocus(pc);
    setRead(b?.tag ? wasRead(pc, b.tag) : true);
  };
  const press = (pc: string, pointer: string) => {
    heldFired.current = false;
    clearTimeout(holdT.current);
    if (focus) return;
    if (pointer === "mouse") return setHeld(pc);
    holdT.current = setTimeout(() => {
      heldFired.current = true;
      setHeld(pc);
    }, HOLD_MS);
  };
  const release = (pointer: string) => {
    clearTimeout(holdT.current);
    if (pointer !== "mouse" && heldFired.current) setTimeout(() => setHeld(null), 1600);
  };
  const whisper = !focus && held ? placed.find((b) => b.pc === held) : undefined;

  return (
    <div ref={box} className={s.sky} style={target ? { height: compact ? 540 : 480 } : undefined} onClick={(e) => e.target === e.currentTarget && setFocus(null)}>
      <svg className={s.svg} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Your sky: ${stars} friend${stars === 1 ? "" : "s"}, ${forming} forming`}>
        <defs>
          <radialGradient id="sky-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="35%" stopColor="#efffc4" />
            <stop offset="100%" stopColor="#c6ff3d" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sky-corona" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#c6ff3d" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#c6ff3d" stopOpacity="0" />
          </radialGradient>
          {Object.entries(TINT).map(([k, c]) => (
            <radialGradient key={k} id={`sky-halo-${k}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={c} stopOpacity="0.75" />
              <stop offset="100%" stopColor={c} stopOpacity="0" />
            </radialGradient>
          ))}
          <radialGradient id="sky-neb-in" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#c6ff3d" stopOpacity="0.5" />
            <stop offset="55%" stopColor="#83fff7" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#83fff7" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sky-neb-out" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#d875ff" stopOpacity="0.45" />
            <stop offset="55%" stopColor="#7894ff" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#7894ff" stopOpacity="0" />
          </radialGradient>
          <filter id="sky-soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {dust.map((d, i) => (
          <circle
            key={i}
            className={s.dust}
            cx={d.x}
            cy={d.y}
            r={d.r}
            fill="#f3f1ec"
            style={{
              ["--t" as string]: `${d.t}s`,
              ["--d" as string]: `${d.d}s`,
            }}
          />
        ))}

        <g
          style={{ ...zoom, transformOrigin: "0 0", transition: reduce ? "none" : "transform 0.9s cubic-bezier(0.2, 0.8, 0.2, 1)" }}
          onClick={(e) => {
            if (focus && !(e.target as Element).closest("[data-star]")) setFocus(null);
          }}
        >
        {/* Faint orbit rings, one per friendship level. */}
        {(["Best", "Ultra", "Great", "Good"] as const).map((k) => (
          <ellipse key={k} cx={cx} cy={cy} rx={rx * ORBIT[k]} ry={ry * ORBIT[k]} fill="none" stroke={TINT[k]} strokeOpacity="0.06" strokeDasharray="1 6" />
        ))}

        {placed.map((b) => {
          const birth = born.current.get(b.pc);
          const tint = TINT[b.level];
          if (b.kind !== "friend") {
            const neb = b.kind === "in" ? "url(#sky-neb-in)" : "url(#sky-neb-out)";
            return (
              <g
                key={b.pc}
                className={s.star}
                tabIndex={0}
                role="button"
                aria-label={`${b.label}, ${b.kind === "in" ? "wants to be friends" : "request sent"}`}
                onClick={() => onPick(b.pc)}
                onKeyDown={(e) => e.key === "Enter" && onPick(b.pc)}
              >
                <path d={b.path} fill="none" stroke={b.kind === "in" ? "#c6ff3d" : "#d875ff"} strokeOpacity="0.28" strokeWidth="1" className={s.tether} />
                <g className={s.nebula} style={{ animationDelay: `${-(hash(b.pc) % 9)}s` }}>
                  <ellipse cx={b.x} cy={b.y} rx="26" ry="15" fill={neb} />
                  <ellipse cx={b.x + 5} cy={b.y - 3} rx="13" ry="20" fill={neb} opacity="0.7" />
                </g>
                <circle cx={b.x} cy={b.y} r="1.6" fill="#fff" opacity="0.8" />
                {labels && (
                  <text
                    x={b.x}
                    y={b.y + 30}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize={fs - 0.5}
                    letterSpacing="1.1"
                    fill={b.kind === "in" ? "#c6ff3d" : "#b9b5ad"}
                  >
                    {b.kind === "in" ? `${b.label} wants in` : `${b.label} · forming`}
                  </text>
                )}
              </g>
            );
          }
          const r = SIZE[b.level];
          const hot = fighting.has(b.pc);
          const delay = birth !== undefined ? { animationDelay: `${birth}s` } : undefined;
          const after = (x: number) => (birth !== undefined ? { animationDelay: `${birth + x}s` } : undefined);
          return (
            <g
              key={b.pc}
              data-star
              className={s.star}
              tabIndex={0}
              role="button"
              aria-label={`${b.label}, ${b.level === "New" ? "new" : b.level} friend${b.tag ? `: ${b.tag}` : ""}`}
              style={{ opacity: focus && focus !== b.pc ? 0.22 : 1, transition: "opacity 0.6s" }}
              onPointerDown={(e) => press(b.pc, e.pointerType)}
              onPointerUp={(e) => release(e.pointerType)}
              onPointerEnter={(e) => e.pointerType === "mouse" && !focus && setHeld(b.pc)}
              onPointerLeave={(e) => {
                clearTimeout(holdT.current);
                if (e.pointerType === "mouse") setHeld(null);
              }}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => {
                // A hold shows the line; only a plain tap flies in.
                if (heldFired.current) return void (heldFired.current = false);
                if (focus === b.pc) return setFocus(null);
                open(b.pc);
              }}
              onKeyDown={(e) => e.key === "Enter" && open(b.pc)}
            >
              <path
                d={b.path}
                fill="none"
                stroke={tint}
                strokeOpacity={0.18 + Math.min(b.days, 90) / 200}
                strokeWidth={0.8 + Math.min(b.days, 30) / 20}
                pathLength={1}
                className={birth !== undefined ? s.birthBond : undefined}
                style={after(1.25)}
              />
              <g className={birth !== undefined ? s.birthLabel : undefined} style={after(2)}>
                <path
                  d={b.path}
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity="0.55"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                  className={s.flow}
                  style={{ animationDelay: `${-(hash(b.pc) % 30) / 10}s` }}
                />
              </g>
              {hot && (
                <>
                  <path d={b.path} fill="none" stroke="#c6ff3d" strokeWidth="2" className={s.hot} />
                  <circle r="2.6" fill="#c6ff3d" filter="url(#sky-soft)">
                    <animateMotion dur="1.6s" repeatCount="indefinite" path={b.path} />
                  </circle>
                </>
              )}
              {birth !== undefined && (
                <>
                  <g className={s.birthCloud} style={delay}>
                    <ellipse cx={b.x} cy={b.y} rx="22" ry="12" fill="url(#sky-neb-out)" />
                    <ellipse cx={b.x} cy={b.y} rx="10" ry="18" fill="url(#sky-neb-in)" />
                  </g>
                  <circle cx={b.x} cy={b.y} r="8" fill="none" stroke="#ffffff" strokeWidth="1.5" className={s.birthFlash} style={after(0.85)} />
                </>
              )}
              <g className={birth !== undefined ? s.birthStar : undefined} style={after(0.9)}>
                <circle className={s.halo} cx={b.x} cy={b.y} r={r * 4.2} fill={`url(#sky-halo-${b.level})`} opacity="0.55" />
                <circle cx={b.x} cy={b.y} r={r} fill="#ffffff" />
                <circle cx={b.x} cy={b.y} r={r * 0.55} fill={tint} opacity="0.6" />
              </g>
              {labels && (
                <text
                  x={b.x}
                  y={b.y + r + 16}
                  textAnchor="middle"
                  className={`font-mono ${birth !== undefined ? s.birthLabel : ""}`}
                  fontSize={fs}
                  letterSpacing="1.1"
                  fill="#f3f1ec"
                  fillOpacity="0.85"
                  style={after(1.6)}
                >
                  {b.label}
                </text>
              )}
            </g>
          );
        })}

        {/* You. */}
        <circle className={s.corona} cx={cx} cy={cy} r="34" fill="url(#sky-corona)" />
        <circle cx={cx} cy={cy} r="13" fill="url(#sky-core)" />
        <circle cx={cx} cy={cy} r="4.5" fill="#ffffff" />
        <text x={cx} y={cy + 40} textAnchor="middle" className="font-serif" fontStyle="italic" fontSize="19" fill="#f3f1ec">
          {me.user ? `@${me.user}` : "you"}
        </text>
        </g>
      </svg>

      {whisper && (
        <div
          className="pointer-events-none absolute z-10 max-w-[13rem] -translate-x-1/2 rounded-2xl border border-white/10 bg-paper/80 px-3.5 py-2 text-center shadow-[0_10px_30px_-10px_rgba(0,0,0,0.9)] backdrop-blur-md"
          style={{ left: Math.min(Math.max(whisper.x, 110), w - 110), top: Math.max(whisper.y - 74, 8) }}
          role="status"
        >
          <p className="font-mono text-[9.5px] uppercase tracking-[0.2em]" style={{ color: TINT[whisper.level] }}>
            {whisper.label}
          </p>
          <p className="mt-0.5 font-serif text-[15px] italic leading-snug text-ink">{whisper.tag ? `“${whisper.tag}”` : "No bio yet."}</p>
        </div>
      )}

      <AnimatePresence>
        {target && (
          <motion.div
            key={target.pc}
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: 16 }}
            transition={{ duration: 0.45, delay: reduce ? 0 : 0.35 }}
            className="absolute inset-x-3 bottom-3 z-10 mx-auto max-w-md rounded-[22px] border border-white/10 bg-paper/75 p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.95)] backdrop-blur-xl sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: TINT[target.level] }}>
                  {target.level === "New" ? "New star" : `${target.level} friends`} · {target.days} day{target.days === 1 ? "" : "s"} fought
                </p>
                <p className="mt-1 truncate font-serif text-[26px] italic leading-tight text-ink">{target.label}</p>
                {target.fighter && <p className="truncate text-xs text-ink-3">Fights as {target.fighter}</p>}
              </div>
              <p className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] ${ago(target.seen) === "Online" ? "text-accent" : "text-ink-3"}`}>{ago(target.seen)}</p>
            </div>
            <div className="mt-3">
              {!target.tag ? (
                <p className="text-sm text-ink-3">No bio yet. Their line shows up here once they write one.</p>
              ) : read ? (
                <p className="font-serif text-[19px] italic leading-snug text-ink">“{target.tag}”</p>
              ) : (
                <>
                  <p className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-3">Scratch to read their line</p>
                  <ScratchReveal
                    name={target.tag}
                    loveId={target.pc}
                    brandId={`${target.pc}:${target.tag}`}
                    reduce={reduce}
                    onDone={() => {
                      try {
                        localStorage.setItem(readKey(target.pc), target.tag ?? "");
                      } catch {}
                      setTimeout(() => setRead(true), 600);
                    }}
                  />
                </>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <button type="button" onClick={() => setFocus(null)} className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3 transition hover:text-ink">
                Back to sky
              </button>
              <button
                type="button"
                onClick={() => {
                  setFocus(null);
                  onPick(target.pc);
                }}
                className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-paper"
              >
                Fight or manage
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5 sm:p-6">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-accent">Your sky</p>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">
          {stars} star{stars === 1 ? "" : "s"}
          {forming ? ` · ${forming} forming` : ""}
        </p>
      </div>
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-5 transition-opacity sm:p-6 ${target ? "opacity-0" : ""}`}>
        <p className="hidden max-w-[16rem] text-xs text-ink-3 sm:block">
          {stars ? "Hold a star to hear it. Tap to fly in. Fight more, orbit closer." : "Every friend you add is born here."}
        </p>
        <ul className="hidden gap-3 sm:flex">
          {(["Good", "Great", "Ultra", "Best"] as const).map((k) => (
            <li key={k} className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-3">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: TINT[k], boxShadow: `0 0 8px ${TINT[k]}` }} />
              {k}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export { TINT as SKY_TINT };
