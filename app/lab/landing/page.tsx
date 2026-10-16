"use client";

import { useEffect, useState } from "react";
import { Landing } from "@/components/landing/Landing";

/**
 * Dev lab: the landing experience in isolation. onStart just logs the request.
 * `?slow=20` delays /api/agent by 20s to preview the specimen's loading state.
 */
export default function LandingLab() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const slow = Number(new URLSearchParams(location.search).get("slow") ?? 0);
    if (slow > 0) {
      const orig = window.fetch;
      window.fetch = async (input, init) => {
        if (String(input).includes("/api/agent")) await new Promise((r) => setTimeout(r, slow * 1000));
        return orig(input, init);
      };
    }
    setReady(true);
  }, []);
  return ready ? <Landing onStart={(req) => console.log("[landing] onStart", req)} /> : null;
}
