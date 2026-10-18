import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { getTwinStatus, TWIN_CODE } from "@/lib/twins";

/** Link previews (X, Snapchat, iMessage, WhatsApp) name the card itself, not the site. The image is ./opengraph-image.tsx. */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const code = decodeURIComponent((await params).code).toUpperCase();
  const t = TWIN_CODE.test(code) ? await getTwinStatus(code).catch(() => null) : null;
  const card = t?.card;
  if (!card) return {};
  const title = `${card.archetype} · ${BRAND.name}`;
  const description = `A ${card.rarityLabel} taste sign. Sun ${card.bigThree.sun.name}, Moon ${card.bigThree.moon.name}, Rising ${card.bigThree.rising.name}. ${BRAND.question}`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default function CardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
