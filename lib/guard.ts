/**
 * Content guard for everything people type (search, vibes, picks, the "dressing for" line) and for what Qloo sends
 * back. Qloo's catalogue includes adult studios, performers and tags; a taste card is shareable and meant for 13+, so
 * those never reach the picker, the agent or the LLM prompt.
 *
 * Two passes on a normalised string (leetspeak undone, s p a c e d letters joined):
 * - whole words from BLOCK, with an allowlist for real titles that contain one ("Sex and the City", "Moby Dick");
 * - STEMS anywhere inside a word, so "hentaides", "xxcuckxx" or "fuuuck" don't slip through a username. Stems are
 *   only strings that are rude wherever they appear; SAFE_INSIDE lists the real words that hide one ("therapist").
 * lib/moderate.ts adds a model's read on top for what people type about themselves (names, bios, picks).
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
  // slurs and insults aimed at people: names and bios are public on friends' lists
  "cuck", "cuckold", "cucked", "incel", "slut", "sluts", "whore", "whores", "thot", "bitch", "bitches",
  "cunt", "fuck", "fucker", "fucking", "motherfucker", "stfu", "gtfo", "wanker", "twat", "bastard", "retard", "retarded",
  "nigger", "nigga", "niggas", "faggot", "fag", "fags", "tranny", "dyke", "chink", "gook", "spic", "kike", "paki", "coon",
  "wetback", "beaner", "raghead", "towelhead", "kys", "kill yourself", "go die", "heil hitler", "hitler", "1488",
];
/** Rude anywhere inside a word. Kept to strings that no ordinary word contains (see SAFE_INSIDE for the few that do). */
const STEMS = [
  "porn", "hentai", "nsfw", "onlyfans", "fansly", "xvideo", "xhamster", "brazzers", "chaturbate", "rule34", "milf", "blowjob",
  "handjob", "cumshot", "sexy", "nude", "boob", "titty", "titties", "pussy", "dildo", "horny", "erotic", "fetish", "lolicon",
  "cuck", "slut", "whore", "bitch", "cunt", "fuck", "wank", "retard", "rapist", "pedo", "paedo", "nigg", "faggot",
  "tranny", "nazi", "hitler",
];
const SAFE_INSIDE = ["therapist", "torpedo", "cuckoo", "scunthorpe", "snigger", "niggle", "niggling", "niggard", "pedometer", "swank", "thorny", "retardant", "ignazio", "nazionale"];
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
    .replace(/0/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/[4@]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/[^a-z0-9]+/g, " ")
    // "c u c k" or "c.u.c.k": runs of lone letters read as one word
    .replace(/(?<![a-z])(?:[a-z] ){2,}[a-z](?![a-z])/g, (m) => m.replace(/ /g, ""))
    .trim();

/** "fuuuck" → "fuck": every run of a letter counts once. */
const squeeze = (s: string) => s.replace(/(.)\1+/g, "$1");
const STEMS_N = STEMS.map(norm);
const STEMS_SQ = STEMS_N.map(squeeze).filter((x) => x.length >= 4);

/** A stem hiding inside any word, after the real words that innocently contain one are taken out. */
function hidden(t: string): boolean {
  for (let w of t.split(" ")) {
    if (w.length < 4) continue;
    for (const a of SAFE_INSIDE) w = w.split(a).join(" ");
    if (STEMS_N.some((x) => w.includes(x))) return true;
    const sq = squeeze(w);
    if (STEMS_SQ.some((x) => sq.includes(x))) return true;
  }
  return false;
}

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
  return BLOCK_RE.test(t) || CARE_RE.test(t) || hidden(t);
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
