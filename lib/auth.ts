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

const nameCache = new Map<string, { u: string | null; img?: string; until: number }>();

/** The Clerk username (picked at sign-up), lowercased; null if none; undefined if Clerk couldn't be read. Cached a minute. */
export async function clerkUsername(userId: string): Promise<string | null | undefined> {
  if (!clerkOn()) return undefined;
  const hit = nameCache.get(userId);
  if (hit && hit.until > Date.now()) return hit.u;
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const user = await (await clerkClient()).users.getUser(userId);
    const u = user.username?.toLowerCase() || null;
    // Only a photo the person set (Google sign-in or an upload); Clerk's generated placeholder is left out.
    const img = user.hasImage && /^https:\/\/img\.clerk\.com\//.test(user.imageUrl) ? user.imageUrl : "";
    nameCache.set(userId, { u, img, until: Date.now() + 60_000 });
    return u;
  } catch {
    return undefined;
  }
}

/** The account photo from Clerk ("" when none), read with the username; undefined when Clerk can't be reached. */
export async function clerkImage(userId: string): Promise<string | undefined> {
  if ((await clerkUsername(userId)) === undefined) return undefined;
  return nameCache.get(userId)?.img;
}

/** Writes the username to Clerk. "taken" when another Clerk account has it; "off" when Clerk usernames aren't enabled. */
export async function setClerkUsername(userId: string, username: string): Promise<"ok" | "taken" | "off" | "error"> {
  if (!clerkOn()) return "off";
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    await (await clerkClient()).users.updateUser(userId, { username });
    nameCache.set(userId, { u: username, until: Date.now() + 60_000 });
    return "ok";
  } catch (e) {
    const code = (e as { errors?: { code?: string }[] })?.errors?.[0]?.code ?? "";
    if (code === "form_identifier_exists" || code === "form_username_exists") return "taken";
    if (code.startsWith("form_param") || code.includes("not_allowed") || code.includes("unknown")) return "off";
    return "error";
  }
}

export async function deleteClerkUser(userId: string): Promise<boolean> {
  if (!clerkOn()) return false;
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    await (await clerkClient()).users.deleteUser(userId);
    nameCache.delete(userId);
    return true;
  } catch {
    return false;
  }
}
