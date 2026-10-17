import type { NextConfig } from "next";

/**
 * Clerk's Frontend API host, decoded from the publishable key (pk_test_/pk_live_ + base64("<host>$")):
 * *.clerk.accounts.dev in development, clerk.<domain> in production. Null when accounts are off.
 */
function clerkHost(): string | null {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!pk || !process.env.CLERK_SECRET_KEY) return null;
  try {
    const host = Buffer.from(pk.split("_").slice(2).join("_"), "base64").toString().replace(/\$$/, "");
    return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null;
  } catch {
    return null;
  }
}
const CLERK = clerkHost();
const clerk = (...src: string[]) => (CLERK ? ` ${src.join(" ")}` : "");

const CSP = [
  "default-src 'self'",
  // *.protect.clerk.com: Clerk Protect, which runs the "challenge suspicious sign-ups" check.
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${clerk(CLERK!, "https://*.protect.clerk.com")}`,
  "frame-src https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Qloo entity images render directly; canvas exports go through /api/img instead.
  `img-src 'self' data: blob: https://images.qloo.com${clerk("https://img.clerk.com")}`,
  `connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://challenges.cloudflare.com${clerk(CLERK!, "https://*.protect.clerk.com")}`,
  ...(CLERK ? ["worker-src 'self' blob:"] : []),
  "media-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    const h = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), gyroscope=(self), accelerometer=(self)" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      // Dev needs eval for HMR, so the CSP is production-only.
      ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: CSP }] : []),
    ];
    return [{ source: "/:path*", headers: h }];
  },
};

export default nextConfig;
