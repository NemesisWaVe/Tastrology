import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

/**
 * Clerk session middleware, only when both keys are set. Without them this is a pass-through, so the anonymous
 * app behaves exactly as before. /api/img, /api/card and /api/battle are skipped: they never read the session,
 * and keeping them out of middleware keeps their CDN caching simple.
 */
const ON = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
const clerk = ON ? clerkMiddleware() : null;

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  return clerk ? clerk(req, ev) : NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals, static files and the cached image/card/battle APIs.
    "/((?!_next|api/img|api/card|api/battle|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|xml)).*)",
  ],
};
