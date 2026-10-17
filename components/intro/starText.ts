/**
 * Star targets in card-local coordinates (u, v in 0..1 of a 63:88 card):
 * a rounded-rect outline, and the "Tastrology" wordmark sampled from the site's
 * Instrument Serif italic into a dot matrix.
 */

export const CARD_AR = 63 / 88; // width / height
const RADIUS = 0.055; // of card width

/** Evenly spaced points along the rounded-rect perimeter, starting top-centre, clockwise. */
export function outlinePoints(n: number): Float32Array {
  const w = 1, h = 1 / CARD_AR, r = RADIUS;
  const straightW = w - 2 * r, straightH = h - 2 * r, arc = (Math.PI / 2) * r;
  const segs = [straightW / 2, arc, straightH, arc, straightW, arc, straightH, arc, straightW / 2];
  const total = segs.reduce((a, b) => a + b, 0);
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    let d = (i / n) * total, k = 0;
    while (k < segs.length - 1 && d > segs[k]) d -= segs[k++];
    let x = 0, y = 0;
    const corner = (cx: number, cy: number, a0: number) => {
      const a = a0 + (d / arc) * (Math.PI / 2);
      x = cx + Math.cos(a) * r;
      y = cy + Math.sin(a) * r;
    };
    switch (k) {
      case 0: x = 0.5 + d; y = 0; break;
      case 1: corner(w - r, r, -Math.PI / 2); break;
      case 2: x = w; y = r + d; break;
      case 3: corner(w - r, h - r, 0); break;
      case 4: x = w - r - d; y = h; break;
      case 5: corner(r, h - r, Math.PI / 2); break;
      case 6: x = 0; y = h - r - d; break;
      case 7: corner(r, r, Math.PI); break;
      default: x = r + d; y = 0;
    }
    out[i * 2] = x / w;
    out[i * 2 + 1] = y / h;
  }
  return out;
}

/** The site's serif family as next/font registered it (falls back to Georgia). */
export function serifFamily(): string {
  try {
    const v = getComputedStyle(document.body).getPropertyValue("--nf-serif").trim();
    return v || "Georgia, serif";
  } catch {
    return "Georgia, serif";
  }
}

/** Dot-matrix wordmark, ~`target` dots, centred in the card at width `span` (of card width). */
export function wordmarkPoints(target: number, family: string, span = 0.8, text = "Tastrology", thicken = 0.045): { pts: Float32Array; gap: number } {
  const fs = 180, pad = 24;
  const m0 = document.createElement("canvas").getContext("2d");
  if (!m0) return { pts: new Float32Array(0), gap: 0.015 };
  m0.font = `italic 400 ${fs}px ${family}`;
  const m = m0.measureText(text);
  // size the sampling canvas to the real ink box (italic overhang + g/y descenders), with padding
  const left = m.actualBoundingBoxLeft || 0, right = m.actualBoundingBoxRight || m.width;
  const asc = m.actualBoundingBoxAscent || fs * 0.75, desc = m.actualBoundingBoxDescent || fs * 0.3;
  const tw = left + right;
  const W = Math.ceil(tw + pad * 2), H = Math.ceil(asc + desc + pad * 2);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true });
  if (!x) return { pts: new Float32Array(0), gap: 0.015 };
  x.font = m0.font;
  x.fillStyle = "#fff";
  x.textBaseline = "alphabetic";
  x.textAlign = "left";
  x.fillText(text, pad + left, pad + asc);
  // thicken hairlines (the g and y tails) so the dot grid can't skip them
  x.strokeStyle = "#fff";
  x.lineWidth = fs * thicken;
  x.lineJoin = "round";
  x.strokeText(text, pad + left, pad + asc);
  const d = x.getImageData(0, 0, W, H).data;
  let ink = 0;
  for (let i = 3; i < d.length; i += 16) if (d[i] > 128) ink++;
  ink *= 4;
  const step = Math.max(2, Math.sqrt(ink / Math.max(1, target)));
  const pts: number[] = [];
  let row = 0;
  for (let y = step / 2; y < H; y += step * 0.88, row++) {
    for (let px = (row % 2 ? step / 2 : 0) + step / 4; px < W; px += step) {
      if (d[(((y | 0) * W + (px | 0)) << 2) + 3] > 128) {
        pts.push(0.5 + ((px - W / 2) / tw) * span, 0.5 + ((y - H / 2) / tw) * span * CARD_AR);
      }
    }
  }
  return { pts: new Float32Array(pts), gap: (step / tw) * span };
}
