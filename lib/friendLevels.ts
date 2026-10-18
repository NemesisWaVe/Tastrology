/** Friendship rises at most once a day per friend, by fighting (Pokemon GO's rule): days fought → level. Client-safe. */
export const LEVELS = [
  { days: 90, name: "Best" },
  { days: 30, name: "Ultra" },
  { days: 7, name: "Great" },
  { days: 1, name: "Good" },
] as const;

export const levelOf = (days: number) => LEVELS.find((l) => days >= l.days)?.name ?? "New";
