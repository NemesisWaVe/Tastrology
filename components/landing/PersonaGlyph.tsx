/**
 * Demo persona marks, drawn as constellation-plate line glyphs (docs/design/glyphs): a crescent with a lone star, a
 * compass star, and the astronomer's sun (a disc with its centre point, short detached rays). Line-only, currentColor.
 */
const GLYPHS: Record<string, React.ReactNode> = {
  soft: (
    <>
      <path d="M40 9A23 23 0 1 0 55 42A18 18 0 0 1 40 9Z" />
      <path d="M47 22V34M41 28H53" />
      <circle cx="53" cy="14" r="1.4" />
    </>
  ),
  neon: (
    <>
      <path d="M32 5C33 23 41 31 59 32C41 33 33 41 32 59C31 41 23 33 5 32C23 31 31 23 32 5Z" />
      <circle cx="32" cy="32" r="3.2" />
      <circle cx="13" cy="13" r="1.4" />
      <circle cx="51" cy="51" r="1.4" />
      <path d="M51 10V18M47 14H55" strokeWidth="1.6" />
    </>
  ),
  mumbai: (
    <>
      <circle cx="32" cy="32" r="12" />
      <circle cx="32" cy="32" r="2.4" fill="currentColor" />
      <path d="M32 15V9M32 49V55M15 32H9M49 32H55" />
      <path d="M44 20L46.5 17.5M44 44L46.5 46.5M20 20L17.5 17.5M20 44L17.5 46.5" strokeWidth="1.6" />
    </>
  ),
};

export function PersonaGlyph({ k, fallback, className = "" }: { k: string; fallback: string; className?: string }) {
  const g = GLYPHS[k];
  if (!g) return <>{fallback}</>;
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {g}
    </svg>
  );
}
