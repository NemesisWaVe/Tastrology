"use client";

import { type ScrubMaterial, setEngine, type Sfx, type SfxOpts } from "./sound";

/**
 * Synthesized WebAudio palette (no files). Soft transients, low-passed noise, pentatonic pitches,
 * short decays, a little stereo. See docs/design/sound.md. Off by default; persisted in localStorage.
 */
const KEY = "tastrology:sound";
const MASTER = 0.7;
const PENTA = [0, 2, 4, 7, 9]; // major pentatonic semitones

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let dry: GainNode | null = null;
let wet: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let on = false;
let loaded = false;
const last: Partial<Record<Sfx, number>> = {};
const MIN_GAP: Partial<Record<Sfx, number>> = { rustle: 90, pop: 60, print: 45, beep: 50, tick: 40, tap: 60, ripple: 50, drop: 120, flake: 50, scratchDone: 150, warp: 200, recede: 200 };

function load() {
  if (loaded) return;
  loaded = true;
  try {
    on = localStorage.getItem(KEY) !== "0"; // on by default; muting is remembered
  } catch {}
}

export function soundOn(): boolean {
  if (typeof window === "undefined") return false;
  load();
  return on;
}

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const c = new AC();
    master = c.createGain();
    master.gain.value = MASTER;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    master.connect(comp).connect(c.destination);
    dry = c.createGain();
    dry.connect(master);
    // generated impulse: 1.4s of decaying, low-passed noise
    const len = Math.floor(c.sampleRate * 1.4);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += ((Math.random() * 2 - 1) - lp) * 0.35;
        d[i] = lp * Math.pow(1 - i / len, 3);
      }
    }
    const conv = c.createConvolver();
    conv.buffer = ir;
    wet = c.createGain();
    wet.gain.value = 0.5;
    wet.connect(conv).connect(master);
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    noiseBuf = nb;
    ctx = c;
  } catch {
    ctx = null;
  }
  return ctx;
}

type Bus = { in: AudioNode };

/** Route a voice to the master with a send amount to the reverb and a stereo pan. */
function out(c: AudioContext, send: number, pan: number): Bus {
  const g = c.createGain();
  const p = c.createStereoPanner();
  p.pan.value = pan;
  g.connect(p);
  p.connect(dry!);
  if (send > 0) {
    const s = c.createGain();
    s.gain.value = send;
    p.connect(s).connect(wet!);
  }
  return { in: g };
}

/** Sine/triangle blip with soft attack and exponential decay. */
function tone(c: AudioContext, t: number, f: number, dur: number, vol: number, o: { type?: OscillatorType; to?: number; send?: number; pan?: number; attack?: number; lp?: number } = {}) {
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  const a = o.attack ?? 0.004;
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(vol, t + a);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = osc;
  if (o.lp) {
    const f2 = c.createBiquadFilter();
    f2.type = "lowpass";
    f2.frequency.value = o.lp;
    osc.connect(f2);
    node = f2;
  }
  node.connect(env).connect(out(c, o.send ?? 0.2, o.pan ?? 0).in);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Filtered noise burst; the filter sweeps from `f0` to `f1`. */
function noise(c: AudioContext, t: number, dur: number, vol: number, o: { type?: BiquadFilterType; f0: number; f1?: number; q?: number; attack?: number; send?: number; pan?: number; curve?: number }) {
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = o.type ?? "lowpass";
  f.Q.value = o.q ?? 0.7;
  f.frequency.setValueAtTime(o.f0, t);
  if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
  const env = c.createGain();
  const a = o.attack ?? 0.005;
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(vol, t + a);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(env).connect(out(c, o.send ?? 0.15, o.pan ?? 0).in);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

const hz = (root: number, semis: number) => root * Math.pow(2, semis / 12);
const pent = (root: number, step: number) => hz(root, PENTA[((step % 5) + 5) % 5] + 12 * Math.floor(step / 5));

function voice(c: AudioContext, name: Sfx, o: SfxOpts, t: number) {
  const gv = o.gain ?? 1;
  const i = o.i ?? 0;
  switch (name) {
    case "tap": // soft key: low thock + a hint of felt
      tone(c, t, 190, 0.09, 0.5 * gv, { to: 110, send: 0.1 });
      noise(c, t, 0.04, 0.18 * gv, { f0: 1800, f1: 600, send: 0.05 });
      tone(c, t + 0.012, 880, 0.12, 0.08 * gv, { type: "triangle", send: 0.3 });
      break;
    case "tick": // tiny dry click
      noise(c, t, 0.022, 0.12 * gv, { type: "bandpass", f0: 2400, q: 1.2, send: 0.04, pan: (Math.random() - 0.5) * 0.3 });
      break;
    case "drop": // water plink: falling sine + low bloom
      tone(c, t, 880, 0.2, 0.45 * gv, { to: 330, send: 0.5 });
      tone(c, t, 220, 0.35, 0.2 * gv, { to: 110, send: 0.4 });
      noise(c, t, 0.05, 0.08 * gv, { f0: 1500, f1: 400 });
      break;
    case "ripple": { // glass ting on the pentatonic scale
      const f = pent(523.25, i);
      const pan = Math.sin(i * 1.7) * 0.4;
      tone(c, t, f, 0.9, 0.2 * gv, { send: 0.6, pan, attack: 0.006 });
      tone(c, t, f * 2.76, 0.4, 0.04 * gv, { send: 0.6, pan });
      break;
    }
    case "shimmer": // airy swell: filtered noise + stacked sines
      noise(c, t, 1.8, 0.2 * gv, { type: "bandpass", f0: 600, f1: 3000, q: 0.8, attack: 1.0, send: 0.7 });
      [0, 7, 12, 16].forEach((s, k) => tone(c, t + k * 0.08, hz(392, s), 1.7, 0.07 * gv, { attack: 0.8, send: 0.7, pan: (k - 1.5) * 0.25 }));
      break;
    case "form": // stars settle: rising pentatonic arpeggio, soft
      [0, 1, 2, 3, 5].forEach((st, k) => tone(c, t + k * 0.09, pent(392, st), 1.1, 0.14 * gv, { type: "triangle", lp: 3200, send: 0.6, pan: (k - 2) * 0.15 }));
      tone(c, t + 0.1, 130.8, 1.6, 0.18 * gv, { attack: 0.3, send: 0.4 });
      break;
    case "flip": // foil swish + soft landing thock
      noise(c, t, 0.22, 0.22 * gv, { type: "bandpass", f0: 500, f1: 2600, q: 0.9, attack: 0.07, send: 0.2, pan: -0.2 });
      tone(c, t + 0.2, 150, 0.12, 0.3 * gv, { to: 90, send: 0.1 });
      break;
    case "reveal": // shimmering bell chord, scaled by rarity via gain
      [0, 4, 7, 12].forEach((s, k) => tone(c, t + k * 0.06, hz(523.25, s), 1.4 - k * 0.15, 0.13 * gv, { send: 0.7, pan: (k - 1.5) * 0.3 }));
      noise(c, t, 0.9, 0.08 * gv, { type: "highpass", f0: 3500, q: 0.5, attack: 0.15, send: 0.6 });
      break;
    case "burn": // soft crackle, then a falling hiss
      noise(c, t, 1.3, 0.2 * gv, { f0: 5000, f1: 180, attack: 0.02, send: 0.2 });
      for (let k = 0; k < 9; k++) noise(c, t + 0.03 + Math.random() * 1.0, 0.025, (0.1 + Math.random() * 0.1) * gv, { type: "bandpass", f0: 1200 + Math.random() * 1800, q: 1.5, send: 0.1, pan: (Math.random() - 0.5) * 0.8 });
      tone(c, t, 70, 0.5, 0.2 * gv, { to: 45 });
      break;
    case "collide": // low sub boom + bright bloom
      tone(c, t, 110, 0.9, 0.5 * gv, { to: 38, send: 0.3 });
      noise(c, t, 0.7, 0.25 * gv, { f0: 3000, f1: 150, attack: 0.01, send: 0.5 });
      tone(c, t + 0.05, hz(329.63, 7), 1.2, 0.08 * gv, { send: 0.7 });
      break;
    case "pop": // bubbly button pop: quick upward blip + tiny click
      tone(c, t, 420 + Math.random() * 60, 0.07, 0.32 * gv, { to: 980, send: 0.12, attack: 0.002 });
      noise(c, t, 0.015, 0.08 * gv, { type: "bandpass", f0: 3200, q: 1.4, send: 0.03 });
      break;
    case "print": // thermal print head: a short burst of dry ticks over a soft motor
      for (let k = 0; k < 6; k++) noise(c, t + k * 0.022, 0.012, 0.09 * gv, { type: "bandpass", f0: 2800 + Math.random() * 900, q: 2, send: 0.03 });
      tone(c, t, 140, 0.14, 0.05 * gv, { type: "sawtooth", lp: 600, to: 170, send: 0.02 });
      break;
    case "beep": // checkout scanner
      tone(c, t, 1860, 0.09, 0.12 * gv, { type: "square", lp: 4000, send: 0.08 });
      break;
    case "stamp": // rubber stamp: dull thunk + paper slap
      tone(c, t, 120, 0.22, 0.45 * gv, { to: 45, send: 0.1 });
      noise(c, t, 0.06, 0.2 * gv, { f0: 1200, f1: 300, send: 0.05 });
      break;
    case "tear": // paper rip: a run of fibre snaps under a tearing hiss
      noise(c, t, 0.32, 0.28 * gv, { type: "bandpass", f0: 900, f1: 3600, q: 0.9, attack: 0.02, send: 0.1 });
      for (let k = 0; k < 10; k++) noise(c, t + k * 0.028 + Math.random() * 0.01, 0.014, (0.08 + Math.random() * 0.08) * gv, { type: "bandpass", f0: 2000 + Math.random() * 2500, q: 2.5, send: 0.04, pan: (Math.random() - 0.5) * 0.5 });
      break;
    case "ding": // a struck bell: bright fundamental, inharmonic overtones, long ring, tiny strike click
      noise(c, t, 0.012, 0.12 * gv, { type: "highpass", f0: 4000, send: 0.05 });
      [[1, 0.3, 1.9], [2.76, 0.09, 1.1], [5.4, 0.035, 0.6], [1.003, 0.12, 2.2]].forEach(([r, v, d]) => tone(c, t, 1975 * r, d, v * gv, { attack: 0.002, send: 0.35 }));
      break;
    case "rustle": // a card turning: low, soft air with a papery edge
      noise(c, t, 0.16, 0.12 * gv, { type: "bandpass", f0: 260 + Math.random() * 120, f1: 520, q: 0.7, attack: 0.05, send: 0.15, pan: (Math.random() - 0.5) * 0.4 });
      noise(c, t + 0.02, 0.08, 0.035 * gv, { type: "highpass", f0: 2600, attack: 0.03, send: 0.05 });
      break;
    case "warp": // lightspeed: a rushing sweep up, then a low thump on arrival
      noise(c, t, 0.22, 0.2 * gv, { type: "bandpass", f0: 400, f1: 5000, q: 0.8, attack: 0.03, send: 0.3 });
      tone(c, t + 0.17, 60, 0.12, 0.35 * gv, { to: 42, send: 0.1 });
      break;
    case "recede": // pulling back to the whole sky: a soft falling shimmer
      noise(c, t, 0.45, 0.13 * gv, { type: "bandpass", f0: 2400, f1: 600, q: 0.9, attack: 0.05, send: 0.5 });
      [12, 7, 0].forEach((st, k) => tone(c, t + k * 0.07, pent(392, st), 0.7, 0.05 * gv, { attack: 0.02, send: 0.6, pan: (k - 1) * 0.3 }));
      break;
    case "flake": // a fleck of foil: a tiny bright click
      noise(c, t, 0.014, 0.1 * gv, { type: "highpass", f0: 6000 + (Math.random() - 0.5) * 600, attack: 0.001, send: 0.04, pan: (Math.random() - 0.5) * 0.5 });
      break;
    case "scratchDone": // foil cleared: a reverse whoosh, a soft thock, then a chord that climbs with the streak
      noise(c, t, 0.14, 0.18 * gv, { type: "bandpass", f0: 600, f1: 5000, q: 0.9, attack: 0.11, send: 0.25 });
      tone(c, t + 0.1, 160, 0.08, 0.35 * gv, { to: 90, send: 0.1 });
      [0, 2, 4].forEach((k, n) => tone(c, t + 0.12 + n * 0.03, pent(784, i + k), 0.9, 0.12 * gv, { type: "triangle", send: 0.6, pan: (n - 1) * 0.3 }));
      break;
    case "whoosh": // airy sweep up, quick settle
      noise(c, t, 0.35, 0.2 * gv, { type: "bandpass", f0: 400, f1: 2400, q: 0.8, attack: 0.12, send: 0.3, pan: 0.15 });
      break;
  }
}

function play(name: Sfx, o: SfxOpts = {}) {
  if (!soundOn()) return;
  const c = ctx;
  if (!c || c.state !== "running") return; // not unlocked yet
  const now = performance.now();
  const gap = MIN_GAP[name] ?? 0;
  if (gap && now - (last[name] ?? -1e9) < gap) return;
  last[name] = now;
  try {
    voice(c, name, o, c.currentTime + 0.005);
  } catch {}
}

const MATS: Record<ScrubMaterial, { f: number; q: number; g0: number; g1: number; gv: number; ring?: boolean }> = {
  silver: { f: 2400, q: 1.6, g0: 4000, g1: 7000, gv: 1 },
  gold: { f: 1600, q: 1.2, g0: 2500, g1: 5000, gv: 0.8 },
  carbon: { f: 900, q: 0.9, g0: 1500, g1: 3000, gv: 1 },
  holo: { f: 3200, q: 2.4, g0: 5000, g1: 8000, gv: 1, ring: true },
};

/** The held scratch: a bed of filtered noise that follows speed, plus grains scattered at a speed-driven rate. */
let sc: { src: AudioBufferSourceNode; bp: BiquadFilterNode; g: GainNode; pan: StereoPannerNode; m: (typeof MATS)[ScrubMaterial]; det: number; gj: number; next: number; s: number } | null = null;

function scrubEnd() {
  const c = ctx;
  if (!sc || !c) return;
  const t = c.currentTime;
  sc.g.gain.cancelScheduledValues(t);
  sc.g.gain.setTargetAtTime(0, t, 0.06);
  sc.src.stop(t + 0.5);
  sc = null;
}

function scrubStart(mat: ScrubMaterial) {
  scrubEnd();
  if (!soundOn()) return;
  const c = ctx;
  if (!c || c.state !== "running" || !noiseBuf) return;
  try {
    const m = MATS[mat] ?? MATS.silver;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1200;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = m.q;
    const det = Math.pow(2, ((Math.random() - 0.5) * 160) / 1200); // ±80 cents a stroke
    bp.frequency.value = m.f * det;
    const g = c.createGain();
    g.gain.value = 0;
    const pan = c.createStereoPanner();
    let node: AudioNode = src.connect(hp).connect(bp);
    if (m.ring) {
      const pk = c.createBiquadFilter();
      pk.type = "peaking";
      pk.frequency.value = 6200;
      pk.gain.value = 6;
      pk.Q.value = 4;
      node = node.connect(pk);
    }
    node.connect(g).connect(pan).connect(dry!);
    const send = c.createGain();
    send.gain.value = 0.05;
    pan.connect(send).connect(wet!);
    src.start(c.currentTime, Math.random() * 1.5);
    sc = { src, bp, g, pan, m, det, gj: Math.pow(10, ((Math.random() - 0.5) * 3) / 20), next: c.currentTime, s: 0 };
  } catch {
    sc = null;
  }
}

function scrubMove(speed: number, x: number, cover: number) {
  const c = ctx;
  if (!sc || !c) return;
  const t = c.currentTime;
  const v = Math.min(1, Math.max(0, speed));
  const target = 0.4 * Math.pow(v, 0.7) * sc.gj * sc.m.gv;
  sc.g.gain.setTargetAtTime(target, t, target > sc.s ? 0.015 : 0.04);
  sc.bp.frequency.setTargetAtTime((sc.m.f * sc.det + 2600 * v) * (1 + 0.25 * cover), t, 0.03);
  sc.pan.pan.setTargetAtTime((x - 0.5) * 0.6, t, 0.05);
  sc.s = target;
  // grit: grains at 25..115 a second while moving
  if (v < 0.05) {
    sc.next = t;
    return;
  }
  const rate = 25 + 90 * v;
  let n = 0;
  while (sc.next < t + 0.03 && n++ < 6) {
    const at = Math.max(t, sc.next);
    noise(c, at, 0.006 + Math.random() * 0.008, (0.08 + Math.random() * 0.1) * sc.m.gv, {
      type: "bandpass",
      f0: (sc.m.g0 + Math.random() * (sc.m.g1 - sc.m.g0)) * sc.det,
      q: 3,
      attack: 0.001,
      send: 0.03,
      pan: (x - 0.5) * 0.6 + (Math.random() - 0.5) * 0.4,
    });
    sc.next = at + 1 / (rate * (0.85 + Math.random() * 0.3));
  }
}

const scrubApi = { start: scrubStart, move: scrubMove, end: scrubEnd };

/** Turn sound on/off. Call from a user gesture when enabling (resumes the context). */
export function enableSound(v: boolean): void {
  if (typeof window === "undefined") return;
  load();
  on = v;
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {}
  try {
    if (v) {
      setEngine({ play, scrub: scrubApi });
      // from inside this tap: start it now, and keep the next taps listening in case iOS didn't take this one
      unlock();
      if (ctx?.state !== "running") arm();
      watchReturn();
    } else {
      scrubEnd();
      setEngine(null);
    }
  } catch {}
  window.dispatchEvent(new CustomEvent("tastrology:sound", { detail: v })); // keep every switch in sync
}

/**
 * Taps that let a page start audio. iOS only accepts a release (touchend, pointerup, click) or a key: a touch-down
 * isn't enough, and a resume tried there fails quietly.
 */
const UNLOCK_EVENTS = ["pointerdown", "pointerup", "touchend", "click", "keydown"];

/** Start (or restart) the context from inside a tap; keep listening until it is really running. */
function unlock() {
  if (!soundOn()) return disarm();
  const c = ensure();
  if (!c) return disarm();
  if (c.state === "running") return disarm();
  try {
    // iOS wakes the output on a sound played inside the tap: one silent sample
    const b = c.createBufferSource();
    b.buffer = c.createBuffer(1, 1, c.sampleRate);
    b.connect(c.destination);
    b.start();
  } catch {}
  void c
    .resume()
    .then(() => {
      if (c.state !== "running" || ctx !== c) return;
      disarm();
      window.dispatchEvent(new Event("tastrology:unlocked"));
      window.dispatchEvent(new CustomEvent("tastrology:sound", { detail: true }));
    })
    .catch(() => {});
}
function arm() {
  if (!soundOn()) return;
  UNLOCK_EVENTS.forEach((e) => window.addEventListener(e, unlock, true));
}
function disarm() {
  UNLOCK_EVENTS.forEach((e) => window.removeEventListener(e, unlock, true));
}

/** On a returning visit sound is remembered, but the context can only start after a gesture. */
export function armSound(): void {
  if (typeof window === "undefined" || !soundOn()) return;
  setEngine({ play, scrub: scrubApi });
  arm();
  watchReturn();
}
let watching = false;

/** iPhones and iPads, whatever the browser (they all run on WebKit), including iPads that say "Macintosh". */
function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Leaving Safari (another app, the lock screen) interrupts its audio. Coming back, the old context can stay
 * "interrupted", or claim "running" while playing nothing, so the switch says on and nothing sounds. On iOS the
 * context is dropped on return and rebuilt by the next tap; elsewhere it's only re-armed if it really stopped.
 * Installed once, whether sound was on at load or turned on later.
 */
function watchReturn() {
  if (watching) return;
  watching = true;
  const back = () => {
    if (document.hidden || !soundOn() || !ctx) return;
    if (isIOS()) {
      scrubEnd();
      const old = ctx;
      ctx = master = dry = wet = noiseBuf = null;
      void old.close().catch(() => {});
    } else if (ctx.state === "running") return;
    arm();
    window.dispatchEvent(new CustomEvent("tastrology:sound", { detail: true })); // switches show "tap to hear"
  };
  document.addEventListener("visibilitychange", back);
  window.addEventListener("pageshow", (e) => e.persisted && back());
}

let popsOn = false;
/** Every button and link pops, unless that click already played its own sound. Installed once. */
export function installClickPops(): void {
  if (popsOn || typeof document === "undefined") return;
  popsOn = true;
  document.addEventListener("click", (e) => {
    const el = (e.target as Element | null)?.closest?.("button, a, [role=button], summary, label");
    if (!el || el.closest("[data-nopop]")) return;
    const now = performance.now();
    if (["tap", "flip", "whoosh", "reveal", "ripple", "drop", "tear", "burn", "collide", "scratchDone"].some((n) => now - (last[n as Sfx] ?? -1e9) < 120)) return;
    play("pop");
  });
}

/** True when sound is on but the browser still holds audio locked (a reload needs one click or tap). */
export function soundLocked(): boolean {
  return soundOn() && (!ctx || ctx.state !== "running");
}

/** Whether this browser lets the page play sound right now, without a click (some allow it for familiar sites). */
export function audioAllowed(): boolean {
  try {
    const c = ensure();
    return !!c && c.state === "running";
  } catch {
    return false;
  }
}
