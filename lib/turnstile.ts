"use client";

/**
 * Cloudflare Turnstile on demand: loads the script the first time the server asks for a check, renders an
 * interaction-only widget (invisible unless Cloudflare wants a click), and resolves with a single-use token.
 * Off unless NEXT_PUBLIC_TURNSTILE_SITE_KEY is set.
 */
type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

function load(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export const turnstileSiteKey = () => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export async function turnstileToken(timeoutMs = 30_000): Promise<string> {
  const sitekey = turnstileSiteKey();
  if (!sitekey) return "";
  const api = await load();
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999";
  document.body.appendChild(host);
  let id = "";
  try {
    return await new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("verification timed out")), timeoutMs);
      id = api.render(host, {
        sitekey,
        appearance: "interaction-only",
        theme: "dark",
        callback: (token: string) => {
          clearTimeout(t);
          resolve(token);
        },
        "error-callback": () => {
          clearTimeout(t);
          reject(new Error("verification failed"));
        },
      });
    });
  } finally {
    if (id) api.remove(id);
    host.remove();
  }
}
