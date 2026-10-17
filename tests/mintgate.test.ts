import { afterEach, describe, expect, it, vi } from "vitest";

/** The agent route's sign-in gate, with Clerk mocked: fresh readings need an account, personas never do. */
const auth = vi.hoisted(() => ({ on: false, user: null as string | null }));
vi.mock("@/lib/auth", () => ({ clerkOn: () => auth.on, currentUserId: async () => auth.user, isAdmin: async () => false }));

import { POST } from "@/app/api/agent/route";
import { PERSONAS } from "@/lib/personas";

const post = (seeds: { name: string; kind: string }[]) =>
  POST(new Request("http://x/api/agent", { method: "POST", body: JSON.stringify({ seeds }), headers: { "content-type": "application/json" } }));

afterEach(() => {
  auth.on = false;
  auth.user = null;
});

describe("mint gate", () => {
  const fresh = [
    { name: "Gate Test Artist Zeta", kind: "artist" },
    { name: "Gate Test Film Omega", kind: "movie" },
  ];

  it("asks a signed-out visitor to sign in for a fresh reading when accounts are on", async () => {
    auth.on = true;
    const res = await post(fresh);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ reason: "signin" });
  });

  it("lets persona demos through anonymously", async () => {
    auth.on = true;
    const p = PERSONAS[0];
    const res = await post(p.seeds.map((s) => ({ name: s.name, kind: s.kind })));
    expect(res.status).not.toBe(401);
    await res.body?.cancel();
  });

  it("changes nothing when accounts are off", async () => {
    const res = await post(fresh);
    expect(res.status).not.toBe(401);
    await res.body?.cancel();
  });
});
