/**
 * Phone tilt as -1..1 on each axis. Full range is reached at RANGE degrees from how the phone is being held, not
 * from a fixed angle: the rest pose is learned from the first readings and follows slowly, so a phone held upright,
 * flat or anywhere between reacts to a small turn the same way.
 */
const RANGE = 12;
/** How fast the rest pose follows the hand (per event, ~60/s): slow enough that a deliberate tilt holds. */
const FOLLOW = 0.012;

export function tiltReader(range = RANGE) {
  let rest: { b: number; g: number } | null = null;
  return (e: DeviceOrientationEvent): { x: number; y: number } | null => {
    if (e.gamma == null || e.beta == null) return null;
    if (!rest) rest = { b: e.beta, g: e.gamma };
    rest.b += (e.beta - rest.b) * FOLLOW;
    rest.g += (e.gamma - rest.g) * FOLLOW;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    return { x: clamp((e.gamma - rest.g) / range), y: clamp((e.beta - rest.b) / range) };
  };
}
