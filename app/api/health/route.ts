import { storeMode } from "@/lib/cache";
import { llmConfigured, llmPaused } from "@/lib/llm";
import { qlooMode } from "@/lib/qloo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { qlooMode: qlooMode(), llmConfigured: llmConfigured(), llmPaused: llmPaused(), store: storeMode() },
    { headers: { "cache-control": "no-store" } },
  );
}
