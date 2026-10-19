import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import { ClerkBridge } from "@/components/auth/ClerkBridge";
import { SoundOrb } from "@/components/site/SoundOrb";
import { BRAND } from "@/lib/brand";
import { Telemetry } from "@/components/site/Telemetry";
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
        <body className={fonts}>
          {children}
          <Telemetry />
          <SoundOrb onlyWhenLocked />
        </body>
      </html>
    );
  }
  return (
    <ClerkProvider appearance={CLERK_LOOK} localization={CLERK_WORDS} signInUrl="/sign-in" signUpUrl="/sign-up">
      <html lang="en">
        <body className={fonts}>
          {children}
          <Telemetry />
          <SoundOrb onlyWhenLocked />
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
  // Still on Clerk's development instance (production needs a domain we own): hide its "Development mode" badges.
  layout: { unsafe_disableDevelopmentModeWarnings: true },
  // Clerk's own CSS sits in the "clerk" layer (globals.css orders it under utilities), so these classes win.
  cssLayerName: "clerk",
  // Username changes go through /friends (one free, then Stardust) and closing an account through /account (it
  // clears friends and bouts first), so Clerk's own profile hides both.
  elements: {
    profileSection__username: { display: "none" },
    profileSection__danger: { display: "none" },
    // The sheets in the house look: a hairline card, mono eyebrows, a serif line, pill fields and a lime pill.
    cardBox: "rounded-[24px] border border-line shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)]",
    card: "rounded-none border-0 bg-card px-7 py-8 shadow-none",
    headerTitle: "font-mono text-[10.5px] font-normal uppercase tracking-[0.24em] text-accent",
    headerSubtitle: "mt-1 font-serif text-[28px] italic leading-[1.1] text-ink",
    socialButtonsBlockButton: "rounded-full border border-line bg-paper py-2.5 shadow-none transition hover:border-ink-3 hover:bg-paper",
    socialButtonsBlockButtonText: "text-[15px] font-medium text-ink",
    dividerLine: "bg-line",
    dividerText: "font-mono text-[10px] uppercase tracking-[0.22em] text-ink-3",
    formFieldLabel: "font-mono text-[10.5px] font-normal uppercase tracking-[0.2em] text-ink-3",
    formFieldInput: "rounded-full border border-line bg-paper px-4 py-2.5 text-[15px] text-ink shadow-none transition focus:border-accent/60",
    formFieldAction: "text-accent",
    formButtonPrimary: "rounded-full bg-accent py-2.5 text-[15px] font-semibold normal-case text-paper shadow-none transition hover:bg-accent hover:brightness-105",
    buttonArrowIcon: "hidden",
    otpCodeFieldInput: "rounded-xl border border-line bg-paper text-ink",
    identityPreview: "rounded-full border border-line bg-paper",
    identityPreviewEditButton: "text-accent",
    footer: "bg-paper-2 [&>*]:bg-transparent",
    footerActionText: "text-ink-3",
    footerActionLink: "font-semibold text-accent hover:text-accent",
  },
};

/** Clerk's copy, in our voice. The combined sheet (sign in or sign up) uses titleCombined. */
const CLERK_WORDS = {
  signIn: {
    start: { title: "Tastrology", titleCombined: "Tastrology", subtitle: "Sign in and the stars start reading.", subtitleCombined: "Sign in and the stars start reading." },
  },
  signUp: {
    start: { title: "New here", subtitle: "Pick a username. It's how friends find you." },
    continue: { title: "Almost there", subtitle: "Pick a username. It's how friends find you." },
  },
};
