import { createHash } from "node:crypto";
import { buildCard, cardCode } from "./card";
import { ddbConfigured, ddbDelete, ddbGetStatus, ddbPutIfAbsent, ddbTransact } from "./ddb";
import { deviceIdsOn } from "./device";
import type { StyleResult } from "./types";

export const guestOn = () => ddbConfigured() && deviceIdsOn();
export const guestKey = (requestKey: string) => createHash("sha256").update(requestKey).digest("hex");

export async function guestReading(device: string, key: string): Promise<{ status: "new" | "retry" | "used" | "error"; code?: string }> {
  const found = await ddbGetStatus(`DEVICE#${device}`, "READING");
  if (found.status === "missing") return { status: "new" };
  if (found.status !== "found") return { status: "error" };
  if (found.value.requestKey !== guestKey(key)) return { status: "used" };
  return { status: "retry", ...(typeof found.value.code === "string" ? { code: found.value.code } : {}) };
}

export async function reserveGuest(device: string, key: string): Promise<boolean> {
  const written = await ddbPutIfAbsent({ PK: `DEVICE#${device}`, SK: "READING", requestKey: guestKey(key), at: Date.now() });
  return written === "created" || (written === "exists" && (await guestReading(device, key)).status === "retry");
}

export async function releaseGuest(device: string, key: string) {
  await ddbDelete(`DEVICE#${device}`, "READING", { condition: "requestKey = :key AND attribute_not_exists(code)", values: { ":key": guestKey(key) } });
}

export async function finishGuest(device: string, key: string, result: StyleResult): Promise<boolean> {
  const card = buildCard(result);
  const code = cardCode(card);
  const done = await ddbTransact([
    { update: { PK: `DEVICE#${device}`, SK: "READING" }, set: "SET code = :code", condition: "requestKey = :key", values: { ":key": guestKey(key), ":code": code } },
    { put: { PK: `OWNER#${device}`, SK: `CARD#${code}`, code, card: JSON.stringify(card), rarityScore: card.rarityScore, addedAt: result.createdAt, minted: 1, source: "guest" } },
  ]);
  return Boolean(done?.ok);
}
