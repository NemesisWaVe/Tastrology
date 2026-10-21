import type { AgentRequest, EntityKind } from "./types";

export interface Persona {
  key: string;
  name: string;
  blurb: string;
  emoji: string;
  seeds: { name: string; kind: EntityKind }[];
  budget?: 1 | 2 | 3;
  /** The tier this demo card shows, so the home page has one of each: Rare, Holo Rare, Secret Rare. */
  showcase: "rare" | "holo" | "secret";
}

/** Seeds are resolved through Qloo search at run time, so the same personas work in live and mock mode. */
export const PERSONAS: Persona[] = [
  {
    key: "soft",
    name: "The Soft Melancholic",
    emoji: "🌙",
    showcase: "rare",
    blurb: "Sad-girl indie, slow cinema, Murakami on the train",
    seeds: [
      { name: "Phoebe Bridgers", kind: "artist" },
      { name: "Past Lives", kind: "movie" },
      { name: "Norwegian Wood", kind: "book" },
      { name: "Normal People", kind: "tv_show" },
      { name: "Shakespeare and Company", kind: "place" },
    ],
  },
  {
    key: "neon",
    name: "The Neon Contradiction",
    emoji: "⚡",
    showcase: "holo",
    blurb: "Cyberpunk nights… and a soft spot for baking shows",
    seeds: [
      { name: "Blade Runner 2049", kind: "movie" },
      { name: "Daft Punk", kind: "artist" },
      { name: "Cyberpunk 2077", kind: "videogame" },
      { name: "Neuromancer", kind: "book" },
      { name: "The Great British Baking Show", kind: "tv_show" },
    ],
  },
  {
    key: "mumbai",
    name: "The Golden Storyteller",
    emoji: "🪔",
    showcase: "secret",
    blurb: "Prateek Kuhad, The Lunchbox, Made in Heaven, Ghibli",
    seeds: [
      { name: "Prateek Kuhad", kind: "artist" },
      { name: "The Lunchbox", kind: "movie" },
      { name: "Made in Heaven", kind: "tv_show" },
      { name: "The Grand Budapest Hotel", kind: "movie" },
      { name: "Spirited Away", kind: "movie" },
    ],
  },
];

export function personaRequest(p: Persona): AgentRequest {
  return { seeds: p.seeds.map((s) => ({ id: "", ...s })), budget: p.budget };
}

/** True when a request is one of the demo personas (their seeds carry names, not Qloo ids). Demo cards stay out of decks. */
/** The persona a request matches, by its seed names. */
export function personaFor(req: AgentRequest | null | undefined): Persona | undefined {
  if (!req || req.seeds.some((s) => s.id)) return undefined;
  const names = req.seeds.map((s) => s.name.toLowerCase()).sort().join("|");
  return PERSONAS.find((p) => p.seeds.map((s) => s.name.toLowerCase()).sort().join("|") === names);
}

export function isPersonaRequest(req: AgentRequest | null | undefined): boolean {
  if (!req || req.seeds.some((s) => s.id)) return false;
  const names = req.seeds.map((s) => s.name.toLowerCase()).sort().join("|");
  return PERSONAS.some((p) => p.seeds.map((s) => s.name.toLowerCase()).sort().join("|") === names);
}
