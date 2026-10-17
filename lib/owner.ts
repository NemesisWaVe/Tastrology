import { clerkOn, currentUserId } from "./auth";
import { deviceId } from "./device";

/** Whose deck a request reads: the signed-in account when Clerk is on, otherwise the signed device cookie (read-only once Clerk is on). */
export async function deckOwner(headers: Headers): Promise<{ owner: string | null; kind: "user" | "device"; userId: string | null }> {
  const userId = clerkOn() ? await currentUserId() : null;
  if (userId) return { owner: userId, kind: "user", userId };
  return { owner: deviceId(headers), kind: "device", userId: null };
}
