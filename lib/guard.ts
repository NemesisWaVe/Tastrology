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
  "nazi", "kkk", "white power", "isis", "jihad", "terrorist", "school shooting", "suicide", "self harm",
];
const ALLOW = [
  "sex and the city", "sex on the beach", "sex education", "sex pistols", "sex lives of college girls", "sexy beast",
  "middlesex", "essex", "sussex", "wessex", "dick tracy", "moby dick", "philip k dick", "dick van dyke", "cocktail",
  "analog", "analogue", "kinky boots",
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

const BLOCK_RE = new RegExp(`(?:^| )(?:${BLOCK.map((w) => norm(w).replace(/ /g, " ?")).join("|")})(?: |$)`);

/** True when the text is something a taste card shouldn't carry. Tag ids work too ("urn:tag:genre:media:hentai"). */
export function blocked(text: string | undefined | null): boolean {
  if (!text) return false;
  let t = ` ${norm(text)} `;
  for (const a of ALLOW) t = t.replace(` ${norm(a)} `, " ");
  return BLOCK_RE.test(t.trim());
}

/** Drops results whose name (or id, for tags) trips the guard. */
export const clean = <T extends { name: string; id?: string }>(xs: T[]): T[] => xs.filter((x) => !blocked(x.name) && !blocked(x.id));
