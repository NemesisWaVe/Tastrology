/** Lowercase, single spaces, no stray marks: one spelling per query, so the browser, CDN and Qloo caches all match. */
export const normQ = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
