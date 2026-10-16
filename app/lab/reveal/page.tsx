"use client";

import { useCallback, useEffect, useState } from "react";
import { Reveal } from "@/components/reveal/Reveal";
import { PERSONAS, personaRequest } from "@/lib/personas";
import { useAgentRun } from "@/lib/useAgentRun";

/** Dev lab for the reveal sequence. /lab/reveal?p=neon (soft | neon | mumbai) &at=story|pack */
export default function RevealLab() {
  const { events, result, running, error, run, setResult } = useAgentRun();
  const [open, setOpen] = useState(true);
  const [key, setKey] = useState("neon");
  const [startAt, setStartAt] = useState<"story" | "pack" | undefined>();

  const go = useCallback(() => {
    const k = new URLSearchParams(location.search).get("p") ?? "neon";
    const p = PERSONAS.find((x) => x.key === k) ?? PERSONAS[1];
    setKey(p.key);
    const at = new URLSearchParams(location.search).get("at");
    setStartAt(at === "story" || at === "pack" ? at : undefined);
    setResult(null);
    setOpen(true);
    run(personaRequest(p));
  }, [run, setResult]);

  useEffect(() => {
    go();
  }, [go]);

  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <p className="font-mono text-xs text-ink-3">lab · reveal · persona “{key}”</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Results page goes here</h1>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={go} className="rounded-full bg-accent px-5 py-2 font-semibold text-paper">
            Run again
          </button>
          {result && (
            <button onClick={() => setOpen(true)} className="rounded-full border border-line px-5 py-2">
              Replay reveal
            </button>
          )}
        </div>
      </div>
      {open && <Reveal key={String(open) + key} events={events} result={result} running={running} error={error} onDone={() => setOpen(false)} onRetry={go} startAt={startAt} />}
    </main>
  );
}
