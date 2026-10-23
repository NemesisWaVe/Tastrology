"use client";

import { useEffect } from "react";
import { installHaptics } from "@/lib/haptics";

type AskableOrientation = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * iPhones send no tilt (deviceorientation) until the page asks, and only from inside a tap. The card foil, the pack
 * and the sky all read tilt, so the first tap anywhere asks once. Other browsers have no prompt and skip this.
 * Also installs the sitewide haptics (lib/haptics), which need the same kind of tap on iPhone.
 */
export function MotionAsk() {
  useEffect(() => {
    installHaptics();
    const DOE = (typeof DeviceOrientationEvent !== "undefined" ? DeviceOrientationEvent : undefined) as AskableOrientation | undefined;
    if (typeof DOE?.requestPermission !== "function") return;
    const ask = DOE.requestPermission.bind(DOE);
    const done = () => {
      window.removeEventListener("touchend", onTap, true);
      window.removeEventListener("click", onTap, true);
    };
    // An answer (yes or no) ends it; a tap iOS didn't count as one (it throws) leaves it for the next tap.
    let asking = false;
    const onTap = () => {
      if (asking) return;
      asking = true;
      void ask().then(done, () => void (asking = false));
    };
    window.addEventListener("touchend", onTap, true);
    window.addEventListener("click", onTap, true);
    return done;
  }, []);
  return null;
}
