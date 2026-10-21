import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

/**
 * Clerk session middleware, only when both keys are set. Without them this is a pass-through, so the anonymous
 * app behaves exactly as before. /api/img, /api/card and /api/battle are skipped: they never read the session,
 * and keeping them out of middleware keeps their CDN caching simple. /api/health is skipped so uptime checks never
 * depend on Clerk.
 */
const ON = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
const clerk = ON ? clerkMiddleware() : null;

/** A Clerk outage (or a bad key) must not take the whole site down: fall through unauthenticated instead. */
export default async function middleware(req: NextRequest, ev: NextFetchEvent) {
  if (!clerk) return NextResponse.next();
  try {
    return await clerk(req, ev);
  } catch (err) {
    console.warn(JSON.stringify({ evt: "clerk_middleware_error", error: String((err as Error)?.message ?? err).slice(0, 200) }));
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    // Everything except Next internals, static files, the cached image/card/battle APIs, the health check and Clerk's webhook.
    "/((?!_next|api/img|api/card|api/battle|api/health|api/clerk-webhook|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|xml)).*)",
  ],
};
