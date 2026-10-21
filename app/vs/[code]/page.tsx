import type { Metadata } from "next";
import { Suspense } from "react";
import { BRAND } from "@/lib/brand";
import { getTwinStatus, TWIN_CODE } from "@/lib/twins";
import { VsCode } from "./VsCode";

/**
 * A shared card's link lands here ("are we taste twins?"), so its preview shows that card: the same image as its
 * /c/<code> page. An unknown code keeps the plain challenge text.
 */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const code = decodeURIComponent((await params).code).toUpperCase();
  const plain = { title: `Are we taste twins? · ${BRAND.name}`, description: "Someone shared their taste card. Mint yours and see how compatible you are." };
  const t = TWIN_CODE.test(code) ? await getTwinStatus(code).catch(() => null) : null;
  const card = t?.card;
  if (!card) return plain;
  const title = `${card.archetype} asks: are we taste twins?`;
  const description = `A ${card.rarityLabel} taste sign. Mint yours in a minute and get a compatibility score with receipts.`;
  const images = [`/c/${encodeURIComponent(code)}/opengraph-image`];
  return { title, description, openGraph: { title, description, images }, twitter: { card: "summary_large_image", title, description, images } };
}

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <VsCode code={decodeURIComponent(code).toUpperCase()} />
    </Suspense>
  );
}
