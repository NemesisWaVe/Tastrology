/**
 * One buzz for the whole site.
 *
 * Android (and other browsers with navigator.vibrate) get the pattern, each pulse raised to MIN_MS: shorter ones are
 * below what most phone motors can make you feel.
 *
 * iPhones have no vibrate API, and iOS no longer ticks when a script clicks a switch: the tick plays only when a finger
 * really taps a `<label>` wired to an `<input type=checkbox switch>`. So on iOS every button carries an invisible label
 * over itself (installHaptics), and a real tap on the button is a tap on that label: the switch flips and the phone
 * ticks. Drags (the tear, a scratch) end without a tap, so they have no tick on iPhone.
 */
const MIN_MS = 16;

/** Pulses (even indexes) raised to MIN_MS; pauses (odd indexes) kept. */
export function strengthen(p: number | number[]): number | number[] {
  if (typeof p === "number") return p > 0 ? Math.max(MIN_MS, p) : p;
  return p.map((ms, i) => (i % 2 === 0 && ms > 0 ? Math.max(MIN_MS, ms) : ms));
}

let lastAny = 0;

export function buzz(p: number | number[]) {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    lastAny = performance.now();
    navigator.vibrate(strengthen(p));
  } catch {}
}

/** iPhones and iPads, whatever the browser (they all run on WebKit), including iPads that say "Macintosh". */
function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Buttons that get the iOS tick. Not links or submit buttons: a label inside them takes the click's default action,
 * so a plain link wouldn't follow and a form wouldn't submit. `data-nohaptic` opts an element (and its children) out.
 */
const TARGETS = 'button:not([type="submit"]), [role="button"], [role="tab"], summary';

function attach(el: HTMLElement) {
  if (el.dataset.haptic !== undefined || el.closest("[data-nohaptic]")) return;
  if (el instanceof HTMLButtonElement && (el.type === "submit" || el.form)) return;
  // a tappable card holding its own buttons or links: a label over it would cover them
  if (el.querySelector('button, a, input, select, textarea, [role="button"], [role="tab"]')) return;
  el.dataset.haptic = "";
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.dataset.hapticLabel = "";
  label.style.cssText =
    "position:absolute;inset:0;border-radius:inherit;cursor:inherit;touch-action:manipulation;-webkit-tap-highlight-color:transparent;";
  const sw = document.createElement("input");
  sw.type = "checkbox";
  sw.setAttribute("switch", "");
  sw.tabIndex = -1;
  // never under the finger: a touch that starts on the input itself would stop the page from scrolling
  sw.style.cssText = "position:absolute;width:1px;height:1px;margin:0;opacity:0;visibility:hidden;pointer-events:none;";
  // the label hands its click to the switch; that second click stays here so the button's handlers run once
  sw.addEventListener("click", (e) => e.stopPropagation());
  label.appendChild(sw);
  if (getComputedStyle(el).position === "static") el.style.position = "relative";
  el.appendChild(label);
}

let installed = false;
/**
 * Sitewide, once. Android: every button and link gives a light tap unless something already buzzed for that press.
 * iOS: buttons (now and as they appear) get the tap-through switch label.
 */
export function installHaptics() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  if (typeof navigator.vibrate === "function") {
    // bubble phase: the press's own handlers (a flip, a tear) buzz first, and the light tap stays out of their way
    document.addEventListener("click", (e) => {
      const el = (e.target as Element | null)?.closest?.("button, a, [role=button], summary, [role=tab]");
      if (!el || el.closest("[data-nohaptic]") || performance.now() - lastAny < 180) return;
      buzz(10);
    });
    return;
  }
  if (!isIOS()) return;
  let queued = 0;
  const scan = () => {
    queued = 0;
    document.querySelectorAll<HTMLElement>(TARGETS).forEach(attach);
  };
  scan();
  new MutationObserver(() => {
    if (!queued) queued = requestAnimationFrame(scan);
  }).observe(document.body, { childList: true, subtree: true });
}
