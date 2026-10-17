"use client";

import { useEffect, useRef } from "react";
import { rng, TAU } from "./skyFigures";

/**
 * The universal pack art: an aperture onto infinity. A black hole's accretion disk, streaked white-hot to amber to
 * violet, spins around a dark event horizon; its far side is bent over the top by the lensing (an Einstein ring), its
 * near side passes in front. Identical on every pack and says nothing about the card inside: the mystery is the point.
 * One small canvas: the streak texture is built once, then only rotated per frame.
 */
export function PackAperture({ size, reduce }: { size: number; reduce: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = cv.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const S = size;
    canvas.width = Math.round(S * dpr);
    canvas.height = Math.round(S * dpr);
    const c = S / 2;
    const hole = S * 0.15;
    const r = rng("tastrology-infinity");

    // deep space behind: gradient + a fine star dust, built once
    const bg = document.createElement("canvas");
    bg.width = bg.height = Math.round(S * dpr);
    {
      const g = bg.getContext("2d")!;
      g.scale(dpr, dpr);
      const lin = g.createLinearGradient(0, 0, S, S);
      lin.addColorStop(0, "#05040b");
      lin.addColorStop(0.55, "#0a0718");
      lin.addColorStop(1, "#04030a");
      g.fillStyle = lin;
      g.fillRect(0, 0, S, S);
      for (let k = 0; k < Math.round(S * 1.6); k++) {
        const s = 0.4 + Math.pow(r(), 6) * 1.4;
        g.globalAlpha = 0.25 + r() * 0.6;
        g.fillStyle = r() < 0.2 ? "#cad7ff" : r() < 0.4 ? "#ffd2a1" : "#f8f7ff";
        g.fillRect(r() * S, r() * S, s, s);
      }
      g.globalAlpha = 1;
    }

    // accretion disk texture: thousands of short arcs, hot inside, cooling outward
    const R0 = hole * 1.25;
    const R1 = S * 0.47;
    const T = document.createElement("canvas");
    const TS = Math.round(R1 * 2 * dpr);
    T.width = T.height = TS;
    {
      const g = T.getContext("2d")!;
      g.scale(dpr, dpr);
      g.translate(R1, R1);
      g.lineCap = "round";
      for (let k = 0; k < 2600; k++) {
        const u = Math.pow(r(), 1.8); // more streaks near the inner edge
        const rr = R0 + u * (R1 - R0);
        const a0 = r() * TAU;
        const len = 0.06 + r() * 0.5;
        const col = u < 0.12 ? "#fff6e6" : u < 0.35 ? "#ffd08a" : u < 0.6 ? "#ff9a4d" : u < 0.82 ? "#c2410c" : "#7c3aed";
        g.strokeStyle = col;
        g.globalAlpha = (0.05 + r() * 0.32) * (1 - u * 0.55);
        g.lineWidth = 0.5 + r() * (u < 0.3 ? 1.6 : 1.1);
        g.beginPath();
        g.arc(0, 0, rr, a0, a0 + len);
        g.stroke();
      }
    }

    const disk = (theta: number, squash: number, scale = 1) => {
      ctx.save();
      ctx.translate(c, c);
      ctx.scale(scale, squash * scale);
      ctx.rotate(theta);
      ctx.drawImage(T, -R1, -R1, R1 * 2, R1 * 2);
      ctx.restore();
    };

    let raf = 0;
    let theta = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduce) theta += dt * 0.35;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(bg, 0, 0, S, S);

      // 1. the disk, seen nearly edge-on (behind the hole)
      disk(theta, 0.24);

      // 2. the lensed far side: the same disk, bent into a ring over the hole
      ctx.save();
      ctx.beginPath();
      ctx.arc(c, c, hole * 2.05, 0, TAU);
      ctx.arc(c, c, hole * 1.06, 0, TAU, true);
      ctx.clip();
      ctx.globalAlpha = 0.95;
      disk(theta * 0.8, 1, 0.46);
      ctx.restore();

      // 3. the event horizon, with a thin photon ring
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(c, c, hole, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#fff4dc";
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(c, c, hole * 1.03, 0, TAU);
      ctx.stroke();

      // 4. the near side of the disk crosses in front of the hole
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, c, S, S);
      ctx.clip();
      ctx.globalAlpha = 1;
      disk(theta, 0.24);
      ctx.restore();
      ctx.globalAlpha = 1;

      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size, reduce]);

  return <canvas ref={cv} style={{ width: size, height: size }} className="block rounded-full" aria-hidden />;
}
