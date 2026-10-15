/**
 * Synthetic taste graph used when QLOO_MODE=mock (no key, offline demos, tests).
 * It mimics the *shape* of Qloo responses only. All entities, tags and scores
 * here are hand-made; no real Qloo response data is stored in this repo.
 */
import type { EntityKind } from "../types";

export const AXES = [
  ["minimalist", "Minimalist"],
  ["streetwear", "Streetwear"],
  ["vintage", "Vintage"],
  ["romantic", "Romantic"],
  ["techwear", "Techwear"],
  ["bohemian", "Bohemian"],
  ["preppy", "Preppy"],
  ["dark_academia", "Dark Academia"],
  ["avant_garde", "Avant-Garde"],
  ["gorpcore", "Gorpcore"],
  ["quiet_luxury", "Quiet Luxury"],
  ["y2k", "Y2K"],
  ["skate", "Skate"],
  ["cottagecore", "Cottagecore"],
  ["artisanal", "Artisanal"],
  ["noir", "Noir"],
  ["whimsical", "Whimsical"],
  ["clubwear", "Clubwear"],
] as const;

export type Axis = (typeof AXES)[number][0];
export type Vec = Partial<Record<Axis, number>>;

export const tagId = (a: Axis) => `urn:tag:style:mock:${a}`;
export const axisName = (a: Axis) => AXES.find((x) => x[0] === a)![1];

export interface MockEntity {
  id: string;
  name: string;
  kind: EntityKind;
  subtitle?: string;
  vec: Vec;
  pop: number;
  category?: string;
  tier?: 1 | 2 | 3;
}

let n = 0;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function e(kind: EntityKind, name: string, vec: Vec, subtitle?: string, pop = 0.6): MockEntity {
  n++;
  return { id: `mock-${kind}-${slug(name)}`, name, kind, vec, subtitle, pop: pop + (n % 7) * 0.01 };
}
function b(name: string, category: string, tier: 1 | 2 | 3, vec: Vec, pop = 0.6): MockEntity {
  return { ...e("brand", name, vec, category, pop), category, tier };
}

export const SEEDS: MockEntity[] = [
  // artists
  e("artist", "Phoebe Bridgers", { romantic: 0.7, vintage: 0.5, noir: 0.5, dark_academia: 0.4, minimalist: 0.3 }, "Indie folk"),
  e("artist", "Prateek Kuhad", { romantic: 0.8, artisanal: 0.5, minimalist: 0.4, bohemian: 0.4 }, "Indie pop · India"),
  e("artist", "The Weeknd", { noir: 0.8, quiet_luxury: 0.5, clubwear: 0.5, y2k: 0.3 }, "R&B"),
  e("artist", "Daft Punk", { techwear: 0.6, clubwear: 0.7, avant_garde: 0.5, y2k: 0.4 }, "Electronic"),
  e("artist", "Frank Ocean", { minimalist: 0.6, streetwear: 0.6, romantic: 0.5, avant_garde: 0.4 }, "R&B"),
  e("artist", "Taylor Swift", { romantic: 0.7, preppy: 0.5, cottagecore: 0.6, vintage: 0.3 }, "Pop"),
  e("artist", "Kendrick Lamar", { streetwear: 0.9, avant_garde: 0.4, skate: 0.3 }, "Hip-hop"),
  e("artist", "A.R. Rahman", { artisanal: 0.7, romantic: 0.5, quiet_luxury: 0.3, bohemian: 0.4 }, "Film score · India"),
  e("artist", "Arctic Monkeys", { vintage: 0.7, noir: 0.5, skate: 0.3, streetwear: 0.3 }, "Indie rock"),
  e("artist", "Radiohead", { avant_garde: 0.6, noir: 0.5, minimalist: 0.5, techwear: 0.3 }, "Alt rock"),
  e("artist", "Bad Bunny", { streetwear: 0.7, y2k: 0.6, clubwear: 0.5, whimsical: 0.3 }, "Reggaeton"),
  e("artist", "Mitski", { romantic: 0.6, noir: 0.5, vintage: 0.4, avant_garde: 0.3 }, "Indie rock"),
  // movies
  e("movie", "Past Lives", { minimalist: 0.7, romantic: 0.7, dark_academia: 0.2 }, "2023 · Celine Song"),
  e("movie", "Blade Runner 2049", { techwear: 0.9, noir: 0.8, avant_garde: 0.5, minimalist: 0.3 }, "2017 · Denis Villeneuve"),
  e("movie", "The Grand Budapest Hotel", { whimsical: 0.9, vintage: 0.7, preppy: 0.5, artisanal: 0.3 }, "2014 · Wes Anderson"),
  e("movie", "Spirited Away", { whimsical: 0.8, artisanal: 0.6, cottagecore: 0.5, bohemian: 0.3 }, "2001 · Hayao Miyazaki"),
  e("movie", "The Lunchbox", { artisanal: 0.7, romantic: 0.5, vintage: 0.5, minimalist: 0.3 }, "2013 · Ritesh Batra"),
  e("movie", "Call Me by Your Name", { romantic: 0.8, preppy: 0.5, vintage: 0.5, bohemian: 0.3 }, "2017 · Luca Guadagnino"),
  e("movie", "Dune", { avant_garde: 0.6, gorpcore: 0.5, minimalist: 0.5, techwear: 0.4, noir: 0.3 }, "2021 · Denis Villeneuve"),
  e("movie", "Lost in Translation", { minimalist: 0.6, romantic: 0.6, noir: 0.3, y2k: 0.3 }, "2003 · Sofia Coppola"),
  e("movie", "The Royal Tenenbaums", { vintage: 0.7, preppy: 0.6, whimsical: 0.6, dark_academia: 0.3 }, "2001 · Wes Anderson"),
  // tv
  e("tv_show", "Normal People", { minimalist: 0.6, romantic: 0.7, dark_academia: 0.4 }, "BBC Three"),
  e("tv_show", "Succession", { quiet_luxury: 0.9, minimalist: 0.6, preppy: 0.5 }, "HBO"),
  e("tv_show", "Euphoria", { y2k: 0.8, clubwear: 0.6, avant_garde: 0.5, streetwear: 0.4 }, "HBO"),
  e("tv_show", "The Great British Bake Off", { cottagecore: 0.9, whimsical: 0.5, preppy: 0.4, vintage: 0.3 }, "Channel 4"),
  e("tv_show", "The Bear", { artisanal: 0.6, minimalist: 0.5, streetwear: 0.4, gorpcore: 0.2 }, "FX"),
  e("tv_show", "Twin Peaks", { noir: 0.7, vintage: 0.7, avant_garde: 0.4 }, "ABC"),
  // books
  e("book", "Norwegian Wood", { romantic: 0.7, minimalist: 0.5, vintage: 0.5, dark_academia: 0.4 }, "Haruki Murakami"),
  e("book", "The Secret History", { dark_academia: 0.95, vintage: 0.6, preppy: 0.4, noir: 0.4 }, "Donna Tartt"),
  e("book", "Neuromancer", { techwear: 0.9, noir: 0.7, avant_garde: 0.4 }, "William Gibson"),
  e("book", "Little Women", { cottagecore: 0.7, romantic: 0.6, vintage: 0.5 }, "Louisa May Alcott"),
  e("book", "Kafka on the Shore", { whimsical: 0.5, minimalist: 0.4, noir: 0.4, dark_academia: 0.3 }, "Haruki Murakami"),
  // places
  e("place", "Berghain", { clubwear: 0.9, noir: 0.8, techwear: 0.5, avant_garde: 0.5 }, "Nightclub · Berlin"),
  e("place", "Blue Tokai Coffee Roasters", { artisanal: 0.7, minimalist: 0.6 }, "Café · Mumbai"),
  e("place", "Shakespeare and Company", { dark_academia: 0.8, vintage: 0.7, bohemian: 0.3 }, "Bookshop · Paris"),
  e("place", "Arashiyama Bamboo Grove", { minimalist: 0.6, artisanal: 0.5, whimsical: 0.3 }, "Kyoto"),
  e("place", "Joshua Tree National Park", { gorpcore: 0.8, bohemian: 0.6 }, "California"),
  e("place", "Venice Skatepark", { skate: 0.9, streetwear: 0.6 }, "Los Angeles"),
  e("place", "Kala Ghoda Arts District", { artisanal: 0.7, bohemian: 0.5, vintage: 0.4 }, "Mumbai"),
  e("place", "Le Marais", { romantic: 0.5, vintage: 0.5, minimalist: 0.4, quiet_luxury: 0.4 }, "Paris"),
  // podcasts
  e("podcast", "99% Invisible", { minimalist: 0.5, artisanal: 0.5, avant_garde: 0.3, dark_academia: 0.3 }, "Design"),
  e("podcast", "Call Her Daddy", { y2k: 0.6, clubwear: 0.3, quiet_luxury: 0.3, streetwear: 0.3 }, "Culture"),
  e("podcast", "Huberman Lab", { gorpcore: 0.6, techwear: 0.4, minimalist: 0.3 }, "Science"),
  // games
  e("videogame", "Cyberpunk 2077", { techwear: 0.9, noir: 0.6, clubwear: 0.5, streetwear: 0.4 }, "CD Projekt Red"),
  e("videogame", "Animal Crossing: New Horizons", { cottagecore: 0.8, whimsical: 0.8 }, "Nintendo"),
  e("videogame", "Stardew Valley", { cottagecore: 0.9, artisanal: 0.5, bohemian: 0.3 }, "ConcernedApe"),
  e("videogame", "Death Stranding", { techwear: 0.7, gorpcore: 0.7, avant_garde: 0.5 }, "Kojima Productions"),
  e("videogame", "Tony Hawk's Pro Skater", { skate: 0.9, streetwear: 0.6, y2k: 0.3 }, "Activision"),
];

export const BRANDS: MockEntity[] = [
  b("Arc'teryx", "Outerwear", 3, { gorpcore: 0.9, techwear: 0.7, minimalist: 0.3 }),
  b("The North Face", "Outerwear", 2, { gorpcore: 0.8, streetwear: 0.4 }),
  b("Acronym", "Outerwear", 3, { techwear: 1, avant_garde: 0.6, noir: 0.4 }),
  b("Barbour", "Outerwear", 3, { preppy: 0.7, vintage: 0.5, dark_academia: 0.5 }),
  b("Patagonia", "Outerwear", 2, { gorpcore: 0.8, bohemian: 0.3 }),
  b("COS", "Apparel", 2, { minimalist: 0.9, avant_garde: 0.3 }),
  b("Uniqlo", "Apparel", 1, { minimalist: 0.8 }, 0.9),
  b("Muji", "Apparel", 1, { minimalist: 0.8, artisanal: 0.4 }, 0.8),
  b("Aimé Leon Dore", "Apparel", 3, { preppy: 0.6, streetwear: 0.6, vintage: 0.4 }),
  b("Stüssy", "Apparel", 2, { streetwear: 0.8, skate: 0.6, y2k: 0.3 }),
  b("Carhartt WIP", "Apparel", 2, { streetwear: 0.6, skate: 0.6, gorpcore: 0.3, vintage: 0.3 }),
  b("Rick Owens", "Apparel", 3, { avant_garde: 0.9, noir: 0.8, clubwear: 0.5 }),
  b("Comme des Garçons", "Apparel", 3, { avant_garde: 1, minimalist: 0.4, noir: 0.4 }),
  b("Lemaire", "Apparel", 3, { minimalist: 0.8, romantic: 0.4, artisanal: 0.4 }),
  b("Toteme", "Apparel", 3, { minimalist: 0.8, quiet_luxury: 0.5 }),
  b("Loro Piana", "Knitwear", 3, { quiet_luxury: 1, minimalist: 0.6, preppy: 0.3 }),
  b("Ralph Lauren", "Apparel", 3, { preppy: 0.9, vintage: 0.4, quiet_luxury: 0.4 }, 0.9),
  b("Ganni", "Apparel", 2, { romantic: 0.5, y2k: 0.4, whimsical: 0.5, bohemian: 0.3 }),
  b("Dôen", "Apparel", 2, { romantic: 0.8, cottagecore: 0.7, bohemian: 0.6, vintage: 0.4 }),
  b("Reformation", "Apparel", 2, { romantic: 0.6, vintage: 0.5, y2k: 0.3 }),
  b("Kapital", "Denim", 3, { artisanal: 0.8, bohemian: 0.6, whimsical: 0.5, vintage: 0.5 }),
  b("Bode", "Apparel", 3, { artisanal: 0.8, vintage: 0.7, whimsical: 0.4 }),
  b("Good Earth", "Home & Apparel", 3, { artisanal: 0.8, bohemian: 0.5, quiet_luxury: 0.4 }),
  b("Fabindia", "Apparel", 1, { artisanal: 0.8, bohemian: 0.6 }, 0.8),
  b("Nicobar", "Apparel", 2, { artisanal: 0.6, minimalist: 0.5, bohemian: 0.4 }),
  b("Bodice", "Apparel", 2, { minimalist: 0.7, avant_garde: 0.5, artisanal: 0.4 }),
  b("Urban Outfitters", "Apparel", 1, { y2k: 0.6, vintage: 0.5, streetwear: 0.4 }, 0.85),
  b("Diesel", "Denim", 2, { y2k: 0.8, clubwear: 0.6, streetwear: 0.4 }),
  b("Mugler", "Apparel", 3, { clubwear: 0.8, avant_garde: 0.6, quiet_luxury: 0.5, y2k: 0.4 }),
  b("Cath Kidston", "Accessories", 1, { cottagecore: 1, whimsical: 0.6, vintage: 0.5 }),
  b("Boden", "Apparel", 2, { preppy: 0.6, cottagecore: 0.6, whimsical: 0.5 }),
  b("Vans", "Sneakers", 1, { skate: 0.9, streetwear: 0.6, vintage: 0.3 }, 0.9),
  b("Salomon", "Sneakers", 2, { gorpcore: 0.8, techwear: 0.7, streetwear: 0.3 }),
  b("New Balance", "Sneakers", 2, { streetwear: 0.6, preppy: 0.4, minimalist: 0.4, gorpcore: 0.3 }, 0.9),
  b("Onitsuka Tiger", "Sneakers", 2, { vintage: 0.6, minimalist: 0.5, y2k: 0.3 }),
  b("Nike ACG", "Sneakers", 2, { gorpcore: 0.7, techwear: 0.6 }),
  b("Le Labo", "Fragrance", 3, { minimalist: 0.6, artisanal: 0.6, quiet_luxury: 0.5 }),
  b("Byredo", "Fragrance", 3, { minimalist: 0.6, noir: 0.5, avant_garde: 0.4, quiet_luxury: 0.4 }),
  b("Diptyque", "Fragrance", 3, { romantic: 0.6, dark_academia: 0.5, vintage: 0.5, quiet_luxury: 0.4 }),
  b("Maison Margiela Replica", "Fragrance", 3, { romantic: 0.5, vintage: 0.6, minimalist: 0.3 }),
  b("Forest Essentials", "Skincare", 2, { artisanal: 0.8, quiet_luxury: 0.4 }),
  b("Aesop", "Skincare", 3, { minimalist: 0.7, artisanal: 0.6, dark_academia: 0.5 }),
  b("Glossier", "Beauty", 2, { minimalist: 0.6, romantic: 0.4, y2k: 0.3 }),
  b("Fenty Beauty", "Beauty", 2, { clubwear: 0.5, streetwear: 0.5, y2k: 0.4, quiet_luxury: 0.3 }),
  b("Kama Ayurveda", "Skincare", 2, { artisanal: 0.8, bohemian: 0.4 }),
  b("The Ordinary", "Skincare", 1, { minimalist: 0.8, techwear: 0.3 }, 0.85),
  b("Gentle Monster", "Eyewear", 2, { avant_garde: 0.7, techwear: 0.5, y2k: 0.4 }),
  b("Oliver Peoples", "Eyewear", 3, { vintage: 0.6, preppy: 0.5, minimalist: 0.4 }),
  b("Jacquemus", "Accessories", 3, { romantic: 0.5, whimsical: 0.6, quiet_luxury: 0.4 }),
];

export const ALL: MockEntity[] = [...SEEDS, ...BRANDS];
export const BY_ID = new Map(ALL.map((x) => [x.id, x]));

const norm = (v: Vec) => Math.sqrt(Object.values(v).reduce((s, x) => s + (x ?? 0) ** 2, 0)) || 1;
export function cos(a: Vec, b: Vec): number {
  let dot = 0;
  for (const k in a) dot += (a[k as Axis] ?? 0) * (b[k as Axis] ?? 0);
  return dot / (norm(a) * norm(b));
}

export function topAxes(v: Vec, k = 3): Axis[] {
  return (Object.entries(v) as [Axis, number][])
    .sort((x, y) => y[1] - x[1])
    .slice(0, k)
    .map((x) => x[0]);
}
