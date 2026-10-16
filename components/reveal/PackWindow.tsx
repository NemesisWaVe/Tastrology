"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import { displayName, type CardData } from "@/lib/card";
import { figureFor, rng } from "./skyFigures";
import { skyState } from "./traceModel";
import s from "./reveal.module.css";

/**
 * The pack's window into your own sky: an arch set into the foil, with structured dust in your card's colours,
 * three depth layers of stars that parallax with the pointer (or phone tilt), and your brightest love's
 * constellation in gold leaf. The foil around it stays vivid, so the pack reads as an object, not more background.
 * Every layer is its own composited div, so parallax never re-runs the SVG noise filter.
 */
export function PackWindow({ card, width, height, reduce }: { card: CardData; width: number; height: number; reduce: boolean }) {
  const uid = useId().replace(/:/g, "");
  const el = useRef<HTMLDivElement>(null);
  const { sun, moon } = card.bigThree;

  const art = useMemo(() => {
    const r = rng(`pack-${card.serial}`);
    const far = Array.from({ length: 110 }, () => ({ x: r() * 100, y: r() * 116, r: 0.18 + Math.pow(r(), 3) * 0.45, o: 0.35 + r() * 0.5 }));
    const near = Array.from({ length: 34 }, () => ({ x: r() * 100, y: r() * 116, r: 0.35 + Math.pow(r(), 2) * 0.6, o: 0.6 + r() * 0.4 }));
    const bright = Array.from({ length: 5 }, (_, k) => ({ x: 10 + r() * 80, y: 8 + r() * 60, r: 0.7 + r() * 0.5, d: k * 0.7 }));
    const sky = skyState(card.evolvesFrom, card.archetype);
    const lead = sky.seeds.find((x) => x.id === sky.critique?.strongest) ?? sky.seeds[0];
    const fig = lead ? figureFor(displayName(lead.name).toLowerCase(), 1) : null;
    let lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    let stars: { x: number; y: number; r: number; alpha: boolean }[] = [];
    if (fig) {
      const xs = fig.stars.map((p) => p.x);
      const ys = fig.stars.map((p) => p.y);
      const k = Math.min(58 / (Math.max(...xs) - Math.min(...xs) || 1), 38 / (Math.max(...ys) - Math.min(...ys) || 1));
      const ox = 50 - ((Math.max(...xs) + Math.min(...xs)) / 2) * k;
      const oy = 54 - ((Math.max(...ys) + Math.min(...ys)) / 2) * k;
      lines = fig.edges.map(([a, b]) => ({ x1: ox + fig.stars[a].x * k, y1: oy + fig.stars[a].y * k, x2: ox + fig.stars[b].x * k, y2: oy + fig.stars[b].y * k }));
      stars = fig.stars.map((p, i) => ({ x: ox + p.x * k, y: oy + p.y * k, r: 0.7 + p.m * 1.2, alpha: i === fig.alpha }));
    }
    const seed = Number(card.serial) || 7;
    return { far, near, bright, lines, stars, name: lead ? displayName(lead.name) : "", seed };
  }, [card]);

  // Parallax: pointer anywhere on the page, or phone tilt. Writes CSS variables, no re-render.
  useEffect(() => {
    const node = el.current;
    if (!node || reduce) return;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    const tick = () => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      node.style.setProperty("--px", x.toFixed(3));
      node.style.setProperty("--py", y.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      tx = Math.max(-1, Math.min(1, e.gamma / 25));
      ty = Math.max(-1, Math.min(1, (e.beta - 45) / 25));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("deviceorientation", onTilt, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("deviceorientation", onTilt);
    };
  }, [reduce]);

  const rgb = (hex: string) => {
    const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => v.toFixed(3));
  };
  const [sr, sg, sb] = rgb(sun.a);
  const [mr, mg, mb] = rgb(moon.a);
  const layer = (depth: number) => ({ transform: `translate3d(calc(var(--px, 0) * ${-depth}px), calc(var(--py, 0) * ${-depth * 0.7}px), 0)` });
  const vb = "0 0 100 116";

  return (
    <div className="relative" style={{ width, height }}>
      {/* holo rim: the window is set into the foil, edged in rainbow foil */}
      <div className="absolute inset-0" style={{ borderRadius: "50% 50% 9% 9% / 40% 40% 6% 6%", padding: 1.6, background: "linear-gradient(135deg,#ffffff,#ffe58a 18%,#a8ff5f 34%,#83fff7 50%,#7894ff 66%,#d875ff 82%,#ffffff)" }}>
        <div
          ref={el}
          className="relative h-full w-full overflow-hidden"
          style={{ borderRadius: "50% 50% 8.5% 8.5% / 40% 40% 5.5% 5.5%", background: "#04050b", boxShadow: "inset 0 0 22px rgb(0 0 0 / .9)" }}
        >
          {/* deep field + dust in the card's own colours (feTurbulence: structured noise, not a blur) */}
          <div className="absolute -inset-[7%] will-change-transform" style={layer(2)}>
            <svg viewBox={vb} preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
              <defs>
                <linearGradient id={`${uid}bg`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#03040a" />
                  <stop offset="1" stopColor={moon.a} stopOpacity="0.28" />
                </linearGradient>
                <linearGradient id={`${uid}band`} x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0.15" stopColor="#fff" stopOpacity="0" />
                  <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
                  <stop offset="0.85" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
                <mask id={`${uid}m`}>
                  <rect width="100" height="116" fill={`url(#${uid}band)`} />
                </mask>
                <filter id={`${uid}d1`} x="0" y="0" width="100%" height="100%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="4" seed={art.seed} />
                  <feColorMatrix type="matrix" values={`0 0 0 0 ${sr} 0 0 0 0 ${sg} 0 0 0 0 ${sb} 2.6 0 0 0 -1.15`} />
                </filter>
                <filter id={`${uid}d2`} x="0" y="0" width="100%" height="100%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="3" seed={art.seed + 11} />
                  <feColorMatrix type="matrix" values={`0 0 0 0 ${mr} 0 0 0 0 ${mg} 0 0 0 0 ${mb} 2.4 0 0 0 -1.2`} />
                </filter>
              </defs>
              <rect width="100" height="116" fill="#03040a" />
              <rect width="100" height="116" fill={`url(#${uid}bg)`} />
              <g mask={`url(#${uid}m)`} opacity="0.75">
                <rect width="100" height="116" filter={`url(#${uid}d1)`} />
                <rect width="100" height="116" filter={`url(#${uid}d2)`} opacity="0.7" />
              </g>
            </svg>
          </div>
          {/* far stars */}
          <div className="absolute -inset-[7%] will-change-transform" style={layer(5)}>
            <svg viewBox={vb} preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
              {art.far.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="#f4f1ff" opacity={p.o} />
              ))}
            </svg>
          </div>
          {/* near stars + a few bright ones with spikes */}
          <div className="absolute -inset-[7%] will-change-transform" style={layer(10)}>
            <svg viewBox={vb} preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
              {art.near.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={i % 4 ? "#fff4ea" : "#cad7ff"} opacity={p.o} />
              ))}
              {art.bright.map((p, i) => (
                <g key={i} className={reduce ? undefined : s.twinkle} style={{ animationDelay: `${p.d}s` }}>
                  <circle cx={p.x} cy={p.y} r={p.r * 2.4} fill="#fff" opacity="0.12" />
                  <circle cx={p.x} cy={p.y} r={p.r} fill="#fff" />
                  <path d={`M${p.x - p.r * 6} ${p.y}H${p.x + p.r * 6}M${p.x} ${p.y - p.r * 6}V${p.y + p.r * 6}`} stroke="#fff" strokeWidth="0.18" opacity="0.6" />
                </g>
              ))}
            </svg>
          </div>
          {/* your brightest love, in gold leaf */}
          <div className="absolute -inset-[7%] will-change-transform" style={layer(14)}>
            <svg viewBox={vb} preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
              <defs>
                <linearGradient id={`${uid}gold`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#fff7dc" />
                  <stop offset="0.45" stopColor="#f2c66d" />
                  <stop offset="1" stopColor="#fffaf0" />
                </linearGradient>
              </defs>
              <g stroke={`url(#${uid}gold)`} strokeWidth="0.55" strokeLinecap="round" opacity="0.95">
                {art.lines.map((l, i) => (
                  <line key={i} {...l} />
                ))}
              </g>
              {art.stars.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={p.r * 2.2} fill="#ffe7a8" opacity="0.18" />
                  <circle cx={p.x} cy={p.y} r={p.r} fill={`url(#${uid}gold)`} />
                  {p.alpha && <circle cx={p.x} cy={p.y} r={p.r + 2.2} fill="none" stroke={`url(#${uid}gold)`} strokeWidth="0.45" />}
                </g>
              ))}
              {art.name && (
                <text x="50" y="82" textAnchor="middle" fill="#f6dfa6" opacity="0.9" className="font-serif italic" style={{ fontSize: 6.4 }}>
                  {art.name.length > 24 ? `${art.name.slice(0, 23)}…` : art.name}
                </text>
              )}
              {/* debossed sign plate: the verb is still sealed */}
              <text x="50" y="92" textAnchor="middle" fill="#ffffff" opacity="0.55" className="font-mono" style={{ fontSize: 3.4, letterSpacing: 0.9 }}>
                THE ______ WHO ______
              </text>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
