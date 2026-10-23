/**
 * One buzz for the whole site. Android (and other browsers with navigator.vibrate) get the pattern, with each pulse
 * raised to MIN_MS: shorter ones are below what most phone motors can make you feel. iPhones have no vibrate API;
 * since iOS 18, toggling a switch-style checkbox plays the system's light tick, so they get one tick per buzz.
 */
const MIN_MS = 16;
/** iOS ticks closer than this blur into one, and a hold that ticks every frame would just hum. */
const IOS_GAP_MS = 70;

/** Pulses (even indexes) raised to MIN_MS; pauses (odd indexes) kept. */
export function strengthen(p: number | number[]): number | number[] {
  if (typeof p === "number") return p > 0 ? Math.max(MIN_MS, p) : p;
  return p.map((ms, i) => (i % 2 === 0 && ms > 0 ? Math.max(MIN_MS, ms) : ms));
}

let ios: HTMLLabelElement | null | undefined;
let lastTick = 0;

/** A hidden <label><input type=checkbox switch></label>; clicking the label flips the switch and iOS ticks. */
function iosSwitch(): HTMLLabelElement | null {
  if (ios !== undefined) return ios;
  ios = null;
  try {
    const probe = document.createElement("input");
    probe.type = "checkbox";
    // Only WebKit knows the `switch` attribute; elsewhere this does nothing and the label stays unused.
    if (!("switch" in probe)) return ios;
    probe.setAttribute("switch", "");
    probe.tabIndex = -1;
    probe.setAttribute("aria-hidden", "true");
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    // The tick is a click: keep it from the page (the click pop, link and tap handlers would all run on every buzz).
    label.dataset.nopop = "";
    label.addEventListener("click", (e) => e.stopPropagation());
    label.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    label.appendChild(probe);
    document.body.appendChild(label);
    ios = label;
  } catch {}
  return ios;
}

/**
 * iOS plays the switch tick only while the page is handling a tap (a release: pointerup, touchend, click, or a key).
 * A buzz asked for at any other moment (mid-drag, at the end of a hold, on a timer) is owed and plays on the next
 * release, so a tear, a scratch or a charge still lands as one tick when the finger lifts.
 */
let inTap = false;
let owed = false;
let lastAny = 0;

function tick() {
  const now = performance.now();
  if (now - lastTick < IOS_GAP_MS) return;
  const label = iosSwitch();
  if (!label) return;
  lastTick = now;
  label.click();
}

export function buzz(p: number | number[]) {
  try {
    if (typeof navigator === "undefined") return;
    lastAny = performance.now();
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(strengthen(p));
      return;
    }
    if (inTap) tick();
    else owed = true;
  } catch {}
}

let installed = false;
/**
 * Sitewide, once: marks when a tap is being handled (for iOS), pays owed ticks on release, and gives every button and
 * link a light tap unless something already buzzed for that press.
 */
export function installHaptics() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const release = (e: Event) => {
    if (e.type === "pointerdown" && (e as PointerEvent).pointerType !== "mouse") return;
    inTap = true;
    if (owed) {
      owed = false;
      if (typeof navigator.vibrate !== "function") tick();
    }
    setTimeout(() => void (inTap = false), 0); // the page's own handlers for this event run before this
  };
  for (const t of ["pointerup", "touchend", "click", "keydown"]) window.addEventListener(t, release, true);
  // bubble phase: the press's own handlers (a flip, a tear) buzz first, and the light tap stays out of their way
  document.addEventListener("click", (e) => {
    const el = (e.target as Element | null)?.closest?.("button, a, [role=button], summary, [role=tab], input[type=checkbox]");
    if (!el || el.closest("[data-nohaptic]") || performance.now() - lastAny < 180) return;
    inTap = true;
    buzz(10);
  });
}
