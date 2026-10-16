/**
 * Minimal QR Code encoder (byte mode, error-correction level M, versions 1-6, up to 106 bytes).
 * Enough for the short "verify the digital twin" URL on the card back. No dependencies.
 * Follows ISO/IEC 18004 (structure after Project Nayuki's reference implementation).
 */

const EC_M: [number, number][] = [[0, 0], [10, 1], [16, 1], [26, 1], [18, 2], [24, 2], [16, 4]]; // [ec codewords per block, blocks]
const TOTAL = [0, 26, 44, 70, 100, 134, 172]; // raw codewords per version
const ALIGN = [0, 0, 18, 22, 26, 30, 34]; // second alignment coordinate (first is always 6)

function mul(x: number, y: number) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function divisor(deg: number) {
  const r = new Array<number>(deg).fill(0);
  r[deg - 1] = 1;
  let root = 1;
  for (let i = 0; i < deg; i++) {
    for (let j = 0; j < deg; j++) {
      r[j] = mul(r[j], root);
      if (j + 1 < deg) r[j] ^= r[j + 1];
    }
    root = mul(root, 2);
  }
  return r;
}

function remainder(data: number[], div: number[]) {
  const res = div.map(() => 0);
  for (const b of data) {
    const f = b ^ (res.shift() as number);
    res.push(0);
    div.forEach((c, i) => (res[i] ^= mul(c, f)));
  }
  return res;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function penalty(m: boolean[][]) {
  const n = m.length;
  let s = 0;
  let dark = 0;
  for (let a = 0; a < n; a++) {
    for (const row of [true, false]) {
      let run = 1;
      for (let b = 1; b < n; b++) {
        const cur = row ? m[a][b] : m[b][a];
        const prev = row ? m[a][b - 1] : m[b - 1][a];
        if (cur === prev) {
          run++;
          if (run === 5) s += 3;
          else if (run > 5) s++;
        } else run = 1;
      }
    }
  }
  for (let y = 0; y < n - 1; y++)
    for (let x = 0; x < n - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) s += 3;
    }
  for (const row of m) for (const c of row) if (c) dark++;
  return s + Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
}

/** Encode text into a QR module matrix (true = dark), indexed [row][col]. No quiet zone. */
export function qr(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  let v = 1;
  for (; v <= 6; v++) if (12 + bytes.length * 8 <= (TOTAL[v] - EC_M[v][0] * EC_M[v][1]) * 8) break;
  if (v > 6) throw new Error("qr: text too long");
  const [ecLen, blocks] = EC_M[v];
  const dataCw = TOTAL[v] - ecLen * blocks;

  const bits: number[] = [];
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(4, 4);
  push(bytes.length, 8);
  bytes.forEach((b) => push(b, 8));
  push(0, Math.min(4, dataCw * 8 - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let p = 0xec; bits.length < dataCw * 8; p ^= 0xec ^ 0x11) push(p, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));

  const per = dataCw / blocks;
  const div = divisor(ecLen);
  const dB: number[][] = [];
  const eB: number[][] = [];
  for (let k = 0; k < blocks; k++) {
    const d = data.slice(k * per, (k + 1) * per);
    dB.push(d);
    eB.push(remainder(d, div));
  }
  const cw: number[] = [];
  for (let i = 0; i < per; i++) dB.forEach((d) => cw.push(d[i]));
  for (let i = 0; i < ecLen; i++) eB.forEach((e) => cw.push(e[i]));

  const n = 17 + 4 * v;
  const m = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const fn = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const set = (x: number, y: number, d: boolean) => {
    m[y][x] = d;
    fn[y][x] = true;
  };
  for (let i = 0; i < n; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]])
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
  if (v > 1) {
    const a = ALIGN[v];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(a + dx, a + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const format = (mask: number) => {
    const d = mask; // ECC level M = 0b00
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412;
    const bit = (i: number) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i));
    set(8, n - 8, true);
  };
  format(0); // reserve the format areas before placing data

  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? n - 1 - vert : vert;
        if (!fn[y][x] && i < cw.length * 8) {
          m[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
  }

  const apply = (k: number) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fn[y][x] && MASKS[k](x, y)) m[y][x] = !m[y][x];
  };
  let best = 0;
  let bestScore = Infinity;
  for (let k = 0; k < 8; k++) {
    apply(k);
    format(k);
    const sc = penalty(m);
    if (sc < bestScore) {
      best = k;
      bestScore = sc;
    }
    apply(k);
  }
  apply(best);
  format(best);
  return m;
}

/** One SVG path for all dark modules (1 unit per module), for crisp vector print output. */
export function qrPath(m: boolean[][]) {
  let d = "";
  m.forEach((row, y) => row.forEach((on, x) => on && (d += `M${x} ${y}h1v1h-1z`)));
  return d;
}
