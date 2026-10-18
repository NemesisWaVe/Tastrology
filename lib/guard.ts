/**
 * Content guard for everything people type (search, vibes, picks, the "dressing for" line) and for what Qloo sends
 * back. Qloo's catalogue includes adult studios, performers and tags; a taste card is shareable and meant for 13+, so
 * those never reach the picker, the agent or the LLM prompt.
 *
 * Word-boundary match on a normalised string, with an allowlist for real titles that contain a flagged word
 * ("Sex and the City", "Sex on the Beach", "Sex Education", "Sex Pistols").
 */
const BLOCK = [
  "porn", "porno", "pornhub", "xxx", "xvideos", "xhamster", "redtube", "youporn", "brazzers", "onlyfans", "fansly", "chaturbate",
  "nsfw", "hentai", "rule 34", "rule34", "nude", "nudes", "nudity", "naked", "erotic", "erotica", "fetish", "bdsm", "kink", "kinky",
  "milf", "camgirl", "cam girl", "webcam sex", "escort", "escorts", "stripper", "strip club", "strip clubs", "sex", "sexy", "sexual",
  "sext", "sexting", "hookup", "hook up", "orgy", "blowjob", "handjob", "anal", "cum", "cock", "dick", "pussy", "boobs", "tits",
  "playboy", "penthouse", "hustler", "adult film", "adult films", "adult video", "adult entertainment", "jav", "lolicon", "loli",
  "shota", "incest", "rape", "pedo", "child porn", "cp",
  // hate and violence that has no place on a card
  "nazi", "kkk", "white power", "isis", "jihad", "terrorist", "school shooting",
];
/** Not blocked as "bad": someone may be having a hard time. The picker answers with a help line instead. */
const CARE = ["suicide", "suicidal", "self harm", "selfharm", "kill myself", "want to die", "cutting myself"];
const ALLOW = [
  "sex and the city", "sex on the beach", "sex education", "sex pistols", "sex lives of college girls", "sexy beast",
  "middlesex", "essex", "sussex", "wessex", "dick tracy", "moby dick", "philip k dick", "dick van dyke", "cocktail",
  "analog", "analogue", "kinky boots", "suicide squad", "virgin suicides", "suicide season", "ford escort", "escort mission",
  "the suicide squad", "suicideboys", "suicide boys",
];

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[0@]/g, "o")
    .replace(/[1!]/g, "i")
    .replace(/3/g, "e")
    .replace(/\$/g, "s")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const wordsRe = (ws: string[]) => new RegExp(`(?:^| )(?:${ws.map((w) => norm(w).replace(/ /g, " ?")).join("|")})(?: |$)`);
const BLOCK_RE = wordsRe(BLOCK);
const CARE_RE = wordsRe(CARE);

function stripAllowed(text: string): string {
  let t = ` ${norm(text)} `;
  for (const a of ALLOW) t = t.split(` ${norm(a)} `).join(" ");
  return t.trim();
}

/** Someone may be struggling: show a help line, not a "no". */
export function care(text: string | undefined | null): boolean {
  return Boolean(text) && CARE_RE.test(stripAllowed(text!));
}

/** True when the text is something a taste card shouldn't carry. Tag ids work too ("urn:tag:genre:media:hentai"). */
export function blocked(text: string | undefined | null): boolean {
  if (!text) return false;
  const t = stripAllowed(text);
  return BLOCK_RE.test(t) || CARE_RE.test(t);
}

/**
 * The nearest clean neighbours of a blocked search, offered as chips so a blocked word still leads somewhere.
 * Nothing is suggested for anything involving minors or hate.
 */
const NEAREST: [RegExp, string[]][] = [
  [wordsRe(["lolicon", "loli", "shota", "pedo", "cp", "child porn", "incest", "rape", "nazi", "kkk", "white power", "isis", "jihad", "terrorist", "school shooting"]), []],
  [wordsRe(["hentai", "rule 34", "rule34", "nsfw"]), ["Anime", "Manga", "Seinen"]],
  [wordsRe(["erotic", "erotica"]), ["Romance", "Poetry", "Art house"]],
  [wordsRe(["fetish", "bdsm", "kink", "kinky"]), ["Goth", "Punk", "Leather jacket"]],
  [wordsRe(["stripper", "strip club", "strip clubs", "escort", "escorts"]), ["Nightlife", "Cocktail bar", "Jazz club"]],
  [wordsRe(["playboy", "penthouse", "hustler"]), ["Vintage magazines", "Jazz", "Mid-century modern"]],
];
export function nearest(text: string): string[] {
  const t = stripAllowed(text);
  for (const [re, out] of NEAREST) if (re.test(t)) return out;
  return ["Romance", "Indie film", "Street food"];
}

/** A help line that works in any country (a directory of free, confidential lines). */
export const HELP_LINE = { label: "Find a helpline near you", href: "https://findahelpline.com" };

/** Drops results whose name (or id, for tags) trips the guard. */
export const clean = <T extends { name: string; id?: string }>(xs: T[]): T[] => xs.filter((x) => !blocked(x.name) && !blocked(x.id));
