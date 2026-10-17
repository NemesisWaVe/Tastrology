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

const adminCache = new Map<string, { admin: boolean; until: number }>();

/**
 * Admin = Clerk user with public metadata `{ "role": "admin" }` (set in the dashboard: Users → user → Metadata).
 * Nothing about who is admin lives in code. Cached 5 min per instance; any error reads as "not admin".
 */
export async function isAdmin(userId: string | null): Promise<boolean> {
  if (!userId || !clerkOn()) return false;
  const hit = adminCache.get(userId);
  if (hit && hit.until > Date.now()) return hit.admin;
  let admin = false;
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const user = await (await clerkClient()).users.getUser(userId);
    admin = (user.publicMetadata as { role?: unknown } | undefined)?.role === "admin";
  } catch {
    return false;
  }
  adminCache.set(userId, { admin, until: Date.now() + 5 * 60 * 1000 });
  return admin;
}
