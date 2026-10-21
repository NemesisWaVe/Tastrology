/** Secrets lead, then the order alternates one Secret to two Holos, so the feed never runs dry of the top tier early. */
export function feedOrder(secret: string[], holo: string[]): string[] {
  const out: string[] = [];
  let s = 0, h = 0;
  while (s < secret.length || h < holo.length) {
    if (s < secret.length) out.push(secret[s++]);
    for (let k = 0; k < 2 && h < holo.length; k++) out.push(holo[h++]);
  }
  return out;
}
