import { useId } from "react";

/**
 * The Tastrology mark: a full moon with a bite taken out of it. Taste and the sky in one shape; the crumb that
 * flew off is a star. Solid lime so it still reads at 16px. Keep in sync with app/icon.svg.
 */
export const MARK_PATHS = {
  bites: [
    [53, 23, 8.5],
    [55.5, 34.5, 8.5],
    [51.5, 45.5, 8.5],
  ],
  moon: [29, 35, 23],
  star: "M55 3.5Q56 10 62 11Q56 12 55 18.5Q54 12 48 11Q54 10 55 3.5Z",
} as const;

export function Mark({ size = 20, className = "", color = "var(--accent, #c6ff3d)" }: { size?: number; className?: string; color?: string }) {
  const id = useId();
  const [cx, cy, r] = MARK_PATHS.moon;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <mask id={id}>
        <rect width="64" height="64" fill="#fff" />
        {MARK_PATHS.bites.map(([x, y, br]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={br} fill="#000" />
        ))}
      </mask>
      <circle cx={cx} cy={cy} r={r} fill={color} mask={`url(#${id})`} />
      <path d={MARK_PATHS.star} fill={color} />
    </svg>
  );
}
