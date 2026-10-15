import type { Persona } from "@/lib/personas";

export interface PersonaLook {
  glyph: string;
  a: string;
  b: string;
  sign: string; // a one-line horoscope-style teaser
}

const LOOKS: Record<string, PersonaLook> = {
  soft: { glyph: "☾", a: "#a5b4fc", b: "#f9a8d4", sign: "Cries at airports. Owns one perfect coat." },
  neon: { glyph: "ϟ", a: "#22d3ee", b: "#d946ef", sign: "Chrome on the outside, sourdough on the inside." },
  mumbai: { glyph: "✺", a: "#fb923c", b: "#facc15", sign: "Monsoon romantic with a Wes Anderson streak." },
};

function hue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function lookOf(p: Persona): PersonaLook {
  const known = LOOKS[p.key];
  if (known) return known;
  const h = hue(p.key);
  return { glyph: "✧", a: `hsl(${h} 85% 68%)`, b: `hsl(${(h + 60) % 360} 80% 60%)`, sign: p.blurb };
}
