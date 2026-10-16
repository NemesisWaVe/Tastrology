"use client";

import type { StyleResult } from "@/lib/types";
import { ShareSheet } from "./card/ShareSheet";

/** Back-compat wrapper: sharing now lives in components/card/ShareSheet (9:16 story + square PNG). */
export function ShareCard({ result, onClose }: { result: StyleResult; onClose: () => void }) {
  return <ShareSheet result={result} onClose={onClose} />;
}
