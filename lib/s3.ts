import { createHash, createHmac } from "node:crypto";
import type { Lookup } from "./lookup";

/**
 * Minimal S3 client: GET and write-once PUT, signed with SigV4 by hand (no AWS SDK).
 * Optional like Upstash: every call returns null / "error" on failure, so storage stays an
 * optimization the app can run without.
 * Env names avoid AWS_*: Vercel reserves those.
 */
export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Override the virtual-hosted host (tests, S3-compatible stores). */
  host?: string;
}

export function s3Config(): S3Config | null {
  const e = process.env;
  if (!e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY) return null;
  return { bucket: e.S3_BUCKET, region: e.S3_REGION || "us-east-1", accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY };
}
export const s3Configured = () => s3Config() !== null;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const hmac = (k: Buffer | string, s: string) => createHmac("sha256", k).update(s).digest();
// RFC 3986 per path segment, as SigV4 expects (encodeURIComponent leaves !'()* alone).
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
export const EMPTY_SHA256 = sha256("");

/** SigV4-signed URL and headers for one request. `amzDate` is YYYYMMDDTHHMMSSZ. */
export function signS3(c: S3Config, method: string, key: string, extra: Record<string, string>, payloadHash: string, amzDate: string) {
  const host = c.host ?? `${c.bucket}.s3.${c.region}.amazonaws.com`;
  const path = "/" + key.split("/").map(enc).join("/");
  const h: Record<string, string> = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  for (const [k, v] of Object.entries(extra)) h[k.toLowerCase()] = v;
  const names = Object.keys(h).sort();
  const signed = names.join(";");
  const canonical = [method, path, "", names.map((n) => `${n}:${h[n].trim()}\n`).join(""), signed, payloadHash].join("\n");
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${c.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${c.secretAccessKey}`, date), c.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");
  const { host: _host, ...send } = h; // fetch sets Host from the URL
  return {
    url: `https://${host}${path}`,
    signature,
    headers: { ...send, authorization: `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}` },
  };
}

const now = () => new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");

/**
 * One GET, tri-state: "missing" when S3 answered 404 (or 403, which is what a missing key returns without
 * s3:ListBucket), "error" on a timeout, network failure or 5xx, "off" when unconfigured.
 */
export async function s3GetStatus(key: string, timeoutMs = 2500): Promise<Lookup<string>> {
  const c = s3Config();
  if (!c) return { status: "off" };
  try {
    const { url, headers } = signS3(c, "GET", key, {}, EMPTY_SHA256, now());
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (res.ok) return { status: "found", value: await res.text() };
    return res.status === 404 || res.status === 403 ? { status: "missing" } : { status: "error" };
  } catch {
    return { status: "error" };
  }
}

/** Object body as text, or null when missing, unconfigured or unreachable. */
export async function s3Get(key: string): Promise<string | null> {
  const r = await s3GetStatus(key);
  return r.status === "found" ? r.value : null;
}

/** Write-once PUT (If-None-Match: *): an existing object is never overwritten. */
export async function s3PutIfAbsent(key: string, body: string, contentType = "application/json"): Promise<"created" | "exists" | "error"> {
  const c = s3Config();
  if (!c) return "error";
  try {
    const { url, headers } = signS3(c, "PUT", key, { "content-type": contentType, "if-none-match": "*" }, sha256(body), now());
    const res = await fetch(url, { method: "PUT", headers, body, signal: AbortSignal.timeout(2500) });
    if (res.ok) return "created";
    return res.status === 412 || res.status === 409 ? "exists" : "error"; // 409: a concurrent write of the same key won
  } catch {
    return "error";
  }
}

/** DELETE one object (S3 answers 204 whether or not it existed). Needs s3:DeleteObject. */
export async function s3Delete(key: string): Promise<"deleted" | "error"> {
  const c = s3Config();
  if (!c) return "error";
  try {
    const { url, headers } = signS3(c, "DELETE", key, {}, EMPTY_SHA256, now());
    const res = await fetch(url, { method: "DELETE", headers, signal: AbortSignal.timeout(2500) });
    return res.ok || res.status === 404 ? "deleted" : "error";
  } catch {
    return "error";
  }
}
