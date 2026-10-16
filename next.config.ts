import type { NextConfig } from "next";

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Qloo entity images render directly; canvas exports go through /api/img instead.
  "img-src 'self' data: blob: https://images.qloo.com",
  "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
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
