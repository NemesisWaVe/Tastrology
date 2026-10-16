"use client";

import type { StyleResult } from "@/lib/types";
import { ResultsView, type Vote } from "./results/ResultsView";

export type { Vote };

/** Back-compat wrapper: the results page now lives in components/results/ResultsView. */
export function Results(props: {
  result: StyleResult;
  votes: Record<string, Vote>;
  onVote: (id: string, v: Vote | null) => void;
  onShare: () => void;
  onReplan?: () => void;
  pending?: boolean;
}) {
  return <ResultsView {...props} />;
}
