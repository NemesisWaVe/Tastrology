import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The home-screen icon: the same mark as app/icon.svg, rasterised.
export default function AppleIcon() {
  const svg = readFileSync(join(process.cwd(), "app/icon.svg"), "utf8").replace('rx="14"', 'rx="0"');
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  // eslint-disable-next-line @next/next/no-img-element
  return new ImageResponse(<img src={src} width={180} height={180} alt="" />, size);
}
