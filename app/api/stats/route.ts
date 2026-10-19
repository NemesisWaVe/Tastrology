import { SEASON } from "@/lib/card";
import { allow, clientId } from "@/lib/ratelimit";
import { mintHistogram, weeklySigns } from "@/lib/stats";

export async function GET(request: Request) {
  if (!(await allow(`stats:${clientId(request.headers)}`, 30, 600_000))) return new Response(null, { status: 429 });
  const [histogram, signs] = await Promise.all([mintHistogram(SEASON), weeklySigns()]);
  const total = histogram?.reduce((sum, count) => sum + count, 0) ?? 0;
  return Response.json({ histogram: total >= 200 ? histogram : null, total, signs }, { headers: { "cache-control": "public, max-age=60, s-maxage=300" } });
}
