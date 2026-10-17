"use client";

import { useEffect, useRef } from "react";
import BRIGHT from "@/components/intro/bright.json";

/**
 * The living night sky behind the quiet pages: the same ESO/S. Brunier Milky Way as the intro, dimmed,
 * drifting a little with the cursor, with the photo's own brightest stars twinkling. One canvas, ~30fps.
 */
export function SkyBackdrop({ dim = 0.55, focus = [0.5, 0.42] }: { dim?: number; focus?: [number, number] }) {
  const [fx, fy] = focus;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const img = new Image();
    img.src = "/intro/sky.webp";
    const stars = BRIGHT as number[][];
    let w = 0, h = 0, raf = 0, last = 0, alive = true;
    const par = { x: 0, y: 0, tx: 0, ty: 0 };
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 32;
    const sx = sprite.getContext("2d")!;
    const g = sx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.12, "rgba(225,235,255,0.9)");
    g.addColorStop(0.4, "rgba(200,215,255,0.12)");
    g.addColorStop(1, "rgba(200,215,255,0)");
    sx.fillStyle = g;
    sx.fillRect(0, 0, 32, 32);

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (now: number) => {
      raf = 0;
      if (!alive) return;
      if (now - last > 33 || reduce) {
        last = now;
        par.x += (par.tx - par.x) * 0.05;
        par.y += (par.ty - par.y) * 0.05;
        ctx.fillStyle = "#050508";
        ctx.fillRect(0, 0, w, h);
        if (img.complete && img.naturalWidth) {
          // cover, a little oversized so the parallax never shows an edge
          const s = Math.max(w / img.naturalWidth, h / img.naturalHeight) * 1.12;
          const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
          const ox = Math.min(0, Math.max(w - iw, w / 2 - fx * iw - par.x * 18)), oy = Math.min(0, Math.max(h - ih, h / 2 - fy * ih - par.y * 12)); // always cover the screen
          ctx.globalAlpha = dim;
          ctx.drawImage(img, ox, oy, iw, ih);
          ctx.globalCompositeOperation = "lighter";
          const t = now / 1000;
          const nS = w < 768 ? 160 : stars.length;
          for (let i = 0; i < nS; i++) {
            const [u, v] = stars[i];
            const x = ox + u * iw, y = oy + v * ih;
            if (x < -10 || y < -10 || x > w + 10 || y > h + 10) continue;
            const tw = Math.pow(0.5 + 0.5 * Math.sin(t * (0.6 + (i % 7) * 0.35) + i * 12.9898), 6);
            const rank = 1 - i / nS;
            const z = (5 + rank * 8 + tw * 8) * (reduce ? 0.8 : 1);
            ctx.globalAlpha = (0.15 + 0.85 * tw) * (0.3 + 0.7 * rank) * dim * 1.4;
            ctx.drawImage(sprite, x - z / 2, y - z / 2, z, z);
          }
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        }
        // keep text legible: darken towards the content column
        const vg = ctx.createRadialGradient(w * 0.4, h * 0.35, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
        vg.addColorStop(0, "rgba(5,5,8,0.35)");
        vg.addColorStop(1, "rgba(5,5,8,0.75)");
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, w, h);
      }
      if (!reduce && !document.hidden) raf = requestAnimationFrame(draw);
    };
    const onMove = (e: PointerEvent) => {
      par.tx = (e.clientX / w - 0.5) * 2;
      par.ty = (e.clientY / h - 0.5) * 2;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    size();
    img.onload = kick;
    window.addEventListener("resize", size);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", kick);
    kick();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", kick);
    };
  }, [dim, fx, fy]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
