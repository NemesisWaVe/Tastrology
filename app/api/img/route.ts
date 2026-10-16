import { isAllowedImageUrl, MAX_IMAGE_BYTES } from "./allow";

export const runtime = "nodejs";

// Same-origin proxy for Qloo entity images, so cards can be exported to PNG (canvas needs CORS-clean pixels).
export async function GET(request: Request) {
  const u = new URL(request.url).searchParams.get("u") ?? "";
  if (!isAllowedImageUrl(u)) return new Response("bad image url", { status: 400 });
  // No redirects: a redirect could point anywhere, and the allowlist only vouches for images.qloo.com.
  const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(8000) }).catch(() => null);
  const type = res?.headers.get("content-type") ?? "";
  if (!res?.ok || !type.startsWith("image/") || !res.body) return new Response("not found", { status: 404 });
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
    headers: { "content-type": type, "cache-control": "public, max-age=86400, s-maxage=86400" },
  });
}
