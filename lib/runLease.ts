import { createHash } from "node:crypto";
import { sharedCache, upstash, upstashConfigured } from "./cache";

/**
 * Cross-instance "this request is already running" lease (tm:running:<key>, SET NX), so a client that lost its stream
 * and lands on another instance waits for the result instead of starting (and paying for) a second run.
 * Memory fallback when Upstash is off or down.
 */
const LEASE_TTL_MS = 150_000;
const leaseMem = sharedCache<string>("running", 500);
const leaseKey = (key: string) => `tm:running:${createHash("sha1").update(key).digest("base64url")}`;

export async function takeLease(key: string): Promise<boolean> {
  const k = leaseKey(key);
  if (upstashConfigured()) {
    const out = await upstash([["SET", k, "1", "PX", LEASE_TTL_MS, "NX"]]);
    if (out) {
      if (out[0] !== "OK") return false;
      leaseMem.set(k, "1", LEASE_TTL_MS);
      return true;
    }
  }
  if (leaseMem.get(k)) return false;
  leaseMem.set(k, "1", LEASE_TTL_MS);
  return true;
}

export async function leaseHeld(key: string): Promise<boolean> {
  const k = leaseKey(key);
  if (upstashConfigured()) {
    const out = await upstash([["GET", k]]);
    if (out) return typeof out[0] === "string";
  }
  return Boolean(leaseMem.get(k));
}

export async function dropLease(key: string) {
  const k = leaseKey(key);
  leaseMem.delete(k);
  if (upstashConfigured()) await upstash([["DEL", k]]);
}
