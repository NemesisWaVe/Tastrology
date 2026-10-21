import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { CardGallery } from "@/components/gallery/CardGallery";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Every card · ${BRAND.name}`,
  description: "The four finishes, the three ready-made cards, and the add-ons a card can carry.",
};

export default function CardsPage() {
  return (
    <SiteShell>
      <CardGallery />
    </SiteShell>
  );
}
