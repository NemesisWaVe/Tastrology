import type { AgentRequest, EntityKind } from "./types";

export interface Persona {
  key: string;
  name: string;
  blurb: string;
  emoji: string;
  seeds: { name: string; kind: EntityKind }[];
  budget?: 1 | 2 | 3;
}

/** Seeds are resolved through Qloo search at run time, so the same personas work in live and mock mode. */
export const PERSONAS: Persona[] = [
  {
    key: "soft",
    name: "The Soft Melancholic",
    emoji: "🌙",
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
    blurb: "Cyberpunk nights… and a soft spot for baking shows",
    seeds: [
      { name: "Blade Runner 2049", kind: "movie" },
      { name: "Berghain", kind: "place" },
      { name: "Cyberpunk 2077", kind: "videogame" },
      { name: "Neuromancer", kind: "book" },
      { name: "The Great British Bake Off", kind: "tv_show" },
    ],
  },
  {
    key: "mumbai",
    name: "The Mumbai Storyteller",
    emoji: "🪔",
    blurb: "Prateek Kuhad, The Lunchbox, Wes Anderson, Ghibli",
    seeds: [
      { name: "Prateek Kuhad", kind: "artist" },
      { name: "The Lunchbox", kind: "movie" },
      { name: "The Grand Budapest Hotel", kind: "movie" },
      { name: "Spirited Away", kind: "movie" },
      { name: "Kala Ghoda Arts District", kind: "place" },
    ],
  },
];

export function personaRequest(p: Persona): AgentRequest {
  return { seeds: p.seeds.map((s) => ({ id: "", ...s })), budget: p.budget };
}
