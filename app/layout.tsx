import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const display = Bricolage_Grotesque({ variable: "--nf-display", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const serif = Instrument_Serif({ variable: "--nf-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const sans = Inter({ variable: "--nf-sans", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--nf-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: `${BRAND.name}: ${BRAND.tagline}`,
  description:
    "Tell it what you love. An agent reads Qloo's cross-domain taste graph and mints your style identity as a holographic collectible card, with the brands that fit you and the receipts for every pick.",
};

export const viewport: Viewport = { themeColor: "#07070a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${serif.variable} ${sans.variable} ${mono.variable} antialiased`}>{children}</body>
    </html>
  );
}
