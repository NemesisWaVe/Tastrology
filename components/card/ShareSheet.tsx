"use client";
import { track } from "@/lib/telemetry";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { getFontEmbedCSS, toBlob } from "html-to-image";
import type { StyleResult } from "@/lib/types";
import { buildCard, cardCode, type CardData } from "@/lib/card";
import { BRAND } from "@/lib/brand";
import { playerCode } from "@/lib/player";
import { sfx } from "@/lib/sound";
import { HoloCard } from "./HoloCard";
import { Sparkle } from "./Sigils";
import { qr, qrPath } from "./qr";

/** One export everywhere: the 9:16 story (1080x1920), which also posts fine as a snap or a saved image. */
const SIZE = { w: 360, h: 640, out: [1080, 1920] as const };

const SPRING = { type: "spring" as const, stiffness: 500, damping: 28 };
let fontCSS: Promise<string> | null = null;

type App = "insta" | "snap";
/** A step the web can't take for the user, spelled out in the sheet: finish on the phone (QR), or where the copied
 *  link goes in the app (a Link sticker, the paperclip). */
type Note = { kind: "phone"; url: string } | { kind: "sticker"; app: App } | null;

const PHONE = /iPhone|iPad|iPod|Android|Mobi/i;

/**
 * Share sheet, the same on the result page and on /c/<code>: a live preview of the story image, then straight to a
 * platform.
 * - Instagram and Snapchat only post from the phone apps and take no link from the web: on a phone the PNG goes
 *   through the phone's share sheet with the fight link (/vs/<code>) on the clipboard for a Link sticker or the
 *   paperclip; on a laptop a QR opens this card on the phone with the sheet up.
 * - X and Copy share the card page link (/c/<code>), whose preview image is the full card
 *   (app/c/[code]/opengraph-image.tsx) and whose page leads visitors to the fight.
 * `linkable`: the card is filed on the server (live readings), so its links resolve for whoever taps them.
 * `mine` false (a visitor sharing someone's card) changes "I pulled" to "Spotted".
 */
export function ShareSheet({
  result,
  card: given,
  onClose,
  linkable = false,
  mine = true,
}: { onClose: () => void; linkable?: boolean; mine?: boolean } & ({ result: StyleResult; card?: undefined } | { card: CardData; result?: undefined })) {
  const card = useMemo(() => given ?? buildCard(result!), [given, result]);
  const code = cardCode(card);
  const [busy, setBusy] = useState<null | "save" | App>(null);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [vp, setVp] = useState({ w: 400, h: 800 });
  const node = useRef<HTMLDivElement>(null);
  const phone = useRef(false);

  useEffect(() => {
    sfx("whoosh");
    try {
      const f = new File([new Blob(["x"], { type: "image/png" })], "x.png", { type: "image/png" });
      // A phone by its user agent: touchscreen laptops report a coarse pointer too, and their share dialogs reach no app.
      phone.current = PHONE.test(navigator.userAgent);
      setCanShare(Boolean(navigator.canShare?.({ files: [f] })) && phone.current);
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

  // The preview gives way to a step card so the tiles stay on screen.
  const scale = Math.min(1, (Math.min(vp.w, 460) - 32) / SIZE.w, (vp.h - (note ? 430 : 250)) / SIZE.h);
  const fileName = `tastrology-${card.archetype.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;

  const render = useCallback(async (): Promise<Blob> => {
    const el = node.current;
    if (!el) throw new Error("Nothing to render");
    await document.fonts.ready;
    await Promise.all(
      [...el.querySelectorAll("img")].map((img) => (img.complete ? Promise.resolve() : new Promise((r) => ((img.onload = r), (img.onerror = r))))),
    );
    fontCSS ??= getFontEmbedCSS(el).catch(() => "");
    const opts = { pixelRatio: SIZE.out[0] / SIZE.w, width: SIZE.w, height: SIZE.h, backgroundColor: "#07070a", fontEmbedCSS: await fontCSS, cacheBust: false, includeQueryParams: true, filter: (n: HTMLElement) => !n.dataset?.exportSkip };
    // Early passes warm the image/font cache: WebKit (every iPhone browser) drops some images from the first draws
    // without failing, so it gets three passes; elsewhere a second pass only if the first came out thin.
    const webkit = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|Android/.test(navigator.userAgent));
    let blob = await toBlob(el, opts);
    for (let i = 0; i < (webkit ? 2 : 1); i++) if (webkit || !blob || blob.size < 60_000) blob = (await toBlob(el, opts)) ?? blob;
    if (!blob) throw new Error("Render failed");
    return blob;
  }, []);

  // Phones only open the share sheet straight after a tap, and a render takes a second or two: by then iOS refuses
  // (NotAllowedError) and Instagram never sees the image. So the image is rendered as soon as the sheet is up and the
  // tap shares the finished PNG at once.
  const blob = useRef<Blob | null>(null);
  const pending = useRef<Promise<Blob> | null>(null);
  const prepare = useCallback(() => {
    pending.current ??= render().then(
      (b) => (blob.current = b),
      (e) => {
        pending.current = null;
        throw e;
      },
    );
    return pending.current;
  }, [render]);
  useEffect(() => {
    const t = setTimeout(() => prepare().catch(() => {}), 450);
    return () => clearTimeout(t);
  }, [prepare]);

  // Warm the link preview while the sheet is open: the first render of /c/<code>/opengraph-image takes seconds, and
  // X's crawler gives up sooner and shows an empty box. The page names the exact (hashed) image URL X will ask for.
  useEffect(() => {
    if (!linkable) return;
    fetch(`/c/${encodeURIComponent(code)}`)
      .then((r) => r.text())
      .then((html) => {
        const m = /property="og:image" content="([^"]+)"/.exec(html);
        if (m) void fetch(m[1].replace(/&amp;/g, "&"), { mode: "no-cors" }).catch(() => {});
      })
      .catch(() => {});
  }, [linkable, code]);

  // Your player code rides on links to your own card: every share is also a friend invite (/f/<code>, lib/friends.ts).
  const [pc, setPc] = useState<string | null>(null);
  useEffect(() => {
    if (mine && linkable) void playerCode().then(setPc);
  }, [mine, linkable]);

  // Your own card asks a question a friend can only answer by minting theirs: the compare on /vs/<code>.
  const caption = mine && linkable ? `I'm ${card.archetype}. Are we taste twins?` : `Spotted a ${card.rarityLabel}: ${card.archetype}. ${linkable ? "Are you two taste twins?" : BRAND.question}`;
  /** The card page, tagged with where the visit came from. */
  const link = (src: string) => (typeof window === "undefined" ? "" : linkable ? `${location.origin}/c/${encodeURIComponent(code)}?via=${src}${pc ? `&f=${pc}` : ""}` : location.origin);
  /** The fight page: stories and snaps send viewers straight to it (mint yours, battle this one). */
  const fight = (src: string) => link(src).replace("/c/", "/vs/");

  const save = (b: Blob) => {
    const url = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const go = (mode: "save" | App) => {
    setErr(null);
    setDone(null);
    setNote(null);
    // Ready: hand it over inside this tap (no await before navigator.share).
    if (blob.current) return deliver(mode, blob.current);
    setBusy(mode);
    prepare().then(
      (b) => deliver(mode, b, true),
      (e) => {
        setErr((e as Error).message || "Couldn't make the image");
        setBusy(null);
      },
    );
  };

  const deliver = async (mode: "save" | App, b: Blob, late = false) => {
    setBusy(mode);
    try {
      const file = new File([b], fileName, { type: "image/png" });
      if (mode !== "save" && canShare && navigator.canShare?.({ files: [file] })) {
        // The phone orders its sheet (most-messaged people first), so say where to look before it opens.
        setDone(mode === "insta" ? "Pick Instagram, then Stories" : "Pick Snapchat");
        try {
          // Instagram and Snapchat take the picture as the post itself and drop it on some phones when text rides along.
          await navigator.share({ files: [file] });
          track("shared");
        } catch (e) {
          const name = (e as Error).name;
          // The render outlived the tap: the PNG is ready now, so the next tap goes straight through.
          if (name === "NotAllowedError" && late) setDone("Image ready · tap again to share");
          else if (name !== "AbortError") throw e;
        }
      } else {
        save(b);
        if (mode === "insta" && phone.current) {
          setDone("Saved · opening Instagram, add it from your camera roll");
          setTimeout(() => (location.href = "instagram://story-camera"), 600);
        } else setDone(mode === "save" ? "Image saved" : "Saved · add it from your camera roll");
      }
    } catch (e) {
      setErr((e as Error).message || "Couldn't make the image");
    } finally {
      setBusy(null);
    }
  };

  // On a phone: the fight link goes onto the clipboard in this tap and the step card says where it goes before the
  // share sheet covers everything; its button starts the share. On a laptop: a QR that opens this card on the phone
  // with the sheet up (/c/<code>?share=1).
  const toApp = (app: App) => {
    sfx("tap");
    setErr(null);
    setDone(null);
    if (canShare) {
      if (linkable && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(fight(app)).catch(() => {});
        return setNote({ kind: "sticker", app });
      }
      return go(app);
    }
    if (!linkable) return go("save");
    setNote({ kind: "phone", url: `${location.origin}/c/${encodeURIComponent(code)}?share=1` });
  };

  // X takes the link alone: its preview is the full card and opens the card page when tapped (an attached image would
  // replace that preview). On a phone the X app's own scheme opens the compose box (x.com in Safari lands on a login).
  const postX = () => {
    track("shared");
    sfx("tap");
    setErr(null);
    setNote(null);
    const text = `${caption} ${fight("x")}`;
    if (PHONE.test(navigator.userAgent)) {
      setDone("Opening X");
      location.href = `twitter://post?message=${encodeURIComponent(text)}`;
      return;
    }
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    setDone(linkable ? "Opened X · your card shows as the link's preview" : "Opened X");
  };

  const copy = async () => {
    sfx("tap");
    setNote(null);
    try {
      await navigator.clipboard.writeText(`${caption} ${fight("copy")}`);
      track("shared");
      setDone("Link copied");
    } catch {
      setErr("Couldn't copy the link");
    }
  };

  const title = mine ? "Are we taste twins?" : "Share this card";
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 backdrop-blur-md sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div
        className="rise flex max-h-[100dvh] w-full flex-col items-center gap-4 overflow-y-auto rounded-t-[28px] border border-line bg-paper px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:w-auto sm:rounded-[28px] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-full max-w-[400px] items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-serif text-[22px] italic leading-none text-ink">{title}</p>
            <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">{linkable ? "they mint theirs, you both get a score" : "story, snap, or x"}</p>
          </div>
          <CloseButton onClick={onClose} label="Close" />
        </div>

        <div className="relative shrink-0 overflow-hidden rounded-[18px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-line" style={{ width: SIZE.w * scale, height: SIZE.h * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width: SIZE.w, height: SIZE.h }}>
            <Story ref={node} card={card} mine={mine} href={linkable ? fight("img").replace(/^https?:\/\//, "").replace(/\?.*$/, "") : undefined} code={code} />
          </div>
        </div>

        <div className="flex w-full max-w-[400px] flex-col gap-2">
          <AnimatePresence>{note && <NoteCard key={note.kind} note={note} onSave={() => go("save")} onShare={go} onClose={() => setNote(null)} />}</AnimatePresence>
          <div className="grid grid-cols-4 gap-2" data-share-targets>
            <Tile label="Instagram" sub="story" busy={busy === "insta"} disabled={!!busy} onClick={() => toApp("insta")}>
              <InstaIcon />
            </Tile>
            <Tile label="Snapchat" sub="snap" busy={busy === "snap"} disabled={!!busy} onClick={() => toApp("snap")}>
              <SnapIcon />
            </Tile>
            <Tile label="X" sub="post" disabled={!!busy} onClick={postX}>
              <XIcon />
            </Tile>
            <Tile label="Copy" sub="link" disabled={!!busy} onClick={copy}>
              <LinkIcon />
            </Tile>
          </div>
          <div className="flex min-h-[20px] items-center justify-between gap-3 px-1 font-mono text-[11px]">
            <button onClick={() => go("save")} disabled={!!busy} className="shrink-0 text-ink-2 underline-offset-4 hover:text-ink hover:underline disabled:opacity-60">
              {busy === "save" ? "Saving…" : "Save image"}
            </button>
            <p className="min-w-0 truncate text-right text-ink-3" aria-live="polite" data-share-status>
              {err ? <span className="text-bad">{err}</span> : done}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ share targets */

function CloseButton({ onClick, label, small = false }: { onClick: () => void; label: string; small?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} className={`grid shrink-0 place-items-center rounded-full text-ink-2 transition hover:text-ink ${small ? "h-8 w-8 hover:bg-white/10" : "h-10 w-10 border border-line hover:border-ink-3"}`}>
      <svg width={small ? 12 : 14} height={small ? 12 : 14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <path d="M2 2l10 10M12 2L2 12" />
      </svg>
    </button>
  );
}

/** The one step-card shape: optional QR, a serif title, numbered steps, one lime button, a quiet fallback. */
function NoteCard({ note, onSave, onShare, onClose }: { note: NonNullable<Note>; onSave: () => void; onShare: (app: App) => void; onClose: () => void }) {
  const code = useMemo(() => (note.kind === "phone" ? (() => { const m = qr(note.url); return { q: m.length + 8, d: qrPath(m) }; })() : null), [note]);
  const insta = note.kind === "sticker" && note.app === "insta";
  const view =
    note.kind === "phone"
      ? { title: "Finish on your phone", steps: ["Scan this with your phone camera", "Tap Instagram or Snapchat there"], action: null }
      : insta
        ? { title: "Link copied", steps: ["Share, then Instagram, then Stories", "Stickers, then Link, then paste", "Rename it “Find out”, drag it under the card"], action: "Share to Instagram" }
        : { title: "Link copied", steps: ["Share, then Snapchat", "Tap the paperclip, then paste"], action: "Share to Snapchat" };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={SPRING}
      className="relative flex items-start gap-4 rounded-2xl border border-accent/50 bg-accent/10 p-3.5 pr-10 text-left"
      data-share-note={note.kind}
    >
      {code && (
        <svg viewBox={`-4 -4 ${code.q} ${code.q}`} shapeRendering="crispEdges" className="h-[104px] w-[104px] shrink-0 rounded-lg" role="img" aria-label="QR code: open this card on your phone">
          <rect x="-4" y="-4" width={code.q} height={code.q} fill="#fff" />
          <path d={code.d} />
        </svg>
      )}
      <div className="min-w-0">
        <p className="font-serif text-[19px] italic leading-tight text-ink">{view.title}</p>
        <ol className="mt-2 flex flex-col gap-1.5">
          {view.steps.map((t, i) => (
            <li key={t} className="flex items-start gap-2.5 text-[13px] leading-snug text-ink-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink font-mono text-[10.5px] font-semibold text-paper">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {view.action && note.kind === "sticker" && (
            <button onClick={() => onShare(note.app)} className="rounded-full bg-accent px-4 py-2 text-[13.5px] font-semibold text-black">
              {view.action} →
            </button>
          )}
          <button onClick={onSave} className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3 underline-offset-4 hover:text-ink hover:underline">
            or save image
          </button>
        </div>
      </div>
      <div className="absolute right-1.5 top-1.5">
        <CloseButton onClick={onClose} label="Dismiss" small />
      </div>
    </motion.div>
  );
}

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
      <span className="text-[12.5px] font-semibold leading-none">{busy ? "Saving…" : label}</span>
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
}function LinkIcon() {
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
/** 9:16 for Instagram Stories and Snapchat (360x640, exported at 3x). Laid out around their UI: the top ~84px sits under
 *  the progress bar and the bottom ~110px under the reply bar, so both hold nothing that matters. The gap under the card
 *  is left clear for the Link sticker the user pastes; the preview plays a short guide to putting it there. */
const Story = forwardRef<HTMLDivElement, { card: CardData; mine?: boolean; href?: string; code?: string }>(function Story({ card, mine = true, href, code }, ref) {
  const [t1, t2] = card.types;
  const a = t1?.a ?? "#a78bfa";
  const b = (t2 ?? t1)?.b ?? "#22d3ee";
  return (
    <div ref={ref} className="relative overflow-hidden text-ink" style={{ width: 360, height: 640, fontFamily: "var(--nf-sans), system-ui, sans-serif" }}>
      <Backdrop card={card} />
      {/* foil band: one holographic stripe running behind the card */}
      <div
        className="absolute left-[-20%] right-[-20%] top-[48%] h-[150px] -translate-y-1/2 -rotate-[8deg]"
        style={{
          background: `linear-gradient(90deg, transparent, ${a} 12%, #ffed5f 30%, #83fff7 48%, #d875ff 66%, ${b} 84%, transparent)`,
          opacity: 0.5,
          maskImage: "linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent)",
        }}
      />

      <p className="absolute inset-x-0 top-[92px] px-6 text-center font-serif text-[32px] leading-[1.05]" style={{ fontFamily: "var(--nf-serif), Georgia, serif" }}>
        {mine ? "I pulled" : "Spotted"} a <span style={{ color: a }}>{card.rarityLabel}</span>.
        <br />
        <span className="italic text-ink-2">{href ? (mine ? "Are we taste twins?" : "Can yours beat it?") : BRAND.question}</span>
      </p>

      <div className="absolute left-1/2 top-[184px]" style={{ transform: "translateX(-50%) rotate(-6deg)", filter: "drop-shadow(0 30px 40px rgba(0,0,0,0.65))" }}>
        <HoloCard card={card} width={176} idle={false} still />
      </div>

      <div className="absolute inset-x-0 top-[522px] flex justify-center opacity-50">
        <Wordmark size={9} />
      </div>
      {href && code && <StickerGuide link={href} />}
    </div>
  );
});

/** Preview only (left out of the export): a looping walk-through of adding the Link sticker in Instagram. Tap
 *  Stickers, pick Link, paste the copied link, then drag the sticker into the gap under the card. Coordinates are the
 *  story's own 360x640. */
const GUIDE = [
  { t: "Tap Stickers", ms: 1500 },
  { t: "Pick Link", ms: 1500 },
  { t: "Paste the link", ms: 1800 },
  { t: "Rename it “Find out”", ms: 1500 },
  { t: "Drag it under the card", ms: 2600 },
];
function StickerGuide({ link }: { link: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setStep((s) => (s + 1) % GUIDE.length), GUIDE[step].ms);
    return () => clearTimeout(t);
  }, [step]);
  const tap = (x: number, y: number) => (
    <motion.span
      key={`tap-${x}-${y}`}
      className="absolute h-7 w-7 rounded-full border-2 border-white bg-white/30"
      style={{ left: x - 14, top: y - 14 }}
      initial={{ scale: 1.6, opacity: 0 }}
      animate={{ scale: [1.6, 0.8, 1], opacity: [0, 1, 0.9] }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, delay: 0.4 }}
    />
  );
  return (
    <div data-export-skip className="pointer-events-none absolute inset-0" aria-hidden>
      {/* the stickers button, where Instagram puts it */}
      <div className="absolute right-[14px] top-[34px] grid h-9 w-9 place-items-center rounded-full bg-black/55 ring-1 ring-white/25">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3H8a5 5 0 0 0-5 5v8a5 5 0 0 0 5 5h5l8-8V8a5 5 0 0 0-5-5z" />
          <path d="M13 21v-3a5 5 0 0 1 5-5h3M9 10h.01M15 10h.01" />
        </svg>
      </div>

      <AnimatePresence>
        {step === 0 && tap(328, 52)}
        {(step === 1 || step === 2) && <motion.div key="dim" className="absolute inset-0 bg-black/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />}
        {step === 1 && (
          <motion.div
            key="tray"
            className="absolute inset-x-0 bottom-0 rounded-t-[22px] bg-[#1c1c22] px-5 pb-16 pt-4 ring-1 ring-white/10"
            initial={{ y: 260 }}
            animate={{ y: 0 }}
            exit={{ y: 260 }}
            transition={SPRING}
          >
            <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-white/25" />
            <div className="flex flex-wrap justify-center gap-2">
              {["Location", "Mention", "Link", "Poll", "Music", "Question"].map((c) => (
                <span key={c} className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold uppercase ${c === "Link" ? "bg-white text-[#2563eb] ring-2 ring-accent" : "bg-white/10 text-white/80"}`}>
                  {c}
                </span>
              ))}
            </div>
          </motion.div>
        )}
        {step === 1 && tap(239, 524)}
        {step === 2 && (
          <motion.div key="url" className="absolute inset-x-6 top-[230px] rounded-2xl bg-[#1c1c22] p-4 ring-1 ring-white/10" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">URL</p>
            <div className="relative mt-1.5 h-[34px] rounded-lg bg-white/10 px-3 py-2 font-mono text-[11px] text-white">
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
                {link}
              </motion.span>
              <motion.span
                className="absolute -top-8 left-2 rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-black shadow-lg"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1.1, times: [0, 0.15, 0.8, 1], delay: 0.1 }}
              >
                Paste
              </motion.span>
            </div>
          </motion.div>
        )}
        {step === 2 && tap(44, 300)}
        {step >= 3 && (
          <motion.div
            key="sticker"
            className="absolute left-1/2 flex items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-white px-3 py-2 text-[13px] font-bold uppercase tracking-tight text-[#2563eb] shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
            style={{ x: "-50%" }}
            initial={{ top: 300, scale: 0.6, opacity: 0 }}
            animate={step === 4 ? { top: 462, scale: 1, opacity: 1 } : { top: 300, scale: 1.08, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={step === 4 ? { type: "spring", stiffness: 120, damping: 18, delay: 0.25 } : SPRING}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1" />
            </svg>
            Find out
          </motion.div>
        )}
        {step === 4 && (
          <motion.span
            key="drag"
            className="absolute h-7 w-7 rounded-full border-2 border-white bg-white/30"
            style={{ left: 166 }}
            initial={{ top: 300, opacity: 0 }}
            animate={{ top: [300, 300, 468, 468], opacity: [0, 1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.7, times: [0, 0.15, 0.75, 1] }}
          />
        )}
      </AnimatePresence>

      {/* step caption, in the strip the app covers anyway */}
      <div className="absolute inset-x-0 bottom-[22px] flex justify-center">
        <AnimatePresence mode="wait">
          <motion.span
            key={step}
            className="flex items-center gap-2 rounded-full bg-black/75 py-1.5 pl-1.5 pr-3.5 text-[12px] font-semibold text-white ring-1 ring-white/15"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-accent font-mono text-[10.5px] text-black">{step + 1}</span>
            {GUIDE[step].t}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}
