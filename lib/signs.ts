/**
 * The twelve signs: the families a card's types fall into (lib/card.ts typeOf matches them in this order, so the
 * first family that fits a style word wins). Your sign is your Sun's family. Each sign also names the Qloo
 * personal_style tag its weekly reading is drawn from (lib/weekly.ts).
 */
export interface Sign {
  id: string;
  name: string;
  glyph: string;
  a: string;
  b: string;
  re: RegExp;
  /** Qloo `urn:tag:personal_style:qloo:<tag>`: brands Qloo describes in this style. */
  tag: string;
  /** One line about the sign, for its page and the list. */
  about: string;
  /** Words the weekly line can lean on. */
  moods: [string, string, string];
}

export const SIGNS: readonly Sign[] = [
  { id: "futurist", name: "Futurist", glyph: "⚡", a: "#38bdf8", b: "#8b5cf6", re: /futur|tech|industrial|architect|precision|engineer|cyber|sharp/i, tag: "futuristic", about: "You dress for a year that hasn't happened yet.", moods: ["forward", "electric", "precise"] },
  { id: "romantic", name: "Romantic", glyph: "✿", a: "#f472b6", b: "#fda4af", re: /floral|romantic|feminine|soft|delicate|whimsical pattern/i, tag: "romantic", about: "Soft on the outside, certain on the inside.", moods: ["tender", "lush", "unhurried"] },
  { id: "vintage", name: "Vintage", glyph: "◷", a: "#f59e0b", b: "#b45309", re: /vintage|retro|heritage|nostalg|classic|timeless/i, tag: "vintage", about: "You'd rather find it than buy it new.", moods: ["warm", "worn-in", "storied"] },
  { id: "minimalist", name: "Minimalist", glyph: "◯", a: "#e2e8f0", b: "#94a3b8", re: /minimal|clean|understated|neutral|monochrom|modern/i, tag: "minimalist", about: "One good thing beats ten loud ones.", moods: ["quiet", "exact", "pared back"] },
  { id: "artisan", name: "Artisan", glyph: "❋", a: "#fb923c", b: "#c2410c", re: /boho|bohemian|ethnic|handcraft|embroider|textile|texture|artisan|traditional/i, tag: "bohemian", about: "You want to see the hand that made it.", moods: ["textured", "loose", "sunlit"] },
  { id: "rebel", name: "Rebel", glyph: "✦", a: "#f43f5e", b: "#1f2937", re: /edgy|grunge|dark|noir|punk|rebel|gothic/i, tag: "edgy", about: "If everyone likes it, you're already out.", moods: ["sharp", "after dark", "loud"] },
  { id: "utility", name: "Utility", glyph: "▲", a: "#a3e635", b: "#15803d", re: /athleisure|sport|utility|utilitarian|outdoor|functional|practical/i, tag: "utilitarian", about: "Pockets first. Then everything else.", moods: ["ready", "rugged", "moving"] },
  { id: "luxe", name: "Luxe", glyph: "◆", a: "#fcd34d", b: "#a16207", re: /luxe|luxury|elegant|sophisticat|refined|polished|chic|dapper/i, tag: "elegant", about: "Polish is a habit, not an occasion.", moods: ["polished", "golden", "composed"] },
  { id: "playful", name: "Playful", glyph: "☻", a: "#facc15", b: "#ec4899", re: /whimsical|playful|quirk|colorful|pop/i, tag: "playful", about: "Colour is a mood you can wear.", moods: ["bright", "silly", "sunny"] },
  { id: "avant", name: "Avant-Garde", glyph: "◐", a: "#d946ef", b: "#22d3ee", re: /avant|unconventional|artistic|eclectic|individual|experimental|oversized|silhouette/i, tag: "avant_garde", about: "You'd rather be interesting than pretty.", moods: ["strange", "bold", "sculptural"] },
  { id: "tailored", name: "Tailored", glyph: "♜", a: "#60a5fa", b: "#1e3a8a", re: /british|preppy|tailored|professional/i, tag: "tailored", about: "A good fit says it before you do.", moods: ["crisp", "steady", "sharp-cut"] },
  { id: "natural", name: "Natural", glyph: "❦", a: "#86efac", b: "#4d7c0f", re: /authentic|organic|natural|earthy/i, tag: "natural", about: "Things that grow, and things that last.", moods: ["earthy", "green", "slow"] },
];

export const signById = (id: string): Sign | undefined => SIGNS.find((s) => s.id === id);

/** The sign a style word (a card's Sun, Moon or Rising) belongs to, or undefined for a word no family claims. */
export const signFor = (word: string): Sign | undefined => SIGNS.find((s) => s.re.test(word));

/** "19 Oct" for a week's Monday. */
export const weekOf = (start: number) => new Date(start).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** ISO week (Monday start, UTC): "2026-W43" and the Monday it began. */
export function isoWeek(now = Date.now()): { key: string; start: number } {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7;
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  const thu = new Date(start + 3 * 86400000);
  const jan1 = Date.UTC(thu.getUTCFullYear(), 0, 1);
  const wk = 1 + Math.floor((thu.getTime() - jan1) / (7 * 86400000));
  return { key: `${thu.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`, start };
}
