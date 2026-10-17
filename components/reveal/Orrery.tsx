"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { proxied } from "@/lib/card";
import { KIND_LABEL, pullShares, type Folded } from "./traceModel";

/**
 * The Gravity Well: the reading as a living constellation. Seeds are stars; Qloo's tags spray out of them and the
 * shared ones gather in the middle; brands fall in and settle closer the stronger their affinity; each leave-one-out
 * call pulls one seed out of orbit and its brands sag by exactly the measured drop; the critique flings the flukes out.
 * Every position and motion is a number from this run. Canvas 2D, one rAF loop, springs to targets (no physics sim).
 */

type Kind = "seed" | "tag" | "cons" | "brand" | "bridge";
interface Body {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  a: number;
  ta: number;
  s: number;
  ts: number;
  tone: "ink" | "dim" | "accent" | "m" | "warn";
  label?: string;
  sub?: string;
  img?: HTMLImageElement;
  /** The image failed to load; don't try again. */
  imgFailed?: boolean;
  letter?: string;
  /** Threads drawn from this body to these body ids. */
  links?: { to: string; w: number }[];
  /** 0–1: how hard the current leave-one-out call is pulling this brand outward. */
  hot?: number;
  stamp?: string;
  stampAt?: number;
  born: number;
}

const TAU = Math.PI * 2;
const hash = (t: string) => {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
};
/** Weighted circular mean of angles; falls back when every weight is zero. */
function meanAngle(items: { ang: number; w: number }[], fallback: number) {
  let x = 0;
  let y = 0;
  for (const { ang, w } of items) {
    x += Math.cos(ang) * w;
    y += Math.sin(ang) * w;
  }
  return x * x + y * y > 1e-9 ? Math.atan2(y, x) : fallback;
}
const polar = (ang: number, r: number) => ({ x: Math.cos(ang) * r, y: Math.sin(ang) * r });

export function Orrery({
  f,
  collapsing,
  reduce,
  bet,
  pickable,
  onPick,
  center,
}: {
  f: Folded;
  collapsing: boolean;
  reduce: boolean;
  bet?: string;
  pickable: boolean;
  onPick: (seedId: string) => void;
  center: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const bodies = useRef(new Map<string, Body>());
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const betRef = useRef(bet);
  betRef.current = bet;

  const seedAng = useMemo(() => {
    const n = Math.max(1, f.seeds.length);
    return new Map(f.seeds.map((s, i) => [s.id, -Math.PI / 2 + (TAU * i) / n]));
  }, [f.seeds]);

  // Retarget on every beat: create bodies as their data lands, then move targets.
  useEffect(() => {
    const now = performance.now();
    const map = bodies.current;
    const get = (id: string, kind: Kind, spawn: { x: number; y: number }, init?: Partial<Body>) => {
      let b = map.get(id);
      if (!b) {
        b = { id, kind, x: spawn.x, y: spawn.y, vx: 0, vy: 0, tx: spawn.x, ty: spawn.y, a: 0, ta: 1, s: 0, ts: 0, tone: "ink", born: now, ...init };
        map.set(id, b);
      }
      return b;
    };
    const seen = new Set<string>();
    const n = f.seeds.length;
    const sideB = new Set(f.sides[1] ?? []);
    const current = f.last === "ablation" ? f.ablated[f.ablated.length - 1] : undefined;
    const crit = f.critique;
    const inert = new Set(crit?.inert ?? []);
    const { top: strongest } = crit ? pullShares(f) : { top: undefined };

    // Seeds
    for (const s of f.seeds) {
      const ang = seedAng.get(s.id) ?? 0;
      const b = get(`s:${s.id}`, "seed", polar(ang, 0.15), { letter: s.name[0] });
      if (!b.img && !b.imgFailed && s.image) {
        const img = new Image();
        img.decoding = "async";
        // A broken image is dropped for good: the seed keeps its letter disc, and nothing retries it every frame.
        img.onerror = () => {
          b.img = undefined;
          b.imgFailed = true;
        };
        img.src = proxied(s.image);
        b.img = img;
      }
      let r = sideB.has(s.id) ? 0.92 : 0.78;
      let ta = 1;
      if (s.id === current) {
        r = 0.94;
        ta = 0.35;
      }
      if (crit && s.id === strongest) r = 0.7;
      if (crit && inert.has(s.id)) ta = 0.45;
      const p = polar(ang, r);
      Object.assign(b, { tx: p.x, ty: p.y, ta, ts: (n > 6 ? 0.1 : 0.125) * (crit && s.id === strongest ? 1.18 : 1) });
      b.tone = sideB.has(s.id) ? "m" : crit && s.id === strongest ? "accent" : "ink";
      seen.add(b.id);
    }

    // Tags: each seed's own tags spray outward; the consensus tags gather between the seeds that share them.
    const brandsIn = f.brands.length > 0;
    const cons = new Set(f.consensus.map((c) => c.toLowerCase()));
    for (const s of f.seeds) {
      const ang = seedAng.get(s.id) ?? 0;
      const own = (f.perSeed[s.id] ?? []).filter((t) => !cons.has(t.toLowerCase()));
      own.forEach((t, k) => {
        const b = get(`t:${s.id}:${t}`, "tag", polar(ang, 0.72));
        const p = polar(ang + (k - (own.length - 1) / 2) * 0.13, 1.06);
        Object.assign(b, { tx: p.x, ty: p.y, ta: brandsIn ? 0.22 : 0.6, ts: 0.009, tone: "dim" as const, label: brandsIn ? undefined : t });
        seen.add(b.id);
      });
    }
    f.consensus.forEach((t, k) => {
      const holders = f.seeds.filter((s) => (f.perSeed[s.id] ?? []).some((x) => x.toLowerCase() === t.toLowerCase()));
      const ang = meanAngle(
        holders.map((s) => ({ ang: seedAng.get(s.id) ?? 0, w: 1 })),
        -Math.PI / 2 + (TAU * (k + 0.5)) / Math.max(3, f.consensus.length),
      );
      const spawn = holders[0] ? polar(seedAng.get(holders[0].id) ?? 0, 0.72) : { x: 0, y: 0 };
      const b = get(`c:${t}`, "cons", spawn);
      const p = polar(ang + (hash(t) - 0.5) * 0.35, 0.46 + (k % 2) * 0.08);
      Object.assign(b, {
        tx: p.x,
        ty: p.y,
        ta: brandsIn ? 0.4 : 1,
        ts: 0.012,
        tone: "accent" as const,
        label: brandsIn ? undefined : t,
        links: holders.map((s) => ({ to: `s:${s.id}`, w: brandsIn ? 0.08 : 0.3 })),
      });
      seen.add(b.id);
    });

    // Brands: radius from affinity, bearing from the seeds whose removal hurts them most.
    if (brandsIn) {
      const affs = f.brands.map((x) => x.affinity);
      const lo = Math.min(...affs);
      const hi = Math.max(...affs);
      const kept = new Set(crit?.kept ?? []);
      const rejected = new Map((crit?.rejected ?? []).map((r) => [r.id, r.why]));
      const top3 = new Set(f.brands.filter((x) => !crit || kept.has(x.id)).slice(0, 3).map((x) => x.id));
      const row = current ? f.drops[current] ?? {} : {};
      const rowMax = Math.max(0, ...Object.values(row));
      for (const br of f.brands) {
        const nrm = hi > lo ? (br.affinity - lo) / (hi - lo) : 0.5;
        const home = hash(br.id) * TAU;
        const pull = f.seeds.map((s) => ({ id: s.id, ang: seedAng.get(s.id) ?? 0, w: f.drops[s.id]?.[br.id] ?? 0 }));
        // Lean toward the seeds that carry it, but keep a home bearing so one measured seed can't clump every brand.
        const pullSum = pull.reduce((t, x) => t + x.w, 0);
        const ang = meanAngle([...pull, { ang: home, w: Math.max(pullSum * 0.8, 1e-6) }], home) + (hash(`${br.id}j`) - 0.5) * 0.5;
        const sag = rowMax > 0 ? (row[br.id] ?? 0) / rowMax : 0;
        let r = 0.36 + (1 - nrm) * 0.24 + sag * 0.28;
        const b = get(`b:${br.id}`, "brand", polar(home, 1.45));
        let ta = 0.8;
        let tone: Body["tone"] = "ink";
        let label: string | undefined;
        if (crit) {
          if (rejected.has(br.id)) {
            r = 1.75;
            ta = 0;
            tone = "warn";
            if (!b.stamp) Object.assign(b, { stamp: rejected.get(br.id) === "budget" ? "over budget" : "one-seed fluke", stampAt: now });
          } else if (kept.has(br.id)) ta = 1;
          else ta = 0.16;
        }
        if (top3.has(br.id) && (!crit || kept.has(br.id))) {
          tone = "accent";
          label = br.name;
        }
        const total = pull.reduce((t, x) => t + x.w, 0);
        const lead = pull.sort((a, b2) => b2.w - a.w)[0];
        const p = polar(ang, r);
        Object.assign(b, {
          tx: p.x,
          ty: p.y,
          ta,
          ts: 0.014 + nrm * 0.014,
          tone,
          label,
          sub: label ? `${Math.round(br.affinity)}` : undefined,
          hot: sag,
          links: total > 0 && lead ? [{ to: `s:${lead.id}`, w: 0.12 + 0.3 * (lead.w / total) }] : undefined,
        });
        seen.add(b.id);
      }
    }

    // Bridges: other worlds Qloo links to this taste, parked between the seeds.
    f.bridges.forEach((x, k) => {
      const ang = -Math.PI / 2 + (TAU * (k + 0.5)) / Math.max(3, n);
      const b = get(`r:${x.id}`, "bridge", polar(ang, 1.5));
      const p = polar(ang, 1.04);
      Object.assign(b, { tx: p.x, ty: p.y, ta: 1, ts: 0.026, tone: "dim" as const, label: x.name, sub: (KIND_LABEL[x.kind] ?? x.kind).toLowerCase() });
      seen.add(b.id);
    });

    for (const [id, b] of map) {
      if (!seen.has(id)) b.ta = 0;
      if (collapsing) Object.assign(b, { tx: 0, ty: 0, ta: 0 });
    }
  }, [f, seedAng, collapsing]);

  // Render loop.
  useEffect(() => {
    const canvas = cv.current;
    const host = box.current;
    if (!canvas || !host) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const css = getComputedStyle(host);
    const col = (v: string, fb: string) => css.getPropertyValue(v).trim() || fb;
    const C = {
      ink: col("--ink", "#f3f1ec"),
      dim: col("--ink-3", "#77736c"),
      line: col("--line", "#24242c"),
      accent: col("--accent", "#c6ff3d"),
      m: col("--m", "#f472b6"),
      warn: col("--warn", "#fbbf24"),
      paper: col("--paper", "#07070a"),
    };
    const mono = col("--font-mono", "ui-monospace, monospace");
    const serif = col("--font-serif", "Georgia, serif");
    const glows = new Map<string, HTMLCanvasElement>();
    const glow = (c: string) => {
      let g = glows.get(c);
      if (!g) {
        g = document.createElement("canvas");
        g.width = g.height = 64;
        const x = g.getContext("2d")!;
        const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        grd.addColorStop(0, c);
        grd.addColorStop(1, "transparent");
        x.globalAlpha = 0.55;
        x.fillStyle = grd;
        x.fillRect(0, 0, 64, 64);
        glows.set(c, g);
      }
      return g;
    };

    let W = 0;
    let H = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = host.clientWidth;
      H = host.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const slow = (navigator.hardwareConcurrency ?? 8) <= 4;
    let raf = 0;
    let last = performance.now();
    let skip = false;
    const tone = (t: Body["tone"]) => C[t];

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (slow && (skip = !skip)) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const R = (Math.min(W, H) / 2) * 0.86;
      const cx = W / 2;
      const cy = H / 2;
      const px = (b: Body) => ({ x: cx + b.x * R, y: cy + b.y * R });
      const map = bodies.current;

      for (const b of map.values()) {
        if (reduce) {
          b.x = b.tx;
          b.y = b.ty;
          b.a = b.ta;
          b.s = b.ts;
          continue;
        }
        const stiff = b.kind === "brand" ? 34 : 26;
        const damp = b.kind === "brand" ? 7.5 : 8.5;
        b.vx += ((b.tx - b.x) * stiff - b.vx * damp) * dt;
        b.vy += ((b.ty - b.y) * stiff - b.vy * damp) * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.a += (b.ta - b.a) * Math.min(1, dt * 4);
        b.s += (b.ts - b.s) * Math.min(1, dt * 6);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Orbits
      ctx.lineWidth = 1;
      ctx.strokeStyle = C.line;
      ctx.globalAlpha = 0.7;
      const orbits: [number, number[]][] = [
        [0.78, []],
        [0.48, [2, 5]],
      ];
      for (const [r, dash] of orbits) {
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.arc(cx, cy, r * R, 0, TAU);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Threads and tethers
      for (const b of map.values()) {
        if (!b.links || b.a < 0.02) continue;
        const p = px(b);
        for (const l of b.links) {
          const o = map.get(l.to);
          if (!o) continue;
          const q = px(o);
          ctx.globalAlpha = Math.min(b.a, o.a) * l.w;
          ctx.strokeStyle = b.kind === "cons" ? C.accent : b.hot ? C.warn : C.ink;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      }

      // Small bodies: tags, consensus, brands, bridges
      ctx.textBaseline = "middle";
      for (const b of map.values()) {
        if (b.kind === "seed" || b.a < 0.01) continue;
        const p = px(b);
        const r = Math.max(1, b.s * R);
        const c = b.hot && b.hot > 0.15 ? C.warn : tone(b.tone);
        if (b.kind === "brand" && (b.tone === "accent" || (b.hot ?? 0) > 0.15)) {
          ctx.globalAlpha = b.a;
          const g = r * 5;
          ctx.drawImage(glow(c), p.x - g, p.y - g, g * 2, g * 2);
        }
        ctx.globalAlpha = b.a;
        if (b.kind === "bridge") {
          ctx.strokeStyle = C.ink;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, r * 1.7, r * 0.45, -0.4, 0, TAU);
          ctx.stroke();
        } else {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, TAU);
          ctx.fill();
        }
        // Outer per-seed tags only get words where there's room (dots on phones).
        if (b.label && !(b.kind === "tag" && W < 440)) {
          const big = b.kind === "brand" || b.kind === "bridge";
          ctx.font = `${big ? 11 : b.kind === "cons" ? 11 : 9.5}px ${mono}`;
          ctx.fillStyle = b.kind === "tag" ? C.dim : b.kind === "cons" ? C.accent : C.ink;
          const text = b.label.length > 22 ? `${b.label.slice(0, 21)}…` : b.label;
          const tw = ctx.measureText(text).width;
          // Bridges sit outside the seed ring: label under them. Everything else labels away from the centre,
          // unless that would run off the canvas.
          const under = b.kind === "bridge";
          let right = p.x < cx;
          if (right && p.x - r - 6 - tw < 4) right = false;
          else if (!right && p.x + r + 6 + tw > W - 4) right = true;
          ctx.textAlign = under ? "center" : right ? "right" : "left";
          const x = under ? Math.min(W - tw / 2 - 4, Math.max(tw / 2 + 4, p.x)) : p.x + (right ? -r - 6 : r + 6);
          const y = under ? p.y + r * 1.2 + 9 : p.y;
          // Dark backing so a label stays legible where it crosses a seed name or a thread.
          const w = ctx.measureText(text).width;
          const left = ctx.textAlign === "center" ? x - w / 2 : ctx.textAlign === "right" ? x - w : x;
          const ink = ctx.fillStyle;
          ctx.fillStyle = C.paper;
          ctx.globalAlpha = b.a * 0.72;
          ctx.fillRect(left - 3, y - 7, w + 6, b.sub ? 27 : 14);
          ctx.globalAlpha = b.a;
          ctx.fillStyle = ink;
          ctx.fillText(text, x, y);
          if (b.sub) {
            ctx.font = `9px ${mono}`;
            ctx.fillStyle = C.dim;
            ctx.fillText(b.sub, x, y + 12);
          }
        }
        if (b.stamp && b.stampAt && now - b.stampAt < 1600) {
          const t = (now - b.stampAt) / 1600;
          ctx.globalAlpha = Math.min(1, (1 - t) * 2);
          ctx.font = `600 10px ${mono}`;
          ctx.textAlign = "center";
          ctx.fillStyle = C.warn;
          ctx.fillText(b.stamp.toUpperCase(), p.x, p.y - r - 10);
        }
      }

      // Seeds
      const betNow = betRef.current;
      for (const b of map.values()) {
        if (b.kind !== "seed" || b.a < 0.01) continue;
        const p = px(b);
        const r = b.s * R;
        if (r < 4) continue; // still growing in; the clip ring below needs r > 2.5
        const ring = tone(b.tone);
        ctx.globalAlpha = b.a;
        if (b.tone !== "ink") ctx.drawImage(glow(ring), p.x - r * 2.2, p.y - r * 2.2, r * 4.4, r * 4.4);
        ctx.fillStyle = b.tone === "ink" ? "rgba(255,255,255,.32)" : ring;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, r - 2.5, 0, TAU);
        ctx.clip();
        ctx.fillStyle = C.paper;
        ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        if (b.img?.complete && b.img.naturalWidth) {
          const iw = b.img.naturalWidth;
          const ih = b.img.naturalHeight;
          const k = (2 * r) / Math.min(iw, ih);
          ctx.drawImage(b.img, p.x - (iw * k) / 2, p.y - (ih * k) / 2, iw * k, ih * k);
        } else if (b.letter) {
          ctx.fillStyle = C.ink;
          ctx.globalAlpha = b.a * 0.8;
          ctx.font = `italic ${Math.round(r * 0.9)}px ${serif}`;
          ctx.textAlign = "center";
          ctx.fillText(b.letter, p.x, p.y + 1);
        }
        ctx.restore();
        if (betNow && b.id === `s:${betNow}`) {
          ctx.globalAlpha = b.a;
          ctx.strokeStyle = C.accent;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 5]);
          ctx.lineDashOffset = reduce ? 0 : -now / 60;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 7, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineWidth = 1;
        }
        // DOM label (also the bet button) follows the star.
        const el = labels.current.get(b.id.slice(2));
        if (el) {
          el.style.transform = `translate(${p.x}px, ${p.y + r + 6}px) translateX(-50%)`;
          el.style.opacity = String(Math.max(0.25, b.a));
        }
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reduce]);

  const sideB = new Set(f.sides[1] ?? []);
  const inert = new Set(f.critique?.inert ?? []);
  return (
    <div ref={box} className="relative aspect-square w-[min(92vw,44vh,480px)] lg:w-[min(48vw,66vh,620px)]">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" aria-hidden />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[24%] w-[24%] -translate-x-1/2 -translate-y-1/2">{center}</div>
      {f.seeds.map((s) => (
        <button
          key={s.id}
          ref={(el) => {
            if (el) labels.current.set(s.id, el);
            else labels.current.delete(s.id);
          }}
          type="button"
          disabled={!pickable}
          onClick={() => onPick(s.id)}
          aria-label={pickable ? `Bet that ${s.name} steers your taste` : s.name}
          className={`absolute left-0 top-0 w-[30%] max-w-[150px] rounded-md px-1 text-center transition-colors ${pickable ? "cursor-pointer hover:bg-paper-2/70" : "cursor-default"}`}
          style={{ transform: "translate(-999px,-999px)" }}
        >
          <span className="block truncate text-[10px] font-medium leading-tight text-ink-2 sm:text-[11px]">{s.name}</span>
          <span className="block font-mono text-[8px] uppercase tracking-[0.18em] text-ink-3">
            {f.ablated[f.ablated.length - 1] === s.id && f.last === "ablation" ? (
              <span className="text-warn">pulled out</span>
            ) : sideB.has(s.id) ? (
              <span style={{ color: "var(--m)" }}>side B</span>
            ) : inert.has(s.id) ? (
              "quiet"
            ) : (
              (KIND_LABEL[s.kind] ?? s.kind)
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
