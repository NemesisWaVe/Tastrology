"use client";

import { PERSONAS, personaRequest } from "@/lib/personas";
import type { AgentRequest, StyleResult } from "@/lib/types";

/** "me" = the visitor's own saved reading (from the home page), everything else is a persona key. */
export const ME = "me";
const HOME_STORE = "tastrology:v1";
const cacheKey = (k: string) => `tastrology:persona:${k}`;

export interface Fighter {
  key: string;
  name: string;
  emoji: string;
  blurb: string;
}

function readJSON<T>(k: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "null") as T | null;
  } catch {
    return null;
  }
}

export function savedMine(): StyleResult | null {
  return readJSON<{ result?: StyleResult }>(HOME_STORE)?.result ?? null;
}

export function fighters(): Fighter[] {
  const list: Fighter[] = PERSONAS.map((p) => ({ key: p.key, name: p.name, emoji: p.emoji, blurb: p.blurb }));
  const mine = typeof window !== "undefined" ? savedMine() : null;
  if (mine) list.unshift({ key: ME, name: "You", emoji: "✦", blurb: mine.dna.name });
  return list;
}

export const isFighter = (k: string | null): k is string => Boolean(k) && (k === ME || PERSONAS.some((p) => p.key === k));

/** Cached first (persona runs are deterministic and cached server-side too), then a real agent run. */
export async function loadFighter(key: string, run: (req: AgentRequest) => Promise<StyleResult | null>): Promise<StyleResult | null> {
  if (key === ME) return savedMine();
  const hit = readJSON<StyleResult>(cacheKey(key)) ?? readJSON<StyleResult>(`tastrology:lab:${key}`);
  if (hit?.dna) return hit;
  const p = PERSONAS.find((x) => x.key === key);
  if (!p) return null;
  const r = await run(personaRequest(p));
  if (r)
    try {
      localStorage.setItem(cacheKey(key), JSON.stringify(r));
    } catch {}
  return r;
}
