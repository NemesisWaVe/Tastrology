"use client";

export function track(event: "landed" | "picker" | "picked" | "shared" | "scanned" | "scan_minted", once = false) {
  try {
    if (navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
    const key = `tastrology:event:${event}:${new Date().toISOString().slice(0, 10)}`;
    if (once && sessionStorage.getItem(key)) return;
    if (once) sessionStorage.setItem(key, "1");
    void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event }), keepalive: true }).catch(() => {});
  } catch {}
}

export function recordScanMint() {
  try {
    const at = Number(sessionStorage.getItem("tastrology:scan-at"));
    if (at > Date.now() - 86400000) track("scan_minted", true);
  } catch {}
}

/** After a first card, ask whoever invited you to be friends (signed-in only; quietly does nothing otherwise). */
export async function befriendInviter() {
  try {
    const raw = localStorage.getItem("tastrology:invited-by");
    if (!raw) return;
    const { pc, at } = JSON.parse(raw) as { pc?: string; at?: number };
    if (!pc || !at || at < Date.now() - 7 * 86400000) return localStorage.removeItem("tastrology:invited-by");
    const r = await fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "add", pc }) });
    if (r.ok || r.status === 400) localStorage.removeItem("tastrology:invited-by");
  } catch {}
}

export function reportFailure(kind: "runtime" | "promise" | "reading") {
  void fetch("/api/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }), keepalive: true }).catch(() => {});
}
