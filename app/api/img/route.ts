import { allow, clientId } from "@/lib/ratelimit";
import { isAllowedImageUrl, MAX_IMAGE_BYTES, RASTER_TYPES } from "./allow";

export const runtime = "nodejs";

// Same-origin proxy for Qloo entity images, so cards can be exported to PNG (canvas needs CORS-clean pixels).
export async function GET(request: Request) {
  const u = new URL(request.url).searchParams.get("u") ?? "";
  if (u.length > 512 || !isAllowedImageUrl(u)) return new Response("bad image url", { status: 400 });
  if (!(await allow(`img:${clientId(request.headers)}`, 600, 10 * 60 * 1000))) return new Response("slow down", { status: 429 });
  // No redirects: a redirect could point anywhere, and the allowlist only vouches for images.qloo.com.
  const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(8000) }).catch(() => null);
  // Raster only: SVG can carry script, so it is never forwarded.
  const type = (res?.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!res?.ok || !RASTER_TYPES.includes(type) || !res.body) return new Response("not found", { status: 404 });
  if (Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) return new Response("image too large", { status: 413 });

  // content-length can be missing or wrong, so count while reading.
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_IMAGE_BYTES) {
      reader.cancel().catch(() => {});
      return new Response("image too large", { status: 413 });
    }
    chunks.push(value);
  }
  return new Response(Buffer.concat(chunks), {
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=86400, s-maxage=86400",
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}
