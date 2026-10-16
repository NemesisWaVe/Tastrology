import type { Metadata } from "next";
import { Suspense } from "react";
import { BRAND } from "@/lib/brand";
import { VsCode } from "./VsCode";

export const metadata: Metadata = {
  title: `Answer the challenge · ${BRAND.name}`,
  description: "Someone put their taste card up. Mint yours and fight it.",
};

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <VsCode code={decodeURIComponent(code).toUpperCase()} />
    </Suspense>
  );
}
