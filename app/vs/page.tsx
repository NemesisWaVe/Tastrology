import type { Metadata } from "next";
import { Suspense } from "react";
import { VsRoute } from "@/components/battle/VsRoute";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Taste Battle · ${BRAND.name}`,
  description: "Two taste cards face off over four rounds of Qloo data. The payoff: a joint sign and a crossover brand you both get to post.",
};

export default function VsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <VsRoute />
    </Suspense>
  );
}
