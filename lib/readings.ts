import { buildCard, cardCode } from "./card";
import { isSavedResult, slim, trimResult } from "./saved";
import type { AgentRequest, BrandMatch, StyleResult } from "./types";

/**
 * Readings saved on this device. `tastrology:v1` is the latest one (home reopens it); every reading is also filed
 * under its card code (`tastrology:r:<code>`), so /c/<code> can find the reading for any card this device minted.
 */
export type Vote = "up" | "down";

export interface Reading {
  req?: AgentRequest;
  result?: StyleResult;
  votes: Record<string, Vote>;
  pinned: BrandMatch[];
}

export const LATEST = "tastrology:v1";
const INDEX = "tastrology:r";
const keyOf = (code: string) => `tastrology:r:${code}`;
/** Older readings past this are dropped first when the store fills (each is a few KB). */
const KEEP = 24;

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function drop(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

function resultOk(r: unknown): r is StyleResult {
  if (!isSavedResult(r)) return false;
  try {
    buildCard(r); // the result screen and the deck both walk this; if it throws here it would throw there
    return true;
  } catch {
    return false;
  }
}

/** A save that no longer has the right shape (old version, hand edit) is null, not rendered. */
function parse(s: unknown): Reading | null {
  if (!s || typeof s !== "object") return null;
  const o = s as Partial<Reading>;
  if (o.result !== undefined && !resultOk(o.result)) return null;
  return {
    req: o.req && Array.isArray(o.req.seeds) ? o.req : undefined,
    result: o.result,
    votes: o.votes && typeof o.votes === "object" ? o.votes : {},
    pinned: Array.isArray(o.pinned) ? o.pinned.filter((b) => b && typeof b === "object" && b.entity && typeof b.entity.id === "string") : [],
  };
}

export function codeOf(result: StyleResult | undefined | null): string | null {
  if (!result) return null;
  try {
    return cardCode(buildCard(result));
  } catch {
    return null;
  }
}

/** The latest reading on this device, or null. A broken one is removed. */
export function loadLatest(): Reading | null {
  const raw = read(LATEST);
  const r = parse(raw);
  if (raw && !r) drop(LATEST);
  return r;
}

export function latestCode(): string | null {
  return codeOf(loadLatest()?.result);
}

/** The reading behind card `code`, if this device minted it (filed by code, or the latest one from before filing). */
export function loadReading(code: string): Reading | null {
  const raw = read(keyOf(code));
  const r = parse(raw);
  if (r?.result && codeOf(r.result) === code) return r;
  if (raw) {
    drop(keyOf(code));
    setIndex(index().filter((c) => c !== code));
  }
  const latest = loadLatest();
  if (latest?.result && codeOf(latest.result) === code) {
    file(code, latest);
    return latest;
  }
  return null;
}

function index(): string[] {
  const i = read(INDEX);
  return Array.isArray(i) ? i.filter((c): c is string => typeof c === "string") : [];
}

/** How many cards this device minted (and still keeps a reading for). */
export function mintedHere(): number {
  return index().length;
}

function setIndex(codes: string[]) {
  try {
    localStorage.setItem(INDEX, JSON.stringify(codes));
  } catch {}
}

function slimmed(r: Reading): Reading {
  return { req: r.req, result: r.result && trimResult(r.result), votes: r.votes, pinned: r.pinned.map((b) => ({ ...b, entity: slim(b.entity) })) };
}

/** File under the card code; when the store is full, the oldest readings go first. */
function file(code: string, r: Reading) {
  const json = JSON.stringify(slimmed(r));
  let codes = [code, ...index().filter((c) => c !== code)];
  for (const old of codes.slice(KEEP)) drop(keyOf(old));
  codes = codes.slice(0, KEEP);
  for (;;) {
    try {
      localStorage.setItem(keyOf(code), json);
      break;
    } catch {
      const old = codes.length > 1 ? codes.pop() : undefined;
      if (!old) return;
      drop(keyOf(old));
    }
  }
  setIndex(codes);
}

/** Save a finished reading under its code, and as the latest one when `latest`. Returns the code. */
export function saveReading(r: Reading, { latest }: { latest: boolean }): string | null {
  const code = codeOf(r.result);
  if (!code) return null;
  file(code, r);
  if (latest)
    try {
      localStorage.setItem(LATEST, JSON.stringify(slimmed(r)));
    } catch {}
  return code;
}

/**
 * The full reading is the moment right after a mint. For a while after it, opening the site or the card's page lands
 * on the reading; after that the card's page is the card, and the reading is one tap away.
 */
const FRESH = "tastrology:fresh";
export const FRESH_MS = 30 * 60 * 1000;

export function markFresh(code: string) {
  try {
    localStorage.setItem(FRESH, JSON.stringify({ code, at: Date.now() }));
  } catch {}
}

export function isFresh(code: string | null | undefined, now = Date.now()): boolean {
  if (!code) return false;
  const f = read(FRESH) as { code?: unknown; at?: unknown } | null;
  return !!f && f.code === code && typeof f.at === "number" && now - f.at >= 0 && now - f.at < FRESH_MS;
}

/** A burned card: its reading goes too, and so does the latest one when it was this card. */
export function forgetReading(code: string) {
  if ((read(FRESH) as { code?: unknown } | null)?.code === code) drop(FRESH);
  drop(keyOf(code));
  setIndex(index().filter((c) => c !== code));
  if (codeOf((read(LATEST) as Reading | null)?.result) === code) drop(LATEST);
}

export function clearLatest() {
  drop(LATEST);
}
