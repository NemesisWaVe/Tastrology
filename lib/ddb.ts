import type { Lookup } from "./lookup";
import { amzNow, sha256hex, signV4, type AwsCreds } from "./sigv4";

/**
 * Minimal DynamoDB client over the JSON HTTP API, signed by hand (no AWS SDK). Optional like S3 and Upstash:
 * every call returns null / "error" when unconfigured or unreachable, so the app runs without it.
 *
 * One table, single-table design. Keys in use:
 *   CARD#<code>   META            the minted card (write-once): permanent home of the digital twin
 *   OWNER#<dev>   CARD#<code>     a card in a device's deck (write-once), with a small summary for listing
 *   OWNER#<user>  CARD#<code>     a card in an account's deck (+ minted 0/1, source mint/claim/collect)
 *   DEVICE#<dev>  CLAIM           which account claimed a device's deck (write-once)
 *   USER#<id>     PROFILE/WALLET/LEDGER#…   credits (lib/ledger.ts)
 * Env: DDB_TABLE, DDB_REGION, DDB_ACCESS_KEY_ID, DDB_SECRET_ACCESS_KEY (falls back to the S3_* keys). Not AWS_*: Vercel reserves those.
 */
export interface DdbConfig extends AwsCreds {
  table: string;
  region: string;
  /** Override the endpoint host (tests, DynamoDB Local). */
  host?: string;
}

export function ddbConfig(): DdbConfig | null {
  const e = process.env;
  const accessKeyId = e.DDB_ACCESS_KEY_ID || e.S3_ACCESS_KEY_ID;
  const secretAccessKey = e.DDB_SECRET_ACCESS_KEY || e.S3_SECRET_ACCESS_KEY;
  if (!e.DDB_TABLE || !accessKeyId || !secretAccessKey) return null;
  return { table: e.DDB_TABLE, region: e.DDB_REGION || e.S3_REGION || "us-east-1", accessKeyId, secretAccessKey };
}
export const ddbConfigured = () => ddbConfig() !== null;

/* ------------------------------------------------------------ marshalling (flat items: strings and numbers) */

export type Flat = Record<string, string | number>;
type Attr = { S: string } | { N: string };

export function marshal(item: Flat): Record<string, Attr> {
  const out: Record<string, Attr> = {};
  for (const [k, v] of Object.entries(item)) out[k] = typeof v === "number" ? { N: String(v) } : { S: v };
  return out;
}

export function unmarshal(item: Record<string, Partial<{ S: string; N: string }>>): Flat {
  const out: Flat = {};
  for (const [k, v] of Object.entries(item)) {
    if (v.S !== undefined) out[k] = v.S;
    else if (v.N !== undefined) out[k] = Number(v.N);
  }
  return out;
}

/* ------------------------------------------------------------ transport */

/** Signed request for one DynamoDB action (exported for tests). */
export function ddbRequest(c: DdbConfig, action: string, payload: unknown, amzDate = amzNow()) {
  const host = c.host ?? `dynamodb.${c.region}.amazonaws.com`;
  const body = JSON.stringify(payload);
  const headers = signV4(
    {
      service: "dynamodb",
      region: c.region,
      host,
      method: "POST",
      path: "/",
      headers: { "content-type": "application/x-amz-json-1.0", "x-amz-target": `DynamoDB_20120810.${action}` },
      payloadHash: sha256hex(body),
      amzDate,
    },
    c,
  );
  return { url: `https://${host}/`, headers, body };
}

type DdbResult = { ok: true; json: Record<string, unknown> } | { ok: false; type: string; json: Record<string, unknown> };

/** One signed call. `table: false` for actions with no top-level TableName (TransactWriteItems). */
async function call(action: string, payload: Record<string, unknown>, table = true, timeoutMs = 2500): Promise<DdbResult | null> {
  const c = ddbConfig();
  if (!c) return null;
  try {
    const { url, headers, body } = ddbRequest(c, action, table ? { TableName: c.table, ...payload } : payload);
    const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return { ok: true, json };
    return { ok: false, type: String(json.__type ?? res.status).split("#").pop()!, json };
  } catch {
    return null;
  }
}

/** Write-once put: an existing item with the same key is never overwritten. */
export async function ddbPutIfAbsent(item: Flat & { PK: string; SK: string }): Promise<"created" | "exists" | "error"> {
  const r = await call("PutItem", { Item: marshal(item), ConditionExpression: "attribute_not_exists(PK)" });
  if (!r) return "error";
  if (r.ok) return "created";
  return r.type === "ConditionalCheckFailedException" ? "exists" : "error";
}

/** GetItem, tri-state: "missing" when DynamoDB answered with no item, "error" when it couldn't answer, "off" when unconfigured. */
export async function ddbGetStatus(PK: string, SK: string, timeoutMs = 2500): Promise<Lookup<Flat>> {
  if (!ddbConfigured()) return { status: "off" };
  const r = await call("GetItem", { Key: marshal({ PK, SK }) }, true, timeoutMs);
  if (!r?.ok) return { status: "error" };
  if (!r.json.Item) return { status: "missing" };
  return { status: "found", value: unmarshal(r.json.Item as Record<string, { S?: string; N?: string }>) };
}

export async function ddbGet(PK: string, SK: string): Promise<Flat | null> {
  const r = await ddbGetStatus(PK, SK);
  return r.status === "found" ? r.value : null;
}

/** Items under one partition whose sort key starts with `prefix`, in sort-key order. `cursor` pages on. */
export async function ddbQuery(PK: string, prefix: string, limit: number, cursor?: string, attrs?: string[]): Promise<{ items: Flat[]; cursor?: string } | null> {
  const payload: Record<string, unknown> = {
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: marshal({ ":pk": PK, ":sk": prefix }),
    Limit: limit,
  };
  if (attrs?.length) {
    payload.ProjectionExpression = attrs.map((_, i) => `#a${i}`).join(", ");
    payload.ExpressionAttributeNames = Object.fromEntries(attrs.map((a, i) => [`#a${i}`, a]));
  }
  if (cursor) {
    try {
      payload.ExclusiveStartKey = JSON.parse(Buffer.from(cursor, "base64url").toString());
    } catch {}
  }
  const r = await call("Query", payload);
  if (!r?.ok) return null;
  const items = ((r.json.Items ?? []) as Record<string, { S?: string; N?: string }>[]).map(unmarshal);
  const last = r.json.LastEvaluatedKey;
  return { items, cursor: last ? Buffer.from(JSON.stringify(last)).toString("base64url") : undefined };
}

/* ------------------------------------------------------------ updates, deletes, transactions */

export interface Expr {
  /** e.g. "attribute_exists(PK) AND credits >= :one" */
  condition?: string;
  names?: Record<string, string>;
  values?: Flat;
}

function exprPayload(e: Expr): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (e.condition) p.ConditionExpression = e.condition;
  if (e.names && Object.keys(e.names).length) p.ExpressionAttributeNames = e.names;
  if (e.values && Object.keys(e.values).length) p.ExpressionAttributeValues = marshal(e.values);
  return p;
}

/** UpdateItem. "updated", "failed" (condition false) or "error". */
export async function ddbUpdate(PK: string, SK: string, update: string, e: Expr = {}): Promise<"updated" | "failed" | "error"> {
  const r = await call("UpdateItem", { Key: marshal({ PK, SK }), UpdateExpression: update, ...exprPayload(e) });
  if (!r) return "error";
  if (r.ok) return "updated";
  return r.type === "ConditionalCheckFailedException" ? "failed" : "error";
}

/** DeleteItem (optionally conditional). "deleted" also covers an item that was already gone. */
export async function ddbDelete(PK: string, SK: string, e: Expr = {}): Promise<"deleted" | "failed" | "error"> {
  const r = await call("DeleteItem", { Key: marshal({ PK, SK }), ...exprPayload(e) });
  if (!r) return "error";
  if (r.ok) return "deleted";
  return r.type === "ConditionalCheckFailedException" ? "failed" : "error";
}

export type TxOp =
  | ({ put: Flat & { PK: string; SK: string } } & Expr)
  | ({ update: { PK: string; SK: string }; set: string } & Expr)
  | ({ delete: { PK: string; SK: string } } & Expr)
  | ({ check: { PK: string; SK: string }; condition: string } & Expr);

/**
 * TransactWriteItems: all or nothing (max 100 ops; each costs 2x capacity). The table goes on every op, not the top level.
 * On a cancel, `reasons[i]` is the code for op i ("None", "ConditionalCheckFailed", ...), so callers can tell which condition failed.
 */
export async function ddbTransact(ops: TxOp[], token?: string): Promise<{ ok: true } | { ok: false; reasons: string[] } | null> {
  const c = ddbConfig();
  if (!c) return null;
  const TableName = c.table;
  const TransactItems = ops.map((op) => {
    const ex = exprPayload(op);
    if ("put" in op) return { Put: { TableName, Item: marshal(op.put), ...ex } };
    if ("update" in op) return { Update: { TableName, Key: marshal(op.update), UpdateExpression: op.set, ...ex } };
    if ("delete" in op) return { Delete: { TableName, Key: marshal(op.delete), ...ex } };
    return { ConditionCheck: { TableName, Key: marshal(op.check), ...ex } };
  });
  const payload: Record<string, unknown> = { TransactItems };
  if (token) payload.ClientRequestToken = token.slice(0, 36);
  const r = await call("TransactWriteItems", payload, false);
  if (!r) return null;
  if (r.ok) return { ok: true };
  if (r.type !== "TransactionCanceledException") return null;
  const reasons = ((r.json.CancellationReasons ?? []) as { Code?: string }[]).map((x) => x.Code ?? "None");
  return { ok: false, reasons };
}
