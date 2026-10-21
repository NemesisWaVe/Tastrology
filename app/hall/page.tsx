import type { Metadata } from "next";
import { HallFeed } from "@/components/hall/HallFeed";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Hall of Rares · ${BRAND.name}`,
  description: "Every Holo and Secret Rare real people have pulled, one card at a time.",
};

export default function HallPage() {
  return <HallFeed />;
}
