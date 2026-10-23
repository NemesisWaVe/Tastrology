import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BRAND } from "@/lib/brand";
import { cardNo, type CardData } from "@/lib/card";
import { getStyle } from "@/lib/cardStyle";
import { getTwinStatus, TWIN_CODE } from "@/lib/twins";
import { isAllowedImageUrl } from "@/app/api/img/allow";
import { maskRude } from "@/lib/guard";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `A ${BRAND.name} taste card`;

/** Frame metal by tier. Common and Rare take the card's own type colours, like the live card. */
const FOIL = {
  holo: "linear-gradient(115deg, #ff7773, #ffed5f 18%, #a8ff5f 34%, #83fff7 50%, #7894ff 66%, #d875ff 82%, #ff7773)",
  secret: "linear-gradient(135deg, #fff1b8, #b7791f 22%, #fff6d6 44%, #8a5a12 64%, #f8dc84 82%, #a16207)",
} as const;
const INK = "#f5f3ee";
const INK2 = "#b9b8c0";
const INK3 = "#7d7c86";
const LIME = "#c6ff3d";

type Font = { name: string; data: Buffer; style: "normal" | "italic"; weight: 400 | 500 | 600 | 700 };

/** Bundled TrueType (OFL fonts, ./og-fonts): read from disk, not fetched, so a cold render stays inside X's patience. */
const FACES: [file: string, name: string, weight: Font["weight"], style: Font["style"]][] = [
  ["InstrumentSerif-400-normal.ttf", "Serif", 400, "normal"],
  ["InstrumentSerif-400-italic.ttf", "Serif", 400, "italic"],
  ["BricolageGrotesque-600-normal.ttf", "Sans", 600, "normal"],
  ["BricolageGrotesque-700-normal.ttf", "Sans", 700, "normal"],
  ["JetBrainsMono-500-normal.ttf", "Mono", 500, "normal"],
];
let fonts: Font[] | null = null;
function loadFonts(): Font[] {
  if (fonts) return fonts;
  const dir = join(process.cwd(), "app/c/[code]/og-fonts");
  fonts = FACES.flatMap(([file, name, weight, style]) => {
    try {
      return [{ name, data: readFileSync(join(dir, file)), weight, style }];
    } catch {
      return [];
    }
  });
  return fonts;
}

/** A card colour at an alpha. Type colours come as hex or as hsl()/rgb(), and the renderer rejects "hsl(...)88". */
function alpha(c: string, a: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) return `#${hex[1]}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
  const fn = /^(hsl|rgb)a?\(([^)]+)\)$/i.exec(c.trim());
  if (fn) {
    const parts = fn[2].replace(/\s*\/.*$/, "").split(/[\s,]+/).filter(Boolean);
    return `${fn[1].toLowerCase()}a(${parts.join(", ")}, ${a})`;
  }
  return c;
}

/** The card's seed art as data URLs (Qloo's CDN only, JPEG/PNG only, 1.5s each); anything else is skipped. */
async function artOf(card: CardData): Promise<string[]> {
  const raw = card.art
    .map((a) => {
      try {
        return new URL(a, "https://x.invalid").searchParams.get("u") ?? a;
      } catch {
        return a;
      }
    })
    .filter(isAllowedImageUrl)
    .slice(0, 4);
  const got = await Promise.all(
    raw.map(async (u) => {
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(1500) });
        const type = r.headers.get("content-type") ?? "";
        if (!r.ok || !/^image\/(jpeg|png)/.test(type)) return null;
        const buf = Buffer.from(await r.arrayBuffer());
        return buf.length > 1_500_000 ? null : `data:${type};base64,${buf.toString("base64")}`;
      } catch {
        return null;
      }
    }),
  );
  return got.filter((x): x is string => Boolean(x));
}

// The link preview for /c/<code>: the card itself (art, constellation, score, Big Three, brands), tilted on its own
// colours, with the question beside it. X and the rest make the whole image the tap target for the link.
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code).toUpperCase();
  const t = TWIN_CODE.test(code) ? await getTwinStatus(code).catch(() => null) : null;
  const card = t?.card ?? null;
  const [st, f, art] = await Promise.all([card ? getStyle(code).catch(() => null) : null, loadFonts(), card ? artOf(card) : []]);
  const has = (n: string) => f.some((x) => x.name === n);
  const serif = has("Serif") ? "Serif" : undefined;
  const sans = has("Sans") ? "Sans" : undefined;
  const mono = has("Mono") ? "Mono" : undefined;
  const svg = readFileSync(join(process.cwd(), "app/icon.svg"), "utf8").replace(/@media[^}]*\}\}/, "");
  const logo = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  if (!card) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 24, padding: 80, background: "#07070a", color: INK, fontFamily: sans }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={84} height={84} alt="" />
          <div style={{ display: "flex", fontSize: 72, fontFamily: serif, fontStyle: "italic" }}>What&apos;s your taste sign?</div>
          <div style={{ display: "flex", fontSize: 28, color: INK2 }}>{BRAND.tagline}</div>
        </div>
      ),
      { ...size, fonts: f },
    );
  }

  const [t1, t2] = card.types;
  const a = t1?.a ?? "#a78bfa";
  const b = (t2 ?? t1)?.b ?? "#22d3ee";
  const frame = card.rarity === "holo" || card.rarity === "secret" ? FOIL[card.rarity] : `linear-gradient(140deg, ${a}, ${b} 55%, ${a})`;
  const label = `${card.rarityLabel}${st?.rarityNo ? ` #${st.rarityNo}` : ""}`;
  const stars = [...(card.stars ?? [])].sort((p, q) => p.x - q.x);
  const big = [
    ["Sun", card.bigThree.sun],
    ["Moon", card.bigThree.moon],
    ["Rising", card.bigThree.rising],
  ] as const;
  const tiles = art.length ? art : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          color: INK,
          fontFamily: sans,
          backgroundColor: "#07070a",
          backgroundImage: `radial-gradient(60% 80% at 22% 50%, ${alpha(a, 0.33)}, transparent 70%), radial-gradient(50% 60% at 100% 0%, ${alpha(b, 0.25)}, transparent 70%), radial-gradient(40% 50% at 70% 100%, ${alpha(a, 0.19)}, transparent 70%)`,
        }}
      >
        {/* the card */}
        <div style={{ display: "flex", marginLeft: 70, transform: "rotate(-5deg)", padding: 7, borderRadius: 30, backgroundImage: frame, boxShadow: `0 30px 80px rgba(0,0,0,0.7), 0 0 70px ${alpha(a, 0.33)}` }}>
          <div style={{ width: 392, height: 548, display: "flex", flexDirection: "column", borderRadius: 24, backgroundColor: "#121016", padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: mono, fontSize: 12, letterSpacing: 2, color: INK2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} width={18} height={18} alt="" />
                <span style={{ color: INK }}>TASTROLOGY</span>
                <span>№{cardNo(card)}</span>
              </div>
              <div style={{ display: "flex", padding: "3px 10px", borderRadius: 999, border: `1px solid ${a}`, color: a, fontSize: 11 }}>{label.toUpperCase()}</div>
            </div>
            <div style={{ display: "flex", marginTop: 12, fontFamily: mono, fontSize: 11, letterSpacing: 3, color: a }}>TASTE SIGN</div>
            <div style={{ display: "flex", marginTop: 2, fontFamily: serif, fontStyle: "italic", fontSize: card.archetype.length > 28 ? 27 : 32, lineHeight: 1.05 }}>{card.archetype}</div>

            {/* art window */}
            <div style={{ display: "flex", position: "relative", marginTop: 12, height: 190, borderRadius: 14, overflow: "hidden", backgroundImage: `linear-gradient(135deg, ${alpha(a, 0.4)}, ${alpha(b, 0.4)})` }}>
              <div style={{ display: "flex", flexWrap: "wrap", width: "100%", height: "100%" }}>
                {tiles.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt="" style={{ width: tiles.length === 1 ? "100%" : "50%", height: tiles.length > 2 ? "50%" : "100%", objectFit: "cover" }} />
                ))}
              </div>
              <div style={{ display: "flex", position: "absolute", inset: 0, backgroundImage: `linear-gradient(160deg, ${alpha(a, 0.25)}, rgba(10,8,14,0.55) 60%, ${alpha(b, 0.33)})` }} />
              {stars.length > 1 && (
                <svg width="356" height="190" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", left: 0, top: 0 }}>
                  <polyline points={stars.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.7" />
                </svg>
              )}
              {stars.map((p) => {
                const r = 5 + p.weight * 6;
                return <div key={p.name} style={{ display: "flex", position: "absolute", left: p.x * 356 - r, top: p.y * 190 - r, width: r * 2, height: r * 2, borderRadius: 999, backgroundColor: "#fff", boxShadow: "0 0 14px #fff" }} />;
              })}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "absolute", right: 10, top: 10, width: 68, height: 68, borderRadius: 999, border: `4px solid ${a}`, backgroundColor: "#0d0b11" }}>
                <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{card.power}</span>
                <span style={{ fontFamily: mono, fontSize: 8, letterSpacing: 2, color: INK2 }}>TASTE</span>
              </div>
            </div>

            {/* big three */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {big.map(([k, ty]) => (
                <div key={k} style={{ display: "flex", flexDirection: "column", flex: 1, padding: "8px 10px", borderRadius: 12, border: `1px solid ${alpha(ty.a, 0.53)}`, backgroundColor: "rgba(255,255,255,0.04)" }}>
                  <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: 2, color: INK2 }}>{k.toUpperCase()}</span>
                  <span style={{ marginTop: 3, fontSize: 15, fontWeight: 600, lineHeight: 1.1 }}>{ty.name}</span>
                </div>
              ))}
            </div>

            {/* signature brands */}
            <div style={{ display: "flex", flexDirection: "column", marginTop: 10 }}>
              {card.moves.slice(0, 3).map((m, i) => (
                <div key={m.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 2px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: mono, fontSize: 11, color: a }}>0{i + 1}</span>
                    <span style={{ fontSize: 17, fontWeight: 600 }}>{maskRude(m.name)}</span>
                  </div>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{Math.round(m.value)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", paddingTop: 8, borderTop: "1px dashed rgba(255,255,255,0.15)", fontFamily: mono, fontSize: 10, letterSpacing: 3, color: INK3 }}>
              {card.mrz.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
          </div>
        </div>

        {/* the question */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, marginLeft: 76, marginRight: 64 }}>
          <div style={{ display: "flex", fontFamily: serif, fontSize: 62, lineHeight: 1.02 }}>
            <span>Pulled a&nbsp;</span>
            <span style={{ color: a }}>{card.rarityLabel}</span>
            <span>.</span>
          </div>
          <div style={{ display: "flex", fontFamily: serif, fontStyle: "italic", fontSize: 62, lineHeight: 1.02, color: INK2 }}>What&apos;s your taste sign?</div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 22, lineHeight: 1.3, color: INK2 }}>{card.flavor}</div>
          <div style={{ display: "flex", alignItems: "center", alignSelf: "flex-start", gap: 12, marginTop: 34, padding: "14px 26px", borderRadius: 999, backgroundColor: LIME, color: "#07070a", fontSize: 24, fontWeight: 700 }}>
            Open the card →
          </div>
          <div style={{ display: "flex", marginTop: 14, fontFamily: mono, fontSize: 17, letterSpacing: 1, color: INK3 }}>tastrology.vercel.app/c/{code}</div>
        </div>
      </div>
    ),
    { ...size, fonts: f },
  );
}
