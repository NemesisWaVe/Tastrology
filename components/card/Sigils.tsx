/** Hand-drawn SVG sigils, so the astrology marks render identically everywhere (no font or emoji fallback). */

export type SigilKind = "sun" | "moon" | "rising";

export function Sigil({ kind, className, title }: { kind: SigilKind; className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      {kind === "sun" && (
        <>
          <circle cx="12" cy="12" r="8.2" />
          <circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none" />
        </>
      )}
      {kind === "moon" && <path d="M15.8 3.6a8.6 8.6 0 1 0 0 16.8a7 7 0 0 1 0-16.8z" />}
      {kind === "rising" && (
        <>
          <path d="M3 17.5h18" />
          <path d="M12 14V4.5" />
          <path d="M8 8.5l4-4l4 4" />
          <path d="M6.5 20.5h11" opacity={0.55} />
        </>
      )}
    </svg>
  );
}

export function Sparkle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 0C12.9 7.6 16.4 11.1 24 12C16.4 12.9 12.9 16.4 12 24C11.1 16.4 7.6 12.9 0 12C7.6 11.1 11.1 7.6 12 0Z" fill="currentColor" />
    </svg>
  );
}

/* ----------------------------------------------------------------------------------------------
 * Type sigils: one line-drawn mark per aesthetic family, keyed by the CardType.glyph character
 * (lib/card.ts keeps the glyph as a stable id; it is never rendered as text on the card).
 * -------------------------------------------------------------------------------------------- */

const TYPE_PATHS: Record<string, React.ReactNode> = {
  // futurist / tech: split bolt
  "⚡": <path d="M13.5 2.5L5.5 13.5h6l-1 8l8-11h-6z" />,
  // floral: five petals
  "✿": (
    <>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="12" cy="7" rx="2.6" ry="4.2" transform={`rotate(${a} 12 12)`} />
      ))}
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  // vintage: dial
  "◷": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.2 2" />
      <path d="M12 3.5v1.4M20.5 12h-1.4M12 20.5v-1.4M3.5 12h1.4" opacity={0.6} />
    </>
  ),
  // minimal: ring + rule
  "◯": (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M3 12h4.5M16.5 12H21" opacity={0.6} />
    </>
  ),
  // boho / craft: woven knot
  "❋": (
    <>
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
  // edgy: sharp four-point star
  "✦": <path d="M12 2.5l2.2 7.3l7.3 2.2l-7.3 2.2L12 21.5l-2.2-7.3L2.5 12l7.3-2.2z" />,
  // utility / sport: peak
  "▲": (
    <>
      <path d="M2.5 19.5L9.5 7l4 6.5l2.5-3.5l5.5 9.5z" />
      <path d="M7.4 10.7l2.1 1.6l1.6-1.5" opacity={0.6} />
    </>
  ),
  // luxe: cut gem
  "◆": (
    <>
      <path d="M6 4.5h12l3.5 5L12 20.5L2.5 9.5z" />
      <path d="M2.5 9.5h19M9 4.5l-1.5 5L12 20.5l4.5-11L15 4.5" opacity={0.6} />
    </>
  ),
  // playful: pinwheel
  "☻": (
    <>
      <path d="M12 12V3.5a4.2 4.2 0 0 1 0 8.5z" />
      <path d="M12 12h8.5a4.2 4.2 0 0 1-8.5 0z" />
      <path d="M12 12v8.5a4.2 4.2 0 0 1 0-8.5z" />
      <path d="M12 12H3.5a4.2 4.2 0 0 1 8.5 0z" />
    </>
  ),
  // avant-garde: half-lit disc
  "◐": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none" />
    </>
  ),
  // tailored / heritage: crest
  "♜": (
    <>
      <path d="M5 3.5h14v7.5c0 5-3.5 8-7 9.5c-3.5-1.5-7-4.5-7-9.5z" />
      <path d="M12 7v9M8.5 10.5h7" opacity={0.65} />
    </>
  ),
  // organic: leaf
  "❦": (
    <>
      <path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16z" />
      <path d="M4 20L14 10" opacity={0.65} />
    </>
  ),
};

const FALLBACK = (
  <>
    <path d="M12 3.5c.6 4.6 3.9 7.9 8.5 8.5c-4.6.6-7.9 3.9-8.5 8.5c-.6-4.6-3.9-7.9-8.5-8.5c4.6-.6 7.9-3.9 8.5-8.5z" />
  </>
);

/** Line sigil for an aesthetic type (pass CardType.glyph). */
export function TypeSigil({ glyph, className, style }: { glyph: string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {TYPE_PATHS[glyph.replace("︎", "")] ?? FALLBACK}
    </svg>
  );
}

const KIND_PATHS: Record<string, React.ReactNode> = {
  artist: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  movie: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <path d="M7.5 5v14M16.5 5v14M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4" opacity={0.65} />
    </>
  ),
  tv_show: (
    <>
      <rect x="3" y="6" width="18" height="12.5" rx="2" />
      <path d="M9 2.5l3 3.5l3-3.5M8 21h8" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.5c-2-1.6-5-2-8.5-1.5v13c3.5-.5 6.5-.1 8.5 1.5c2-1.6 5-2 8.5-1.5V5c-3.5-.5-6.5-.1-8.5 1.5z" />
      <path d="M12 6.5v13" opacity={0.65} />
    </>
  ),
  place: (
    <>
      <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </>
  ),
  podcast: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  videogame: (
    <>
      <path d="M7 7.5h10a4.5 4.5 0 0 1 4.3 5.8l-1 3.2a2.3 2.3 0 0 1-4 .7l-1.6-2.2h-5.4l-1.6 2.2a2.3 2.3 0 0 1-4-.7l-1-3.2A4.5 4.5 0 0 1 7 7.5z" />
      <path d="M8 10.5v3M6.5 12h3M15.5 11h.01M17.5 13h.01" />
    </>
  ),
};

/** Line sigil for a seed domain (artist, movie, tv_show, book, place, podcast, videogame). */
export function KindSigil({ kind, className }: { kind: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {KIND_PATHS[kind] ?? FALLBACK}
    </svg>
  );
}
