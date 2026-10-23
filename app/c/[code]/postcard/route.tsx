import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { upstash } from "@/lib/cache";
import { getReceipt, snapOf } from "@/lib/receipt";
import { getTwinStatus, TWIN_CODE } from "@/lib/twins";
import { maskRude } from "@/lib/guard";

export const runtime = "nodejs";

const GLOW = { common: "#c7ccd4", rare: "#7dd3fc", holo: "#c4b5fd", secret: "#fcd34d" } as const;

/** "This week's pull": a 1080x1350 postcard of a card and three brands its taste pulled in. No Qloo call: cache and receipt only. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code).toUpperCase();
  if (!TWIN_CODE.test(code)) return new Response("bad code", { status: 400 });
  const t = await getTwinStatus(code).catch(() => null);
  if (!t?.card) return new Response("not found", { status: 404 });
  const card = t.card;
  const rec = await getReceipt(code).catch(() => null);
  const snap = rec?.status === "found" ? snapOf(rec.rec) : null;
  let names: string[] = [];
  let fresh = false;
  const hit = await upstash([["GET", `tm:drift:${code}`]]).catch(() => null);
  if (hit && typeof hit[0] === "string" && snap) {
    try {
      const had = new Set(snap.brands.map((b) => b.id));
      names = (JSON.parse(hit[0]) as { brands: { id: string; name: string }[] }).brands.filter((b) => !had.has(b.id)).map((b) => b.name);
      fresh = names.length > 0;
    } catch {}
  }
  if (!names.length) names = (snap?.brands ?? []).map((b) => b.name);
  names = names.slice(0, 3).map((n) => maskRude(n));
  const svg = readFileSync(join(process.cwd(), "app/icon.svg"), "utf8").replace(/@media[^}]*\}\}/, "");
  const logo = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const glow = GLOW[card.rarity];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#08080c", color: "#f5f3ee", padding: 80, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={64} height={64} alt="" />
          <div style={{ display: "flex", fontSize: 30, letterSpacing: 6, textTransform: "uppercase", color: "#9b9aa3" }}>Tastrology</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", fontSize: 30, letterSpacing: 4, textTransform: "uppercase", color: glow }}>{card.rarityLabel}</div>
          <div style={{ display: "flex", fontSize: card.archetype.length > 18 ? 84 : 108, fontWeight: 700, lineHeight: 0.98, letterSpacing: -3 }}>{card.archetype}</div>
          <div style={{ display: "flex", fontSize: 38, color: "#b9b8c0", marginTop: 20 }}>{fresh ? "This week my taste pulled in" : "My taste pulls in"}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 10 }}>
            {names.map((n, i) => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 24, borderTop: "2px solid #24242c", paddingTop: 18, fontSize: 56, fontWeight: 700 }}>
                <span style={{ color: "#c6ff3d", fontSize: 34, width: 50 }}>{`0${i + 1}`}</span>
                {n}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: "#c6ff3d", letterSpacing: 2 }}>
          <span>tastrology.vercel.app/c/{code}</span>
          <span style={{ color: "#9b9aa3" }}>What&apos;s your taste sign?</span>
        </div>
      </div>
    ),
    { width: 1080, height: 1350, headers: { "cache-control": "public, max-age=300, s-maxage=3600" } },
  );
}
