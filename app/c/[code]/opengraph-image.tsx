import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BRAND } from "@/lib/brand";
import { getStyle } from "@/lib/cardStyle";
import { getTwinStatus, TWIN_CODE } from "@/lib/twins";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `A ${BRAND.name} taste card`;

/** Frame metal by tier. Holo and Secret get the foil, so a shared rare looks rare in the feed. */
const FRAME = {
  common: "linear-gradient(140deg, #e7eaee, #8a929c 30%, #f4f6f8 55%, #6b7280)",
  rare: "linear-gradient(135deg, #bae6fd, #38bdf8 45%, #e0f2fe)",
  holo: "linear-gradient(115deg, #ff7773, #ffed5f 18%, #a8ff5f 34%, #83fff7 50%, #7894ff 66%, #d875ff 82%, #ff7773)",
  secret: "linear-gradient(135deg, #fff1b8, #b7791f 22%, #fff6d6 44%, #8a5a12 64%, #f8dc84 82%, #a16207)",
} as const;
const GLOW = { common: "#c7ccd4", rare: "#7dd3fc", holo: "#c4b5fd", secret: "#fcd34d" } as const;

// The link preview for /c/<code>: the card's name, tier and Big Three, framed in its tier's metal.
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code).toUpperCase();
  const t = TWIN_CODE.test(code) ? await getTwinStatus(code).catch(() => null) : null;
  const card = t?.card ?? null;
  const st = card ? await getStyle(code).catch(() => null) : null;
  const svg = readFileSync(join(process.cwd(), "app/icon.svg"), "utf8").replace(/@media[^}]*\}\}/, "");
  const logo = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const tier = card?.rarity ?? "common";
  const label = card ? `${card.rarityLabel}${st?.rarityNo ? ` #${st.rarityNo}` : ""}` : "";
  const big = card ? ([["Sun", card.bigThree.sun.name], ["Moon", card.bigThree.moon.name], ["Rising", card.bigThree.rising.name]] as const) : [];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#08080c", color: "#f5f3ee", padding: 56, gap: 56, alignItems: "center" }}>
        <div style={{ display: "flex", padding: 10, borderRadius: 34, background: FRAME[tier], boxShadow: `0 0 80px ${GLOW[tier]}55` }}>
          <div style={{ width: 380, height: 498, borderRadius: 26, background: "#0d0d13", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 34 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, letterSpacing: 3, textTransform: "uppercase", color: "#9b9aa3" }}>
              <span>{BRAND.name}</span>
              <span style={{ color: GLOW[tier] }}>{label}</span>
            </div>
            <div style={{ display: "flex", fontSize: card && card.archetype.length > 18 ? 44 : 56, fontWeight: 700, lineHeight: 1.02, letterSpacing: -1 }}>{card?.archetype ?? "A taste card"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {big.map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #24242c", paddingTop: 10, fontSize: 22 }}>
                  <span style={{ color: "#9b9aa3" }}>{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={84} height={84} alt="" />
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1, letterSpacing: -2 }}>What&apos;s your taste sign?</div>
          <div style={{ display: "flex", fontSize: 28, color: "#b9b8c0" }}>{BRAND.tagline}</div>
          <div style={{ display: "flex", fontSize: 22, color: "#c6ff3d", letterSpacing: 2 }}>tastrology.vercel.app/c/{code}</div>
        </div>
      </div>
    ),
    size,
  );
}
