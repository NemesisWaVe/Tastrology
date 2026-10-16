import { describe, expect, it } from "vitest";
import { fromConverse, isConverse, stripReasoning, toConverse, type ChatMessage, type ToolDef } from "@/lib/llm";

describe("Bedrock Converse adapter (Nova)", () => {
  it("routes only Amazon models to Converse", () => {
    expect(isConverse("amazon.nova-pro-v1:0")).toBe(true);
    expect(isConverse("us.amazon.nova-pro-v1:0")).toBe(true);
    expect(isConverse("openai.gpt-oss-120b-1:0")).toBe(false);
  });

  it("maps a tool round-trip and merges consecutive tool results into one user turn", () => {
    const tools: ToolDef[] = [{ type: "function", function: { name: "search", description: "d", parameters: { type: "object" } } }];
    const msgs: ChatMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "go" },
      { role: "assistant", content: null, tool_calls: [
        { id: "t1", type: "function", function: { name: "search", arguments: '{"q":"a"}' } },
        { id: "t2", type: "function", function: { name: "search", arguments: "bad json" } },
      ] },
      { role: "tool", tool_call_id: "t1", content: "r1" },
      { role: "tool", tool_call_id: "t2", content: "r2" },
    ];
    const b = toConverse(msgs, tools, 100);
    expect(b.system).toEqual([{ text: "sys" }]);
    expect(b.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(b.messages[1].content[0].toolUse).toEqual({ toolUseId: "t1", name: "search", input: { q: "a" } });
    expect(b.messages[1].content[1].toolUse?.input).toEqual({});
    expect(b.messages[2].content).toHaveLength(2);
    expect(b.toolConfig?.tools[0].toolSpec.inputSchema.json).toEqual({ type: "object" });
  });

  it("maps a Converse reply back to an OpenAI-style message", () => {
    const m = fromConverse({ output: { message: { content: [{ text: "ok " }, { toolUse: { toolUseId: "x", name: "search", input: { q: 1 } } }] } } });
    expect(m?.content).toBe("ok");
    expect(m?.tool_calls?.[0]).toEqual({ id: "x", type: "function", function: { name: "search", arguments: '{"q":1}' } });
  });

  it("strips gpt-oss <reasoning> and Nova <thinking> from content, including a cut-off tag", () => {
    expect(stripReasoning('<reasoning>Need to call it.</reasoning>{"a":1}')).toBe('{"a":1}');
    expect(stripReasoning("<thinking> plan </thinking>\nChecking Daft Punk first.")).toBe("Checking Daft Punk first.");
    expect(stripReasoning("Done.<reasoning>truncated by max_tok")).toBe("Done.");
    expect(stripReasoning("no tags here")).toBe("no tags here");
  });
});
