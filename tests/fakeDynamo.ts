import { vi } from "vitest";

/* ------------------------------------------------------------ a tiny in-memory DynamoDB behind mocked fetch */

export type AV = { S?: string; N?: string };
export type Item = Record<string, AV>;

/** Just enough of DynamoDB's JSON API for lib/ddb.ts: conditions and updates in the shapes the app writes. */
export class FakeDynamo {
  items = new Map<string, Item>();
  calls: string[] = [];
  private k = (key: Item) => `${key.PK.S}|${key.SK.S}`;

  private cond(expr: string | undefined, item: Item | undefined, vals: Item = {}, names: Record<string, string> = {}): boolean {
    if (!expr) return true;
    expr = expr.replace(/#\w+/g, (n) => names[n] ?? n);
    if (/\s+OR\s+/.test(expr)) return expr.split(/\s+OR\s+/).some((e) => this.cond(e, item, vals));
    return expr.split(/\s+AND\s+/).every((c) => {
      c = c.trim();
      let m = c.match(/^attribute_not_exists\((\w+)\)$/);
      if (m) return !item?.[m[1]];
      m = c.match(/^attribute_exists\((\w+)\)$/);
      if (m) return Boolean(item?.[m[1]]);
      m = c.match(/^(\w+) >= (:\w+)$/);
      if (m) return item?.[m[1]]?.N !== undefined && Number(item[m[1]].N) >= Number(vals[m[2]].N);
      m = c.match(/^(\w+) < (:\w+)$/);
      if (m) return item?.[m[1]]?.N !== undefined && Number(item[m[1]].N) < Number(vals[m[2]].N);
      m = c.match(/^(\w+) <= (:\w+)$/);
      if (m) return item?.[m[1]]?.N !== undefined && Number(item[m[1]].N) <= Number(vals[m[2]].N);
      m = c.match(/^(\w+) = (:\w+)$/);
      if (m) return item?.[m[1]] !== undefined && JSON.stringify(item[m[1]]) === JSON.stringify(vals[m[2]]);
      throw new Error(`fake: unsupported condition ${c}`);
    });
  }

  private apply(item: Item, expr: string, vals: Item = {}, names: Record<string, string> = {}): Item {
    const out: Item = { ...item };
    const name = (n: string) => names[n] ?? n;
    const num = (t: string) => (t.startsWith(":") ? Number(vals[t].N) : Number(out[name(t)]?.N));
    const parts = expr.split(/\b(?=SET |ADD )/);
    for (const part of parts) {
      const body = part.replace(/^(SET|ADD)\s+/, "");
      if (part.startsWith("SET")) {
        for (const a of body.split(/,(?![^(]*\))/)) {
          const [lhs, rhs] = a.split("=").map((x) => x.trim());
          let m = rhs.match(/^(\S+) ([+-]) (\S+)$/);
          if (m) {
            const v = m[2] === "+" ? num(m[1]) + num(m[3]) : num(m[1]) - num(m[3]);
            out[name(lhs)] = { N: String(v) };
            continue;
          }
          m = rhs.match(/^if_not_exists\((\w+), (:\w+)\)$/);
          if (m) {
            if (!out[m[1]]) out[name(lhs)] = vals[m[2]];
            continue;
          }
          out[name(lhs)] = vals[rhs];
        }
      } else if (part.startsWith("ADD")) {
        for (const a of body.split(",")) {
          const [attr, v] = a.trim().split(/\s+/);
          out[name(attr)] = { N: String((Number(out[name(attr)]?.N) || 0) + Number(vals[v].N)) };
        }
      }
    }
    return out;
  }

  handle(action: string, p: Record<string, unknown>): { status: number; json: unknown } {
    this.calls.push(action);
    const ccf = { status: 400, json: { __type: "com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException" } };
    const vals = (p.ExpressionAttributeValues ?? {}) as Item;
    const names = (p.ExpressionAttributeNames ?? {}) as Record<string, string>;
    switch (action) {
      case "PutItem": {
        const it = p.Item as Item;
        if (!this.cond(p.ConditionExpression as string, this.items.get(this.k(it)), vals)) return ccf;
        this.items.set(this.k(it), it);
        return { status: 200, json: {} };
      }
      case "GetItem": {
        const it = this.items.get(this.k(p.Key as Item));
        return { status: 200, json: it ? { Item: it } : {} };
      }
      case "Query": {
        const pk = vals[":pk"].S!;
        const pre = vals[":sk"].S!;
        const Items = [...this.items.values()].filter((i) => i.PK.S === pk && i.SK.S!.startsWith(pre)).sort((a, b) => a.SK.S!.localeCompare(b.SK.S!));
        if (p.ScanIndexForward === false) Items.reverse();
        return { status: 200, json: { Items } };
      }
      case "DeleteItem": {
        const key = p.Key as Item;
        if (!this.cond(p.ConditionExpression as string, this.items.get(this.k(key)), vals)) return ccf;
        this.items.delete(this.k(key));
        return { status: 200, json: {} };
      }
      case "UpdateItem": {
        const key = p.Key as Item;
        const cur = this.items.get(this.k(key));
        if (!this.cond(p.ConditionExpression as string, cur, vals)) return ccf;
        this.items.set(this.k(key), this.apply(cur ?? { ...key }, p.UpdateExpression as string, vals, names));
        return { status: 200, json: {} };
      }
      case "TransactWriteItems": {
        if ("TableName" in p) return { status: 400, json: { __type: "ValidationException" } };
        const ops = p.TransactItems as Record<string, Record<string, unknown>>[];
        const staged = new Map(this.items);
        const reasons = ops.map((op) => {
          const [kind, b] = Object.entries(op)[0];
          if (b.TableName !== "t") throw new Error("fake: every op needs its TableName");
          const v = (b.ExpressionAttributeValues ?? {}) as Item;
          const key = (b.Item ?? b.Key) as Item;
          const cur = this.items.get(this.k(key));
          if (!this.cond(b.ConditionExpression as string, cur, v, (b.ExpressionAttributeNames ?? {}) as Record<string, string>)) return "ConditionalCheckFailed";
          if (kind === "Put") staged.set(this.k(key), b.Item as Item);
          else if (kind === "Update") staged.set(this.k(key), this.apply(cur ?? { ...key }, b.UpdateExpression as string, v, (b.ExpressionAttributeNames ?? {}) as Record<string, string>));
          else if (kind === "Delete") staged.delete(this.k(key));
          return "None";
        });
        if (reasons.some((r) => r !== "None"))
          return { status: 400, json: { __type: "com.amazonaws.dynamodb.v20120810#TransactionCanceledException", CancellationReasons: reasons.map((Code) => ({ Code })) } };
        this.items = staged;
        return { status: 200, json: {} };
      }
    }
    throw new Error(`fake: unsupported action ${action}`);
  }
}

/** Points lib/ddb.ts at a fresh FakeDynamo (table "t"); every other fetch fails like an unreachable backend. */
export function useFakeDynamo(): FakeDynamo {
  const db = new FakeDynamo();
  vi.stubEnv("DDB_TABLE", "t");
  vi.stubEnv("DDB_ACCESS_KEY_ID", "AKIDEXAMPLE");
  vi.stubEnv("DDB_SECRET_ACCESS_KEY", "test-secret");
  vi.stubEnv("DDB_REGION", "us-east-1");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (!String(url).includes("dynamodb")) throw new Error("offline");
    const action = String((init.headers as Record<string, string>)["x-amz-target"]).split(".").pop()!;
    const { status, json } = db.handle(action, JSON.parse(String(init.body)));
    return new Response(JSON.stringify(json), { status });
  });
  return db;
}
