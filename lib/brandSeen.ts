/** Per-card visit memory for the brand sheet, in this browser only: when you last looked and which brands were there. */
export interface Seen {
  at: number;
  visits: number;
  brands: string[];
}
const key = (code: string) => `tastrology:seen:${code}`;

export function readSeen(code: string): Seen | null {
  try {
    const j = JSON.parse(localStorage.getItem(key(code)) ?? "null") as Seen | null;
    return j && typeof j.at === "number" ? j : null;
  } catch {
    return null;
  }
}

export function writeSeen(code: string, brands: string[], prev: Seen | null): void {
  try {
    localStorage.setItem(key(code), JSON.stringify({ at: Date.now(), visits: (prev?.visits ?? 0) + 1, brands }));
  } catch {}
}
