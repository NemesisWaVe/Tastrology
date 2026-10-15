import "server-only";

/** Minimal OpenAI-compatible chat client (works with Gemini's OpenAI endpoint, OpenAI, Groq, etc.). */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export const llmConfigured = () => Boolean(process.env.LLM_API_KEY && process.env.LLM_BASE_URL && process.env.LLM_MODEL);

// Free-tier models rate-limit hard. After a 429, skip the LLM for a while so runs go straight to
// the deterministic planner instead of stalling on retries.
const breaker = globalThis as unknown as { __tmLlmPausedUntil?: number };
export const llmPaused = () => (breaker.__tmLlmPausedUntil ?? 0) > Date.now();

function pause(res: Response) {
  const reset = Number(res.headers.get("x-ratelimit-reset"));
  const retry = Number(res.headers.get("retry-after"));
  const until = reset > 1e12 ? reset : reset > 1e9 ? reset * 1000 : Date.now() + (retry > 0 ? retry * 1000 : 60_000);
  breaker.__tmLlmPausedUntil = Math.min(until, Date.now() + 15 * 60_000);
}

const isOpenRouter = () => /openrouter\.ai/.test(process.env.LLM_BASE_URL ?? "");

export async function chat(messages: ChatMessage[], tools?: ToolDef[], json = false): Promise<ChatMessage> {
  // OpenRouter routes to the next model in `models` when one is busy or rate-limited.
  // Our own fallback chain. (OpenRouter's `models` routing picked arbitrary free models and added latency.)
  const chain = [process.env.LLM_MODEL!, ...(process.env.LLM_FALLBACK_MODELS ?? "").split(",").map((s) => s.trim()).filter(Boolean)];
  let lastErr: Error = new Error("LLM unavailable");
  for (const model of chain) {
    try {
      return await chatOnce(model, messages, tools, json);
    } catch (err) {
      lastErr = err as Error;
      if (llmPaused()) break; // rate limit is account-wide on free tier; don't burn the chain
    }
  }
  throw lastErr;
}

async function chatOnce(model: string, messages: ChatMessage[], tools?: ToolDef[], json = false): Promise<ChatMessage> {
  const res = await fetch(`${process.env.LLM_BASE_URL!.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.LLM_API_KEY}`,
      ...(isOpenRouter() ? { "HTTP-Referer": "https://github.com/tastemirror", "X-Title": "TasteMirror" } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      ...(tools ? { tools, tool_choice: "auto" } : {}),
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
    // Free models usually answer in ~1.5s but occasionally queue; better to move down the chain than wait.
    signal: AbortSignal.timeout(Number(process.env.LLM_TIMEOUT_MS) || 8000),
  });
  if (res.status === 429) {
    pause(res);
    throw new Error("LLM rate-limited (free tier)");
  }
  if (!res.ok) throw new Error(`LLM HTTP ${res.status} (${model})`);
  const data = (await res.json()) as { choices?: { message: ChatMessage }[]; error?: { message?: string } };
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error(`LLM returned no message (${model}): ${data.error?.message ?? ""}`);
  return msg;
}
