"use client";

import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { CursorArrow } from "@/components/CursorArrow";
import { Sky } from "@/components/reveal/Sky";
import { skyState } from "@/components/reveal/traceModel";
import { BRAND } from "@/lib/brand";
import s from "./burned.module.css";

/**
 * 410: the owner burned this card (docs/design/burn.md). Shared by /c/<code> and /vs/<code>.
 * An empty, singed outline where the card stood, with embers and ash lifting off its edges (they settle while you
 * hover), a scorch glowing under it, the surviving label, and the night sky behind. Reduced motion: one still frame.
 */
export function Burned({ code, what = "card" }: { code: string; what?: string }) {
  const reduce = Boolean(useReducedMotion());
  const sky = useMemo(() => skyState([], "Burned"), []);
  const serial = code.split("-")[0];
  return (
    // `isolate`: the quiet sky sits at -z-10 and would otherwise paint under the body background.
    <div className="relative isolate flex w-full max-w-md flex-col items-center text-center">
      <Sky f={sky} reduce={reduce} fixed quiet nameless dim={0.55} />

      <div className="relative mt-2 mb-10">
        <div className={s.ghost} role="img" aria-label={`Burned card, No. ${serial}`}>
          <span className={s.scorch} aria-hidden />
          <svg className={s.edge} viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id="burned-edge" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stopColor="#ff9f43" stopOpacity="0.85" />
                <stop offset="0.35" stopColor="#c6ff3d" stopOpacity="0.5" />
                <stop offset="1" stopColor="#c6ff3d" stopOpacity="0.14" />
              </linearGradient>
            </defs>
            {/* A broken outline: the frame burned through in places. */}
            <rect x="1" y="1" width="98" height="138" rx="7" fill="none" stroke="url(#burned-edge)" strokeWidth="0.7" strokeDasharray="22 3 9 2 31 5 6 2 17 4" vectorEffect="non-scaling-stroke" />
          </svg>
          <p className={`${s.label} font-mono text-[11px] uppercase tracking-[0.2em]`}>No. {code}</p>
        </div>
        <Ash reduce={reduce} />
      </div>

      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Burned</p>
      <h1 className="mt-3 font-serif text-5xl italic leading-[0.95]">Only dust left.</h1>
      <p className="mt-4 font-display text-lg font-semibold tracking-tight text-ink">Someone held the button until it was ash.</p>
      <p className="mt-2 text-ink-2">
        The owner of {what} No. {code} burned it, so this link shows nothing now. It comes back only if someone reads the same loves fresh.
      </p>
      <Link href="/" className="group mt-8 inline-flex items-center gap-3 rounded-full bg-accent py-2 pl-6 pr-2 font-semibold text-paper">
        Get your own {BRAND.name} sign
        <CursorArrow className="h-9 w-9 bg-paper text-accent" />
      </Link>
    </div>
  );
}

interface Fleck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  age: number;
  ember: boolean;
  seed: number;
}

const EMBERS = ["#ffb347", "#ff8a3d", "#c6ff3d", "#ffe7a3"];

/**
 * Ash and embers lifting off the ghost's edges: a small canvas around it, about 70 flecks at a time.
 * Hovering (or touching) the card lets them settle: they slow, drift down and fade. Pauses while the tab is hidden.
 */
function Ash({ reduce }: { reduce: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = cv.current;
    const ghost = canvas?.previousElementSibling as HTMLElement | null;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ghost || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0;
    let H = 0;
    let gx = 0;
    let gy = 0;
    let gw = 0;
    let gh = 0;
    const size = () => {
      const g = ghost.getBoundingClientRect();
      gw = g.width;
      gh = g.height;
      W = gw + 120;
      H = gh + 200;
      gx = 60;
      gy = 140;
      Object.assign(canvas.style, { width: `${W}px`, height: `${H}px`, left: `${-60}px`, top: `${-140}px` });
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();

    /** Born on the outline, mostly the top and sides, where the heat escapes. */
    const spawn = (age = 0): Fleck => {
      const side = Math.random();
      let x: number;
      let y: number;
      if (side < 0.45) {
        x = gx + Math.random() * gw;
        y = gy + Math.random() * 6;
      } else if (side < 0.9) {
        x = gx + (Math.random() < 0.5 ? 0 : gw) + (Math.random() - 0.5) * 6;
        y = gy + Math.random() * gh;
      } else {
        x = gx + Math.random() * gw;
        y = gy + gh - Math.random() * 6;
      }
      const ember = Math.random() < 0.38;
      return { x, y, vx: (Math.random() - 0.5) * 0.15, vy: -(0.18 + Math.random() * 0.42), r: ember ? 0.7 + Math.random() * 0.9 : 0.6 + Math.random() * 1.4, life: 2600 + Math.random() * 3400, age, ember, seed: Math.random() * 6.28 };
    };
    const flecks: Fleck[] = Array.from({ length: 70 }, () => {
      const f = spawn();
      f.age = Math.random() * f.life; // start mid-drift, not all at once
      f.y += f.vy * (f.age / 16.67);
      return f;
    });

    let calm = 0; // 0 = drifting up, 1 = settled (hover)
    let calmTarget = 0;
    const host = ghost.parentElement!;
    const on = () => (calmTarget = 1);
    const off = () => (calmTarget = 0);
    host.addEventListener("pointerenter", on);
    host.addEventListener("pointerleave", off);
    host.addEventListener("pointerdown", on);
    host.addEventListener("pointerup", off);

    const draw = (f: Fleck, t: number) => {
      const k = f.age / f.life;
      const fade = Math.min(1, k * 6) * (1 - k);
      if (f.ember) {
        const flick = 0.65 + 0.35 * Math.sin(t * 0.012 + f.seed * 7);
        ctx.globalAlpha = fade * flick * (1 - calm * 0.5);
        ctx.fillStyle = EMBERS[Math.floor(f.seed) % EMBERS.length];
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 6;
      } else {
        ctx.globalAlpha = fade * 0.55;
        ctx.fillStyle = "#9a948a";
        ctx.shadowBlur = 0;
      }
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    };

    if (reduce) {
      // One still frame: flecks frozen mid-air.
      ctx.clearRect(0, 0, W, H);
      for (const f of flecks) draw(f, 0);
      return () => {
        host.removeEventListener("pointerenter", on);
        host.removeEventListener("pointerleave", off);
        host.removeEventListener("pointerdown", on);
        host.removeEventListener("pointerup", off);
      };
    }

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const step = dt / 16.67;
      calm += (calmTarget - calm) * Math.min(1, 0.04 * step);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < flecks.length; i++) {
        const f = flecks[i];
        f.age += dt;
        // Rising heat, a lazy sway; when calm, the lift dies and the ash sinks back toward the card.
        const lift = f.vy * (1 - calm) + 0.12 * calm;
        f.x += (f.vx + Math.sin(f.seed + f.age * 0.0016) * 0.18 * (1 - calm * 0.7)) * step;
        f.y += lift * step;
        if (f.age >= f.life || f.y < -10 || f.y > H + 10) flecks[i] = spawn();
        draw(f, now);
      }
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    };
    const vis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    vis();
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("resize", size);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("resize", size);
      host.removeEventListener("pointerenter", on);
      host.removeEventListener("pointerleave", off);
      host.removeEventListener("pointerdown", on);
      host.removeEventListener("pointerup", off);
    };
  }, [reduce]);

  return <canvas ref={cv} className={s.ash} aria-hidden />;
}
