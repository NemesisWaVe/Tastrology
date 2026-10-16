"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFontEmbedCSS, toBlob } from "html-to-image";
import type { StyleResult } from "@/lib/types";
import { buildCard, proxied, type CardData } from "@/lib/card";
import { BRAND } from "@/lib/brand";
import { HoloCard, glyph } from "./HoloCard";
import { Sigil, Sparkle } from "./Sigils";

type Format = "story" | "square";
const SIZE: Record<Format, { w: number; h: number; out: [number, number]; label: string }> = {
  story: { w: 360, h: 640, out: [1080, 1920], label: "Story 9:16" },
  square: { w: 400, h: 400, out: [1080, 1080], label: "Square 1:1" },
};

let fontCSS: Promise<string> | null = null;

/** Share sheet: live preview of the export, then a 1080px PNG via the native share sheet (mobile) or a download. */
export function ShareSheet({ result, onClose }: { result: StyleResult; onClose: () => void }) {
  const card = useMemo(() => buildCard(result), [result]);
  const [fmt, setFmt] = useState<Format>("story");
  const [busy, setBusy] = useState<null | "share" | "save">(null);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [vp, setVp] = useState({ w: 400, h: 800 });
  const node = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const f = new File([new Blob(["x"], { type: "image/png" })], "x.png", { type: "image/png" });
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      setCanShare(Boolean(navigator.canShare?.({ files: [f] })) && coarse);
    } catch {
      setCanShare(false);
    }
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const size = SIZE[fmt];
  const scale = Math.min(1, (Math.min(vp.w, 460) - 32) / size.w, (vp.h - 210) / size.h);
  const fileName = `tastrology-${card.archetype.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${fmt}.png`;

  const render = useCallback(async (): Promise<Blob> => {
    const el = node.current;
    if (!el) throw new Error("Nothing to render");
    await document.fonts.ready;
    await Promise.all(
      [...el.querySelectorAll("img")].map((img) => (img.complete ? Promise.resolve() : new Promise((r) => ((img.onload = r), (img.onerror = r))))),
    );
    fontCSS ??= getFontEmbedCSS(el).catch(() => "");
    const opts = { pixelRatio: size.out[0] / size.w, width: size.w, height: size.h, backgroundColor: "#07070a", fontEmbedCSS: await fontCSS, cacheBust: false, includeQueryParams: true };
    // First pass warms the image/font cache (Safari often drops images on the very first draw).
    let blob = await toBlob(el, opts);
    if (!blob || blob.size < 60_000) blob = await toBlob(el, opts);
    if (!blob) throw new Error("Render failed");
    return blob;
  }, [size]);

  const go = async (mode: "share" | "save") => {
    setBusy(mode);
    setErr(null);
    setDone(null);
    try {
      const blob = await render();
      const file = new File([blob], fileName, { type: "image/png" });
      if (mode === "share" && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: BRAND.name, text: `I'm ${card.archetype}. ${BRAND.question}` });
          setDone("Shared");
        } catch (e) {
          if ((e as Error).name !== "AbortError") throw e;
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        setDone(`Saved ${size.out[0]}×${size.out[1]} PNG · ${(blob.size / 1024 / 1024).toFixed(1)} MB`);
      }
    } catch (e) {
      setErr((e as Error).message || "Couldn't render the image");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 backdrop-blur-md sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="Share your taste sign">
      <div
        className="rise flex max-h-[100dvh] w-full flex-col items-center gap-4 overflow-y-auto rounded-t-[28px] border border-line bg-paper px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:w-auto sm:rounded-[28px] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-full items-center justify-between gap-3">
          <div className="inline-flex rounded-full border border-line bg-card p-1 text-[12.5px]" role="tablist">
            {(Object.keys(SIZE) as Format[]).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={fmt === f}
                onClick={() => {
                  setFmt(f);
                  setDone(null);
                }}
                className={`rounded-full px-3.5 py-1.5 font-medium transition ${fmt === f ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}
              >
                {SIZE[f].label}
              </button>
            ))}
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full border border-line text-ink-2 hover:text-ink">
            ✕
          </button>
        </div>

        <div className="relative overflow-hidden rounded-[18px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-line" style={{ width: size.w * scale, height: size.h * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width: size.w, height: size.h }}>
            {fmt === "story" ? <Story ref={node} card={card} result={result} /> : <Square ref={node} card={card} result={result} />}
          </div>
        </div>

        <div className="flex w-full max-w-[400px] flex-col gap-2">
          <div className="flex gap-2">
            {canShare && (
              <button onClick={() => go("share")} disabled={!!busy} className="flex-1 rounded-full bg-accent py-3.5 text-[15px] font-semibold text-black transition active:scale-[0.98] disabled:opacity-60">
                {busy === "share" ? "Minting…" : "Share"}
              </button>
            )}
            <button
              onClick={() => go("save")}
              disabled={!!busy}
              className={`flex-1 rounded-full py-3.5 text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-60 ${canShare ? "border border-line text-ink" : "bg-accent text-black"}`}
            >
              {busy === "save" ? "Minting PNG…" : canShare ? "Save image" : `Download ${fmt === "story" ? "story" : "square"} PNG`}
            </button>
          </div>
          <p className="min-h-[18px] text-center font-mono text-[11px] text-ink-3" aria-live="polite" data-share-status>
            {err ? <span className="text-bad">{err}</span> : done ?? `${size.out[0]}×${size.out[1]} · made for ${fmt === "story" ? "IG / TikTok stories" : "feeds & group chats"}`}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ export layouts */

function Backdrop({ card }: { card: CardData }) {
  const [t1, t2] = card.types;
  const a = t1?.a ?? "#a78bfa";
  const b = (t2 ?? t1)?.b ?? "#22d3ee";
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(70% 45% at 50% 46%, color-mix(in oklab, ${a} 34%, transparent), transparent 70%),
            radial-gradient(60% 35% at 100% 0%, color-mix(in oklab, ${b} 30%, transparent), transparent 70%),
            radial-gradient(60% 35% at 0% 100%, color-mix(in oklab, ${a} 22%, transparent), transparent 70%),
            #07070a`,
        }}
      />
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 10% 20%, #fff8, transparent), radial-gradient(1px 1px at 30% 80%, #fff6, transparent), radial-gradient(1px 1px at 60% 30%, #fff7, transparent), radial-gradient(1px 1px at 85% 65%, #fff5, transparent), radial-gradient(1.4px 1.4px at 45% 55%, #fff8, transparent), radial-gradient(1px 1px at 75% 12%, #fff6, transparent)",
          backgroundSize: "140px 140px",
        }}
      />
      <svg className="absolute left-1/2 top-[46%] h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 opacity-[0.18]" viewBox="-50 -50 100 100" fill="none" stroke="#fff" strokeWidth="0.12">
        <circle r="48" />
        <circle r="44" strokeDasharray="0.4 1.2" />
        <circle r="36" />
        {Array.from({ length: 12 }, (_, i) => {
          const t = (i / 12) * Math.PI * 2;
          return <line key={i} x1={Math.cos(t) * 36} y1={Math.sin(t) * 36} x2={Math.cos(t) * 48} y2={Math.sin(t) * 48} />;
        })}
      </svg>
    </>
  );
}

function Wordmark({ size = 13 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-display font-bold uppercase text-ink" style={{ fontSize: size, letterSpacing: "0.22em" }}>
      <Sparkle className="h-[0.85em] w-[0.85em] text-accent" />
      {BRAND.name}
    </span>
  );
}

function BigThreeStrip({ card, vertical = false }: { card: CardData; vertical?: boolean }) {
  const { sun, moon, rising, moonIsContradiction } = card.bigThree;
  const rows = [
    { k: "sun" as const, label: "Sun", t: sun },
    { k: "moon" as const, label: moonIsContradiction ? "Moon ≠" : "Moon", t: moon },
    { k: "rising" as const, label: "Rising", t: rising },
  ];
  return (
    <div className={vertical ? "flex flex-col gap-1.5" : "grid grid-cols-3 gap-1.5"}>
      {rows.map((r) => (
        <div
          key={r.k}
          className={`flex min-w-0 rounded-xl border px-2 py-1.5 ${vertical ? "items-center gap-2" : "flex-col items-center text-center"}`}
          style={{ borderColor: `color-mix(in oklab, ${r.t.a} 45%, transparent)`, background: `linear-gradient(180deg, color-mix(in oklab, ${r.t.a} 16%, transparent), rgba(255,255,255,0.03))` }}
        >
          <span className="flex items-center gap-1 font-mono text-[7.5px] uppercase tracking-[0.2em] text-ink-2">
            <Sigil kind={r.k} className="h-[11px] w-[11px]" />
            {!vertical && r.label}
          </span>
          <span className={`min-w-0 truncate font-display text-[11px] font-semibold leading-tight ${vertical ? "" : "mt-0.5 w-full"}`}>
            {vertical && <span className="mr-1 font-mono text-[7.5px] font-normal uppercase tracking-[0.18em] text-ink-3">{r.label}</span>}
            {r.t.name} <span style={{ color: r.t.a }}>{glyph(r.t.glyph)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function TopBrands({ result, vertical = false }: { result: StyleResult; vertical?: boolean }) {
  const top = result.brands.filter((b) => !b.side).slice(0, 3);
  return (
    <div className={vertical ? "flex flex-col gap-1.5" : "grid grid-cols-3 gap-1.5"}>
      {top.map((b) => (
        <div key={b.entity.id} className="flex min-w-0 items-center gap-1.5 rounded-xl bg-white/[0.05] p-1 pr-2 ring-1 ring-white/10">
          <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-lg bg-white p-[2px]">
            {b.entity.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={proxied(b.entity.image)} alt="" crossOrigin="anonymous" className="h-full w-full object-contain" />
            ) : (
              <span className="text-[10px] text-black">{b.entity.name[0]}</span>
            )}
          </span>
          <span className="min-w-0 leading-none">
            <span className="block truncate text-[10px] font-semibold">{b.entity.name}</span>
            <span className="mt-0.5 block font-mono text-[7px] text-accent">.{Math.round(b.affinity * 100)} aff</span>
          </span>
        </div>
      ))}
    </div>
  );
}

const Story = forwardRef<HTMLDivElement, { card: CardData; result: StyleResult }>(function Story({ card, result }, ref) {
  return (
    <div ref={ref} className="relative overflow-hidden text-ink" style={{ width: 360, height: 640, fontFamily: "var(--nf-sans), system-ui, sans-serif" }}>
      <Backdrop card={card} />
      <div className="relative flex h-full flex-col items-center px-6 pb-6 pt-6">
        <div className="flex w-full items-center justify-between">
          <Wordmark />
          <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-ink-3">
            {BRAND.cardSet} · № {card.serial}
          </span>
        </div>

        <p className="mt-5 font-mono text-[8.5px] uppercase tracking-[0.3em] text-accent">my taste sign is</p>
        <h2 className="mt-1.5 text-center font-serif leading-[0.95] text-balance" data-len={card.archetype.length} style={{ fontFamily: "var(--nf-serif), Georgia, serif", fontSize: card.archetype.length > 30 ? 27 : 31 }}>
          {card.archetype}
        </h2>

        <div className="mt-4 shrink-0">
          <HoloCard card={card} width={208} idle={false} still />
        </div>

        <div className="mt-4 w-full">
          <BigThreeStrip card={card} />
        </div>
        <div className="mt-3 w-full">
          <p className="mb-1.5 text-center font-mono text-[7px] uppercase tracking-[0.24em] text-ink-3">receipts · top matches from Qloo</p>
          <TopBrands result={result} />
        </div>

        <div className="mt-auto flex w-full flex-col items-center pt-2">
          <p className="font-serif text-[22px] italic leading-none" style={{ fontFamily: "var(--nf-serif), Georgia, serif" }}>
            {BRAND.question}
          </p>
          <p className="mt-1.5 font-mono text-[7.5px] uppercase tracking-[0.24em] text-ink-3">{BRAND.name.toLowerCase()} · {BRAND.tagline.toLowerCase()}</p>
        </div>
      </div>
    </div>
  );
});

const Square = forwardRef<HTMLDivElement, { card: CardData; result: StyleResult }>(function Square({ card, result }, ref) {
  return (
    <div ref={ref} className="relative overflow-hidden text-ink" style={{ width: 400, height: 400, fontFamily: "var(--nf-sans), system-ui, sans-serif" }}>
      <Backdrop card={card} />
      <div className="relative flex h-full items-center gap-4 p-5">
        <div className="shrink-0">
          <HoloCard card={card} width={186} idle={false} still />
        </div>
        <div className="flex h-full min-w-0 flex-1 flex-col py-1">
          <Wordmark size={10} />
          <p className="mt-4 font-mono text-[7.5px] uppercase tracking-[0.28em] text-accent">my taste sign is</p>
          <h2 className="mt-1 font-serif leading-[0.95]" style={{ fontFamily: "var(--nf-serif), Georgia, serif", fontSize: card.archetype.length > 30 ? 19 : 23 }}>
            {card.archetype}
          </h2>
          <div className="mt-3">
            <BigThreeStrip card={card} vertical />
          </div>
          <div className="mt-2.5">
            <TopBrands result={result} vertical />
          </div>
          <div className="mt-auto pt-2">
            <p className="font-serif text-[16px] italic leading-none" style={{ fontFamily: "var(--nf-serif), Georgia, serif" }}>
              {BRAND.question}
            </p>
            <p className="mt-1 font-mono text-[6.5px] uppercase tracking-[0.2em] text-ink-3">{BRAND.tagline.toLowerCase()}</p>
          </div>
        </div>
      </div>
    </div>
  );
});
