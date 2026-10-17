import { useId } from "react";

/**
 * The Tastrology mark: a card with the Big Dipper punched through it. The Dipper is a spoon, so taste and the sky
 * are one shape; its last star breaks out of the card as a spark. Keep in sync with app/icon.svg.
 */
const LINE = "M15 44 L22 53 L32 50 L30 40 Z M30 40 L34.5 32.5 L38 25 L50 11";
const HOLES = [
  [15, 44, 3],
  [22, 53, 3],
  [32, 50, 3.4],
  [30, 40, 3],
  [34.5, 32.5, 2.7],
  [38, 25, 2.7],
] as const;
const SPARK = "M50 2.5Q51.2 9.8 58.5 11Q51.2 12.2 50 19.5Q48.8 12.2 41.5 11Q48.8 9.8 50 2.5Z";

export function Mark({ size = 20, className = "", color = "var(--accent, #c6ff3d)" }: { size?: number; className?: string; color?: string }) {
  const id = useId();
  const card = { x: 10, y: 12, width: 34, height: 47, rx: 5 };
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <mask id={`${id}c`} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
        <rect width="64" height="64" fill="#fff" />
        <path d={LINE} fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {HOLES.map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#000" />
        ))}
      </mask>
      <mask id={`${id}o`} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
        <rect width="64" height="64" fill="#fff" />
        <rect {...card} fill="#000" />
      </mask>
      <g transform="rotate(-8 30 34) translate(1 1)">
        <rect {...card} fill={color} mask={`url(#${id}c)`} />
        <path d={LINE} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" mask={`url(#${id}o)`} />
        <path d={SPARK} fill={color} />
      </g>
    </svg>
  );
}
