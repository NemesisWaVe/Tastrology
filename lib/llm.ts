import "server-only";
import { BRAND } from "./brand";

/** Minimal OpenAI-compatible chat client (works with Gemini's OpenAI endpoint, OpenAI, Groq, OpenRouter, Bedrock's OpenAI endpoint…). */
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

interface Provider {
  id: "primary" | "secondary";
  baseUrl: string;
  apiKey: string;
  models: string[];
}

const list = (s?: string) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** Primary: LLM_* (with LLM_FALLBACK_MODELS). Optional secondary: LLM2_*, tried after the whole primary chain fails. */
function providers(): Provider[] {
  const out: Provider[] = [];
  const e = process.env;
  if (e.LLM_API_KEY && e.LLM_BASE_URL && e.LLM_MODEL)
    out.push({ id: "primary", baseUrl: e.LLM_BASE_URL, apiKey: e.LLM_API_KEY, models: [e.LLM_MODEL, ...list(e.LLM_FALLBACK_MODELS)] });
  if (e.LLM2_API_KEY && e.LLM2_BASE_URL && e.LLM2_MODEL)
    out.push({ id: "secondary", baseUrl: e.LLM2_BASE_URL, apiKey: e.LLM2_API_KEY, models: [e.LLM2_MODEL] });
  return out;
}

export const llmConfigured = () => providers().length > 0;

// Free-tier models rate-limit hard. After a 429, skip that provider for a while so runs go straight to
// the next provider (or the deterministic planner) instead of stalling on retries.
const breaker = globalThis as unknown as { __tmLlmPaused?: Record<string, number> };
const pausedUntil = (id: string) => breaker.__tmLlmPaused?.[id] ?? 0;
const isPaused = (p: Provider) => pausedUntil(p.id) > Date.now();

/** True when every configured provider is cooling down after a rate limit. */
export const llmPaused = () => {
  const ps = providers();
  return ps.length > 0 && ps.every(isPaused);
};

function pause(p: Provider, res: Response) {
  const reset = Number(res.headers.get("x-ratelimit-reset"));
  const retry = Number(res.headers.get("retry-after"));
  const until = reset > 1e12 ? reset : reset > 1e9 ? reset * 1000 : Date.now() + (retry > 0 ? retry * 1000 : 60_000);
  breaker.__tmLlmPaused ??= {};
  breaker.__tmLlmPaused[p.id] = Math.min(until, Date.now() + 15 * 60_000);
}

export interface ChatOptions {
  json?: boolean;
  /** Epoch ms. No request starts after it, and in-flight requests are cut off at it. */
  deadline?: number;
}

export async function chat(messages: ChatMessage[], tools?: ToolDef[], opts: ChatOptions | boolean = {}): Promise<ChatMessage> {
  const o: ChatOptions = typeof opts === "boolean" ? { json: opts } : opts;
  let lastErr: Error = new Error("LLM unavailable");
  for (const p of providers()) {
    if (isPaused(p)) continue;
    // Our own fallback chain. (OpenRouter's `models` routing picked arbitrary free models and added latency.)
    for (const model of p.models) {
      if (o.deadline && Date.now() >= o.deadline) throw new Error("LLM time budget used up");
      try {
        return await chatOnce(p, model, messages, tools, o);
      } catch (err) {
        lastErr = err as Error;
        if (isPaused(p)) break; // rate limit is account-wide on free tier; don't burn the chain
      }
    }
  }
  throw lastErr;
}

async function chatOnce(p: Provider, model: string, messages: ChatMessage[], tools: ToolDef[] | undefined, o: ChatOptions): Promise<ChatMessage> {
  // Free models usually answer in ~1.5s but occasionally queue; better to move down the chain than wait.
  const timeout = Math.max(500, Math.min(Number(process.env.LLM_TIMEOUT_MS) || 8000, o.deadline ? o.deadline - Date.now() : Infinity));
  const res = await fetch(`${p.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${p.apiKey}`,
      ...(/openrouter\.ai/.test(p.baseUrl) ? { "HTTP-Referer": "https://github.com/tastrology", "X-Title": BRAND.name } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      ...(tools ? { tools, tool_choice: "auto" } : {}),
      ...(o.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(timeout),
  });
  if (res.status === 429) {
    pause(p, res);
    throw new Error(`LLM rate-limited (${p.id})`);
  }
  if (!res.ok) throw new Error(`LLM HTTP ${res.status} (${model})`);
  const data = (await res.json()) as { choices?: { message: ChatMessage }[]; error?: { message?: string } };
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error(`LLM returned no message (${model}): ${data.error?.message ?? ""}`);
  return msg;
}
