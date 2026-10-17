import { useId } from "react";

/**
 * The Tastrology mark: a card with the Big Dipper cut clean through it. The Dipper is a spoon, so taste and the sky
 * are one shape; the cut runs out of the card's corner and its last star breaks free as a spark. Bold on purpose:
 * it fills its box and reads at 16px. Keep in sync with app/icon.svg.
 */
const CUT = "M14 47 L22 56 L33 52.5 L31 42 Z M31 42 L35.5 33 L39 24 L47 15";
const HOLES = [
  [14, 47, 4.2],
  [22, 56, 4.2],
  [33, 52.5, 4.6],
  [31, 42, 4.2],
  [35.5, 33, 3.8],
  [39, 24, 3.8],
] as const;
const SPARK = "M50 4 L53.2 10.8 L60 14 L53.2 17.2 L50 24 L46.8 17.2 L40 14 L46.8 10.8 Z";

export function Mark({ size = 30, className = "", color = "var(--accent, #c6ff3d)" }: { size?: number; className?: string; color?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="-2.5 -3.3 67 67" className={className} aria-hidden>
      <g transform="translate(0.5 -3.5) rotate(-7 30 36)">
        <mask id={id} maskUnits="userSpaceOnUse" x="-10" y="-10" width="84" height="84">
          <rect x="-10" y="-10" width="84" height="84" fill="#fff" />
          <path d={CUT} fill="none" stroke="#000" strokeWidth="3.4" strokeLinejoin="round" strokeLinecap="round" />
          {HOLES.map(([x, y, r]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#000" />
          ))}
        </mask>
        <rect x="5" y="15" width="40" height="49" rx="6" fill={color} mask={`url(#${id})`} />
        <path d={SPARK} fill={color} />
      </g>
    </svg>
  );
}
