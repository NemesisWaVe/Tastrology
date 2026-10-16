"use client";

import { useSearchParams } from "next/navigation";
import { BattleArena } from "./BattleArena";
import { BattlePicker } from "./BattlePicker";
import { isFighter } from "./data";

/** /vs?a=neon&b=soft runs the battle; anything missing or invalid opens the picker. */
export function VsRoute() {
  const q = useSearchParams();
  const a = q.get("a");
  const b = q.get("b");
  if (isFighter(a) && isFighter(b) && a !== b) return <BattleArena key={`${a}|${b}`} a={a} b={b} />;
  return <BattlePicker key={`${a}|${b}`} initialA={a} initialB={b} />;
}
