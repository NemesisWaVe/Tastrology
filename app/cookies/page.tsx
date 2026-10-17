import type { Metadata } from "next";
import { DraftPage } from "@/components/site/DraftPage";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Cookies · ${BRAND.name}` };

export default function Page() {
  return <DraftPage title="Cookies" />;
}
