"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { getFontEmbedCSS, toBlob } from "html-to-image";
import type { StyleResult } from "@/lib/types";
import { buildCard, cardCode, proxied, type CardData } from "@/lib/card";
import { BRAND } from "@/lib/brand";
import { sfx } from "@/lib/sound";
import { HoloCard, glyph } from "./HoloCard";
import { Sigil, Sparkle } from "./Sigils";
import { ReceiptBody, ReceiptPaper } from "./Receipt";

type Format = "story" | "receipt" | "square";
const SIZE: Record<Format, { w: number; h: number; out: [number, number]; label: string; for: string }> = {
  story: { w: 360, h: 640, out: [1080, 1920], label: "Story", for: "IG / TikTok stories" },
  receipt: { w: 360, h: 640, out: [1080, 1920], label: "Receipt", for: "stories, or the group chat" },
  square: { w: 400, h: 400, out: [1080, 1080], label: "Square", for: "feeds & group chats" },
};

const SPRING = { type: "spring" as const, stiffness: 500, damping: 28 };
let fontCSS: Promise<string> | null = null;

type Target = "insta" | "snap" | "x";

/**
 * Share sheet: live preview of the export, then straight to a platform. X and Snapchat take the card's link (its
 * preview image is the card, app/c/[code]/opengraph-image.tsx). Instagram has no way in from the web except the
 * phone's share sheet, so on a phone it hands the PNG to the sheet (pick Instagram → Story); without one it saves
 * the PNG and opens Instagram's story camera.
 * `linkable`: the card is filed on the server (live readings only), so /c/<code> resolves for whoever taps it.
 * From a card page (/c/<code>) there may be no reading on hand, only the card: then it shares the Story layout,
 * which needs nothing else. `mine` false (a visitor sharing someone's card) changes "I pulled" to "Spotted".
 */
export function ShareSheet({
  result,
  card: given,
  onClose,
  linkable = false,
  mine = true,
}: { onClose: () => void; linkable?: boolean; mine?: boolean } & ({ result: StyleResult; card?: undefined } | { card: CardData; result?: undefined })) {
  const card = useMemo(() => given ?? buildCard(result!), [given, result]);
  const formats = (result ? Object.keys(SIZE) : ["story"]) as Format[];
  const [fmt, setFmt] = useState<Format>("story");
  const [busy, setBusy] = useState<null | "share" | "save" | Target>(null);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [vp, setVp] = useState({ w: 400, h: 800 });
  const node = useRef<HTMLDivElement>(null);
  const coarse = useRef(false);

  useEffect(() => {
    sfx("whoosh");
    try {
      const f = new File([new Blob(["x"], { type: "image/png" })], "x.png", { type: "image/png" });
      coarse.current = window.matchMedia("(pointer: coarse)").matches;
      setCanShare(Boolean(navigator.canShare?.({ files: [f] })) && coarse.current);
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

  // Phones only open the share sheet straight after a tap, and a render takes a second or two: by then iOS refuses
  // (NotAllowedError) and Instagram never sees the image. So each layout is rendered as soon as it's on screen and the
  // tap shares the finished PNG at once.
  const blobs = useRef<Partial<Record<Format, Blob>>>({});
  const pending = useRef<Partial<Record<Format, Promise<Blob>>>>({});
  const prepare = useCallback(
    (f: Format) => {
      pending.current[f] ??= render().then(
        (b) => ((blobs.current[f] = b), b),
        (e) => {
          delete pending.current[f];
          throw e;
        },
      );
      return pending.current[f]!;
    },
    [render],
  );
  useEffect(() => {
    if (blobs.current[fmt]) return;
    const t = setTimeout(() => prepare(fmt).catch(() => {}), 450);
    return () => clearTimeout(t);
  }, [fmt, prepare]);

  const caption = `${mine ? "I pulled" : "Spotted"} a ${card.rarityLabel}: ${card.archetype}. ${BRAND.question}`;
  const link = (src: string) => {
    if (typeof window === "undefined") return "";
    return linkable ? `${location.origin}/c/${encodeURIComponent(cardCode(card))}?s=${src}` : location.origin;
  };

  const save = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const go = (mode: "share" | "save" | "insta") => {
    setErr(null);
    setDone(null);
    const ready = blobs.current[fmt];
    // Ready: hand it over inside this tap (no await before navigator.share).
    if (ready) return deliver(mode, ready);
    setBusy(mode);
    prepare(fmt).then(
      (b) => deliver(mode, b, true),
      (e) => {
        setErr((e as Error).message || "Couldn't render the image");
        setBusy(null);
      },
    );
  };

  const deliver = async (mode: "share" | "save" | "insta" | "x", blob: Blob, late = false) => {
    setBusy(mode);
    try {
      const file = new File([blob], fileName, { type: "image/png" });
      // Phones only: laptops (Windows, macOS) also say they can share files, but their share dialog doesn't reach Instagram.
      if (mode !== "save" && canShare && navigator.canShare?.({ files: [file] })) {
        try {
          // Instagram drops the image when text rides along on some phones, so the story share sends the file alone.
          await navigator.share(
            mode === "insta" ? { files: [file] } : mode === "x" ? { files: [file], text: `${caption} ${link("x")}` } : { files: [file], title: BRAND.name, text: caption },
          );
          setDone(mode === "insta" ? "Pick Instagram, then Story" : mode === "x" ? "Pick X: the image rides along" : "Shared");
        } catch (e) {
          const name = (e as Error).name;
          // The render outlived the tap: the PNG is ready now, so the next tap goes straight through.
          if (name === "NotAllowedError" && late) setDone("Image ready · tap again to share");
          else if (name !== "AbortError") throw e;
        }
      } else if (mode === "insta") {
        save(blob);
        if (coarse.current) {
          setDone("Saved. Opening Instagram: add it from your camera roll");
          setTimeout(() => (location.href = "instagram://story-camera"), 600);
        } else {
          window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
          setDone("Saved. Stories are phone-only; on instagram.com, Create → drop the PNG in to post it");
        }
      } else {
        save(blob);
        setDone(`Saved ${size.out[0]}×${size.out[1]} PNG · ${(blob.size / 1024 / 1024).toFixed(1)} MB`);
      }
    } catch (e) {
      setErr((e as Error).message || "Couldn't render the image");
    } finally {
      setBusy(null);
    }
  };

  // X and Snapchat open from the click itself (no await first), so the browser doesn't block the new tab.
  // X only shows a link's preview image when it feels like it, so the image goes into the post itself: on a phone the
  // PNG, caption and link go through the share sheet (pick X); on desktop the PNG is put on the clipboard first and
  // pasting it into the post attaches it.
  const openLink = (t: "snap" | "x") => {
    sfx("tap");
    setErr(null);
    const ready = blobs.current[fmt];
    if (t === "x" && canShare && ready) {
      void deliver("x", ready);
      return;
    }
    let pasted = false;
    if (t === "x" && !coarse.current && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      try {
        void navigator.clipboard.write([new ClipboardItem({ "image/png": ready ?? prepare(fmt) })]).catch(() => {});
        pasted = true;
      } catch {}
    }
    const u = link(t);
    const href =
      t === "x"
        ? `https://x.com/intent/post?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(u)}`
        : `https://www.snapchat.com/share?link=${encodeURIComponent(u)}`;
    window.open(href, "_blank", "noopener,noreferrer");
    if (pasted) return setDone(`Image copied · paste it into your post (${/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl"}+V)`);
    setDone(linkable ? `Opened ${t === "x" ? "X" : "Snapchat"} · the link previews as ${mine ? "your" : "the"} card` : `Opened ${t === "x" ? "X" : "Snapchat"}`);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${caption} ${link("copy")}`);
      setDone("Link copied");
    } catch {
      setErr("Couldn't copy the link");
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
            {formats.map((f) => (
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
            {fmt === "story" ? (
              <Story ref={node} card={card} mine={mine} />
            ) : !result ? null : fmt === "receipt" ? (
              <Receipt ref={node} card={card} result={result} />
            ) : (
              <Square ref={node} card={card} result={result} />
            )}
          </div>
        </div>

        <div className="flex w-full max-w-[400px] flex-col gap-2">
          <div className="grid grid-cols-4 gap-2" data-share-targets>
            <Tile label="Story" sub="Instagram" busy={busy === "insta"} disabled={!!busy} onClick={() => { sfx("tap"); go("insta"); }}>
              <InstaIcon />
            </Tile>
            <Tile label="Snap" sub="Snapchat" disabled={!!busy} onClick={() => openLink("snap")}>
              <SnapIcon />
            </Tile>
            <Tile label="Post" sub="X" disabled={!!busy} onClick={() => openLink("x")}>
              <XIcon />
            </Tile>
            {canShare ? (
              <Tile label="More" sub="Share sheet" busy={busy === "share"} disabled={!!busy} onClick={() => { sfx("tap"); go("share"); }}>
                <MoreIcon />
              </Tile>
            ) : (
              <Tile label="Copy" sub="Link" disabled={!!busy} onClick={() => { sfx("tap"); copy(); }}>
                <LinkIcon />
              </Tile>
            )}
          </div>
          <div className="flex items-center justify-center gap-4 font-mono text-[11px] text-ink-2">
            <button onClick={() => go("save")} disabled={!!busy} className="underline-offset-4 hover:text-ink hover:underline disabled:opacity-60">
              {busy === "save" ? "Minting PNG…" : `Save ${SIZE[fmt].label.toLowerCase()} PNG`}
            </button>
            {canShare && (
              <>
                <span className="text-ink-3">·</span>
                <button onClick={copy} disabled={!!busy} className="underline-offset-4 hover:text-ink hover:underline disabled:opacity-60">
                  Copy link
                </button>
              </>
            )}
          </div>
          <p className="min-h-[18px] text-center font-mono text-[11px] text-ink-3" aria-live="polite" data-share-status>
            {err ? <span className="text-bad">{err}</span> : done ?? `${size.out[0]}×${size.out[1]} · made for ${size.for}`}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ share targets */

function Tile({ label, sub, busy, disabled, onClick, children }: { label: string; sub: string; busy?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      transition={SPRING}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label} · ${sub}`}
      className="group flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-card px-1 py-3 text-ink transition hover:border-accent/60 disabled:opacity-60"
    >
      <span className={`grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] transition group-hover:bg-accent group-hover:text-black ${busy ? "animate-pulse" : ""}`}>{children}</span>
      <span className="text-[12.5px] font-semibold leading-none">{busy ? "Minting…" : label}</span>
      <span className="font-mono text-[9px] uppercase leading-none tracking-[0.16em] text-ink-3">{sub}</span>
    </motion.button>
  );
}

const ICON = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

function InstaIcon() {
  return (
    <svg {...ICON}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
function SnapIcon() {
  return (
    <svg {...ICON}>
      <path d="M12 3.5c-3 0-5 2.2-5 5.1v2.3l-1.7.5c-.5.2-.5.8 0 1l1.6.6c-.6 1.7-1.8 3-3.4 3.6.4.8 1.6 1 2.6 1.1.2.6.3 1.2 1 1.1 1.6-.2 2.6.9 4.9.9s3.3-1.1 4.9-.9c.7.1.8-.5 1-1.1 1-.1 2.2-.3 2.6-1.1-1.6-.6-2.8-1.9-3.4-3.6l1.6-.6c.5-.2.5-.8 0-1l-1.7-.5V8.6c0-2.9-2-5.1-5-5.1Z" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg {...ICON} width={15} height={15} stroke="none" fill="currentColor">
      <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.36 5.77L17.75 3Zm-1.08 16.17h1.7L7.4 4.74H5.58l11.09 14.43Z" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg {...ICON}>
      <path d="M12 15V4M8 8l4-4 4 4M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg {...ICON}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
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

const Story = forwardRef<HTMLDivElement, { card: CardData; mine?: boolean }>(function Story({ card, mine = true }, ref) {
  const [t1, t2] = card.types;
  const a = t1?.a ?? "#a78bfa";
  const b = (t2 ?? t1)?.b ?? "#22d3ee";
  return (
    <div ref={ref} className="relative overflow-hidden text-ink" style={{ width: 360, height: 640, fontFamily: "var(--nf-sans), system-ui, sans-serif" }}>
      <Backdrop card={card} />
      {/* foil band: one holographic stripe running behind the card */}
      <div
        className="absolute left-[-20%] right-[-20%] top-[40%] h-[150px] -translate-y-1/2 -rotate-[8deg]"
        style={{
          background: `linear-gradient(90deg, transparent, ${a} 12%, #ffed5f 30%, #83fff7 48%, #d875ff 66%, ${b} 84%, transparent)`,
          opacity: 0.5,
          maskImage: "linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent)",
        }}
      />

      <div className="relative flex h-full flex-col items-center px-6 pb-7 pt-12">
        <div className="shrink-0" style={{ transform: "rotate(-6deg)", filter: "drop-shadow(0 30px 40px rgba(0,0,0,0.65))" }}>
          <HoloCard card={card} width={288} idle={false} still />
        </div>

        <div className="mt-auto flex w-full flex-col items-center text-center">
          <p className="font-serif text-[25px] leading-[1.08]" style={{ fontFamily: "var(--nf-serif), Georgia, serif" }}>
            {mine ? "I pulled" : "Spotted"} a <span style={{ color: a }}>{card.rarityLabel}</span>.
            <br />
            <span className="italic text-ink-2">{BRAND.question}</span>
          </p>
          <div className="mt-3 opacity-80">
            <Wordmark size={9} />
          </div>
        </div>
      </div>
    </div>
  );
});

/* Receiptify-style thermal printout, shared with the results page (components/card/Receipt.tsx). */
const Receipt = forwardRef<HTMLDivElement, { card: CardData; result: StyleResult }>(function Receipt({ card, result }, ref) {
  return (
    <div ref={ref} className="relative overflow-hidden" style={{ width: 360, height: 640, background: "#0b0b0e" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(70% 50% at 50% 45%, rgba(255,255,255,0.08), transparent 70%)" }} />
      <ReceiptPaper className="absolute left-1/2 top-[16px] w-[300px] -translate-x-1/2 rotate-[-1.2deg]">
        <ReceiptBody card={card} result={result} compact />
      </ReceiptPaper>
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
