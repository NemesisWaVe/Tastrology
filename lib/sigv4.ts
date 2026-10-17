import { createHash, createHmac } from "node:crypto";

/** AWS Signature V4 for any service, by hand (no AWS SDK): one header-signed request. lib/s3.ts keeps its own S3 variant. */
export interface AwsCreds {
  accessKeyId: string;
  secretAccessKey: string;
}

export const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const hmac = (k: Buffer | string, s: string) => createHmac("sha256", k).update(s).digest();

/** `amzDate` is YYYYMMDDTHHMMSSZ. `path` must already be URI-encoded. Returns the headers to send (Host excluded). */
export function signV4(
  r: { service: string; region: string; host: string; method: string; path: string; headers: Record<string, string>; payloadHash: string; amzDate: string },
  c: AwsCreds,
): Record<string, string> {
  const h: Record<string, string> = { host: r.host, "x-amz-date": r.amzDate };
  for (const [k, v] of Object.entries(r.headers)) h[k.toLowerCase()] = v;
  const names = Object.keys(h).sort();
  const signed = names.join(";");
  const canonical = [r.method, r.path, "", names.map((n) => `${n}:${h[n].trim()}\n`).join(""), signed, r.payloadHash].join("\n");
  const date = r.amzDate.slice(0, 8);
  const scope = `${date}/${r.region}/${r.service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", r.amzDate, scope, sha256hex(canonical)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${c.secretAccessKey}`, date), r.region), r.service), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");
  const { host: _host, ...send } = h; // fetch sets Host from the URL
  return { ...send, authorization: `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}` };
}

export const amzNow = () => new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
