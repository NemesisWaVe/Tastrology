import "server-only";
import { BRAND } from "./brand";
import { bumpDaily, peekDaily } from "./ratelimit";

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
  id: "primary" | "secondary" | "tertiary";
  baseUrl: string;
  apiKey: string;
  models: string[];
}

const list = (s?: string) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** Primary: LLM_* (with LLM_FALLBACK_MODELS). Optional LLM2_* then LLM3_*, each tried after the chain before it fails. */
function providers(): Provider[] {
  const out: Provider[] = [];
  const e = process.env;
  if (e.LLM_API_KEY && e.LLM_BASE_URL && e.LLM_MODEL)
    out.push({ id: "primary", baseUrl: e.LLM_BASE_URL, apiKey: e.LLM_API_KEY, models: [e.LLM_MODEL, ...list(e.LLM_FALLBACK_MODELS)] });
  if (e.LLM2_API_KEY && e.LLM2_BASE_URL && e.LLM2_MODEL)
    out.push({ id: "secondary", baseUrl: e.LLM2_BASE_URL, apiKey: e.LLM2_API_KEY, models: [e.LLM2_MODEL] });
  if (e.LLM3_API_KEY && e.LLM3_BASE_URL && e.LLM3_MODEL)
    out.push({ id: "tertiary", baseUrl: e.LLM3_BASE_URL, apiKey: e.LLM3_API_KEY, models: [e.LLM3_MODEL] });
  return out;
}

/** Amazon's own models (Nova) only speak Bedrock's Converse API, not the OpenAI-compatible one. */
export const isConverse = (model: string) => /^(?:[a-z]{2}\.)?amazon\./.test(model);

type Block = { text?: string; toolUse?: { toolUseId: string; name: string; input: unknown }; toolResult?: { toolUseId: string; content: { text: string }[] } };

/** OpenAI-style chat → Bedrock Converse request body. Consecutive same-role turns merge (Converse requires alternation). */
export function toConverse(messages: ChatMessage[], tools: ToolDef[] | undefined, maxTokens: number) {
  const system = messages.filter((m) => m.role === "system").map((m) => ({ text: m.content ?? "" }));
  const out: { role: "user" | "assistant"; content: Block[] }[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const role = m.role === "assistant" ? "assistant" : "user";
    const content: Block[] =
      m.role === "tool"
        ? [{ toolResult: { toolUseId: m.tool_call_id ?? "", content: [{ text: m.content ?? "" }] } }]
        : [
            ...(m.content ? [{ text: m.content }] : []),
            ...(m.tool_calls ?? []).map((c) => ({ toolUse: { toolUseId: c.id, name: c.function.name, input: safeJson(c.function.arguments) } })),
          ];
    if (!content.length) continue;
    const last = out[out.length - 1];
    if (last?.role === role) last.content.push(...content);
    else out.push({ role, content });
  }
  return {
    ...(system.length ? { system } : {}),
    messages: out,
    inferenceConfig: { maxTokens, temperature: 0.4 },
    ...(tools?.length
      ? { toolConfig: { tools: tools.map((t) => ({ toolSpec: { name: t.function.name, description: t.function.description, inputSchema: { json: t.function.parameters } } })) } }
      : {}),
  };
}

/** Bedrock Converse response → OpenAI-style assistant message. */
export function fromConverse(data: { output?: { message?: { content?: Block[] } } }): ChatMessage | undefined {
  const blocks = data.output?.message?.content;
  if (!blocks) return undefined;
  const text = blocks.map((b) => b.text ?? "").join("").trim();
  const calls = blocks.filter((b) => b.toolUse).map((b) => ({
    id: b.toolUse!.toolUseId,
    type: "function" as const,
    function: { name: b.toolUse!.name, arguments: JSON.stringify(b.toolUse!.input ?? {}) },
  }));
  return { role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

export const llmConfigured = () => providers().length > 0;

// Free-tier models rate-limit hard. After a 429, skip that provider for a while so runs go straight to
// the next provider (or the deterministic planner) instead of stalling on retries.
const breaker = globalThis as unknown as { __tmLlmPaused?: Record<string, number> };
const pausedUntil = (id: string) => breaker.__tmLlmPaused?.[id] ?? 0;
const isPaused = (p: Provider) => pausedUntil(p.id) > Date.now();

const dailyMax = () => Number(process.env.LLM_DAILY_MAX) || 2500;

/** True when every configured provider is cooling down after a rate limit, or today's LLM call budget is spent (runs then use autopilot). */
export const llmPaused = () => {
  const ps = providers();
  return ps.length > 0 && (peekDaily("llm") >= dailyMax() || ps.every(isPaused));
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
  if (peekDaily("llm") >= dailyMax()) throw new Error("LLM daily budget used up");
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
  void bumpDaily("llm");
  const timeout = Math.max(500, Math.min(Number(process.env.LLM_TIMEOUT_MS) || 8000, o.deadline ? o.deadline - Date.now() : Infinity));
  const maxTokens = Number(process.env.LLM_MAX_TOKENS) || 1536;
  const converse = isConverse(model);
  const base = p.baseUrl.replace(/\/$/, "").replace(/\/openai\/v1$/, "");
  const res = await fetch(converse ? `${base}/model/${encodeURIComponent(model)}/converse` : `${p.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${p.apiKey}`,
      ...(/openrouter\.ai/.test(p.baseUrl) ? { "HTTP-Referer": "https://github.com/tastrology", "X-Title": BRAND.name } : {}),
    },
    body: JSON.stringify(
      converse
        ? toConverse(messages, tools, maxTokens)
        : {
            model,
            messages,
            temperature: 0.4,
            max_tokens: maxTokens,
            ...(tools ? { tools, tool_choice: "auto" } : {}),
            ...(o.json ? { response_format: { type: "json_object" } } : {}),
          },
    ),
    signal: AbortSignal.timeout(timeout),
  });
  if (res.status === 429) {
    pause(p, res);
    throw new Error(`LLM rate-limited (${p.id})`);
  }
  if (!res.ok) throw new Error(`LLM HTTP ${res.status} (${model})`);
  const data = (await res.json()) as { choices?: { message: ChatMessage }[]; error?: { message?: string }; message?: string };
  const msg = converse ? fromConverse(data as Parameters<typeof fromConverse>[0]) : data.choices?.[0]?.message;
  if (!msg) throw new Error(`LLM returned no message (${model}): ${data.error?.message ?? data.message ?? ""}`);
  if (typeof msg.content === "string") msg.content = stripReasoning(msg.content) || null;
  return msg;
}

/**
 * Bedrock's gpt-oss puts its chain of thought in `content` as <reasoning>…</reasoning>, Nova as <thinking>…</thinking>.
 * It must never reach the live log or a JSON parse. An unclosed tag (cut off by max_tokens) drops the rest.
 */
export function stripReasoning(text: string): string {
  return text
    .replace(/<(reasoning|thinking)>[\s\S]*?(<\/\1>|$)/gi, "")
    .trim();
}
