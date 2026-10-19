import { blocked } from "./guard";

export interface Baseline {
  brands: { name: string; reason: string }[];
  generatedAt: number;
  model: string;
}

export function parseBaseline(content: string): Baseline["brands"] | null {
  try {
    const raw = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "")) as { brands?: unknown };
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
