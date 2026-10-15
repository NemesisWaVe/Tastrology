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

export async function chat(messages: ChatMessage[], tools?: ToolDef[], json = false): Promise<ChatMessage> {
  const res = await fetch(`${process.env.LLM_BASE_URL!.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.LLM_API_KEY}` },
    body: JSON.stringify({
      model: process.env.LLM_MODEL,
      messages,
      temperature: 0.4,
      ...(tools ? { tools, tool_choice: "auto" } : {}),
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: { message: ChatMessage }[] };
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error("LLM returned no message");
  return msg;
}
