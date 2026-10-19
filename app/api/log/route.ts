import { upstash } from "@/lib/cache";
import { allow, bumpDaily, clientId } from "@/lib/ratelimit";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length")) > 96) return new Response(null, { status: 413 });
  if (!(await allow(`errorlog:${clientId(request.headers)}`, 5, 600_000))) return new Response(null, { status: 429 });
  try {
    const text = await request.text();
    if (text.length > 96) return new Response(null, { status: 413 });
    const { kind } = JSON.parse(text);
    if (!["runtime", "promise", "reading"].includes(kind)) return new Response(null, { status: 400 });
    if (await bumpDaily("error_reports") <= 200) {
      await upstash([["LPUSH", "tm:errors", JSON.stringify({ kind, at: Date.now() })], ["LTRIM", "tm:errors", 0, 99], ["EXPIRE", "tm:errors", 7 * 86400]]);
    }
    return new Response(null, { status: 204 });
  } catch { return new Response(null, { status: 400 }); }
}
