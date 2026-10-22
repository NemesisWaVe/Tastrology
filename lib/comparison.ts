import { blocked } from "./guard";

export interface Baseline {
  brands: { name: string; reason: string }[];
  generatedAt: number;
  model: string;
}

/**
 * The JSON object holding "brands" inside a model's reply. Models sometimes wrap it in a fence or prose, or open with
 * a stray brace ("{
{\"brands\":…"), so try the reply whole, then from each brace before "brands" to each closing one.
 */
function brandsJson(content: string): { brands?: unknown } | null {
  const text = content.replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return JSON.parse(text);
  } catch {}
  const at = text.indexOf('"brands"');
  if (at < 0) return null;
  for (let start = text.lastIndexOf("{", at); start >= 0; start = text.lastIndexOf("{", start - 1)) {
    for (let end = text.lastIndexOf("}"); end > at; end = text.lastIndexOf("}", end - 1)) {
      try {
        const v = JSON.parse(text.slice(start, end + 1));
        if (v && typeof v === "object" && "brands" in v) return v;
      } catch {}
    }
  }
  return null;
}

export function parseBaseline(content: string): Baseline["brands"] | null {
  try {
    const raw = brandsJson(content);
    if (!raw) return null;
    if (!Array.isArray(raw.brands) || raw.brands.length < 1 || raw.brands.length > 6) return null;
    const brands: Baseline["brands"] = [];
    for (const value of raw.brands) {
      if (!value || typeof value.name !== "string" || typeof value.reason !== "string") return null;
      if (!value.name.trim() || value.name.length > 80 || value.reason.length > 300 || blocked(value.name)) return null;
      if (!brands.some((brand) => brand.name.toLowerCase() === value.name.trim().toLowerCase())) brands.push({ name: value.name.trim(), reason: value.reason.trim() });
    }
    return brands;
  } catch { return null; }
}
