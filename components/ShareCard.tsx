"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import type { StyleResult } from "@/lib/types";

export function ShareCard({ result, onClose }: { result: StyleResult; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const url = await toPng(ref.current, { pixelRatio: 3, cacheBust: true });
      const a = document.createElement("a");
      a.href = url;
      a.download = `tastemirror-${result.dna.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="rise w-full max-w-[380px]" onClick={(e) => e.stopPropagation()}>
        <div ref={ref} className="mirror relative aspect-[4/5] w-full overflow-hidden rounded-2xl p-7 text-ink" style={{ fontFamily: "var(--font-inter)" }}>
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full border border-ink/10" />
          <div className="absolute -right-6 -top-6 h-36 w-36 rounded-full border border-ink/10" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-ink-2">My Style DNA</p>
          <h3 className="mt-3 font-serif text-[40px] leading-[0.95]" style={{ fontFamily: "var(--font-serif-display)" }}>
            {result.dna.name}
          </h3>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {result.dna.keywords.map((k) => (
              <span key={k.id} className="rounded-full border border-ink/25 px-2.5 py-0.5 text-[11px]">
                {k.name}
              </span>
            ))}
          </div>
          <div className="mt-5 space-y-1.5">
            {result.brands.slice(0, 5).map((b) => (
              <div key={b.entity.id} className="flex items-center gap-2 text-[12.5px]">
                <span className="w-28 truncate font-medium">{b.entity.name}</span>
                <span className="h-1 flex-1 rounded-full bg-ink/10">
                  <span className="block h-1 rounded-full bg-accent" style={{ width: `${Math.round(b.affinity * 100)}%` }} />
                </span>
                <span className="w-8 text-right font-mono text-[10px] text-ink-2">{b.affinity.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="absolute inset-x-7 bottom-6">
            <p className="text-[10.5px] leading-snug text-ink-2">
              Read from {result.seeds.slice(0, 4).map((s) => s.name).join(" · ")}
              {result.seeds.length > 4 ? " …" : ""}
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-ink/15 pt-2.5 text-[10px] uppercase tracking-[0.2em]">
              <span className="font-semibold">TasteMirror</span>
              <span className="text-ink-2">Powered by Qloo&apos;s taste graph</span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={download} disabled={busy} className="flex-1 rounded-xl bg-ink py-3 text-sm font-semibold text-paper disabled:opacity-60">
            {busy ? "Rendering…" : "Download PNG"}
          </button>
          <button onClick={onClose} className="rounded-xl border border-paper/40 px-4 py-3 text-sm text-paper">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
