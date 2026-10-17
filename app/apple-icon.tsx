import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The home-screen icon: the app/icon.svg cutout on a solid night tile (iOS needs an opaque icon).
export default function AppleIcon() {
  const svg = readFileSync(join(process.cwd(), "app/icon.svg"), "utf8").replace(/@media[^}]*\}\}/, "");
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, background: "#08080c", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={140} height={140} alt="" />
      </div>
    ),
    size,
  );
}
