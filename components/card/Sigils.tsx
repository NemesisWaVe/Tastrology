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
