import { beforeEach, describe, expect, it, vi } from "vitest";

const reply = vi.hoisted(() => ({ content: '{"verdict":"ok"}' as string, calls: 0, fail: false }));
vi.mock("@/lib/llm", () => ({
  llmConfigured: () => true,
  llmPaused: () => false,
  chat: async () => {
    reply.calls++;
    if (reply.fail) throw new Error("down");
    return { role: "assistant", content: reply.content };
  },
}));

import { moderate, verdictOf } from "@/lib/moderate";

describe("moderation", () => {
  beforeEach(() => {
    reply.calls = 0;
    reply.fail = false;
    reply.content = '{"verdict":"ok"}';
  });

  it("blocks list words without asking the model", async () => {
    expect(await moderate("hentaides", "username")).toBe("block");
    expect(reply.calls).toBe(0);
  });

  it("asks the model about the rest, once per text", async () => {
    reply.content = '{"verdict":"block"}';
    expect(await moderate("sneaky new slang", "bio")).toBe("block");
    expect(await moderate("Sneaky new slang", "bio")).toBe("block");
    expect(reply.calls).toBe(1);
  });

  it("lets text through when the model is down or unclear", async () => {
    reply.fail = true;
    expect(await moderate("matcha and miku", "bio")).toBe("ok");
    reply.fail = false;
    reply.content = "I think it's probably fine?";
    expect(await moderate("frank ocean stan", "username")).toBe("ok");
  });

  it("reads the verdict out of a chatty reply", () => {
    expect(verdictOf('Sure! {"verdict": "BLOCK"}')).toBe("block");
    expect(verdictOf("{}")).toBeNull();
  });
});
