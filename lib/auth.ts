/**
 * Accounts (Clerk), fully env-gated. Without both keys there is no middleware, no provider and no sign-in gate:
 * the app runs anonymous, exactly as before. Server-only helpers; the client side lives in lib/authBridge.ts.
 * Never call these from /api/card or /api/battle: their CDN caching depends on not touching the session.
 */
export const clerkOn = () => Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

/** The signed-in Clerk user id, or null (Clerk off, signed out, or the session couldn't be read). */
export async function currentUserId(): Promise<string | null> {
  if (!clerkOn()) return null;
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    return userId ?? null;
  } catch {
    return null;
  }
}
