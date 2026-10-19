import { CLIENT_EVENTS, countEvent, type FunnelEvent } from "@/lib/metrics";
import { allow, clientId } from "@/lib/ratelimit";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length")) > 96) return new Response(null, { status: 413 });
  if (!(await allow(`events:${clientId(request.headers)}`, 60, 600_000))) return new Response(null, { status: 429 });
  try {
    const text = await request.text();
    if (text.length > 96) return new Response(null, { status: 413 });
    const data = JSON.parse(text);
    if (!CLIENT_EVENTS.includes(data.event)) return new Response(null, { status: 400 });
    await countEvent(data.event as FunnelEvent);
    return new Response(null, { status: 204 });
  } catch { return new Response(null, { status: 400 }); }
}
