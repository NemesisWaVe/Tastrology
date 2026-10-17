import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import { ClerkBridge } from "@/components/auth/ClerkBridge";
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
  const fonts = `${display.variable} ${serif.variable} ${sans.variable} ${mono.variable} antialiased`;
  // Accounts are optional: without a publishable key there is no provider and the app stays anonymous.
  if (!ACCOUNTS) {
    return (
      <html lang="en">
        <body className={fonts}>{children}</body>
      </html>
    );
  }
  return (
    <ClerkProvider appearance={CLERK_LOOK} signInUrl="/sign-in" signUpUrl="/sign-up">
      <html lang="en">
        <body className={fonts}>
          {children}
          <ClerkBridge />
        </body>
      </html>
    </ClerkProvider>
  );
}

const ACCOUNTS = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

/** Clerk's sheets in the house look: dark paper, lime accent, Bricolage. */
const CLERK_LOOK = {
  variables: {
    colorPrimary: "#c6ff3d",
    colorTextOnPrimaryBackground: "#07070a",
    colorBackground: "#121218",
    colorText: "#f3f1ec",
    colorTextSecondary: "#b9b5ad",
    colorInputBackground: "#0e0e13",
    colorInputText: "#f3f1ec",
    colorNeutral: "#f3f1ec",
    fontFamily: "var(--nf-display), system-ui, sans-serif",
    borderRadius: "14px",
  },
};
