export const runtime = "nodejs";

// Same-origin proxy for Qloo entity images, so cards can be exported to PNG (canvas needs CORS-clean pixels).
const ALLOWED = /^https:\/\/images\.qloo\.com\//;

export async function GET(request: Request) {
  const u = new URL(request.url).searchParams.get("u") ?? "";
  if (!ALLOWED.test(u)) return new Response("bad image url", { status: 400 });
  const res = await fetch(u, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok || !res.headers.get("content-type")?.startsWith("image/")) return new Response("not found", { status: 404 });
  return new Response(res.body, {
    headers: { "content-type": res.headers.get("content-type")!, "cache-control": "public, max-age=86400, immutable" },
  });
}
