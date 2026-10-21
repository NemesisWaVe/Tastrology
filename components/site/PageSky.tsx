"use client";

import { useReducedMotion } from "motion/react";
import { Sky } from "@/components/reveal/Sky";
import { skyState } from "@/components/reveal/traceModel";

const OPEN_SKY = skyState([], "");

/** The calm night sky behind a whole page (the Hall, battles and Friends sit on the same one). */
export function PageSky({ dim = 0.5 }: { dim?: number }) {
  const reduce = useReducedMotion() ?? false;
  return <Sky f={OPEN_SKY} reduce={reduce} fixed quiet drawn dim={dim} />;
}
