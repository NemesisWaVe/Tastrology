"use client";

/**
 * Last-resort screen when the root layout itself fails. It replaces the whole document, so globals.css and the
 * web fonts may not be there: everything is inline, with system fallbacks for the house fonts.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const clearAndReset = () => {
    try {
      localStorage.removeItem("tastrology:v1");
    } catch {}
    reset();
  };
  const btn = { borderRadius: 999, padding: "12px 24px", fontWeight: 600, fontSize: 15, cursor: "pointer", fontFamily: "inherit" } as const;
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#07070a", color: "#f3f1ec", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", maxWidth: 440, margin: "0 auto", padding: "40px 16px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, textAlign: "center" }}>
          <p style={{ margin: 0, fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: "#c6ff3d" }}>Total eclipse</p>
          <h1 style={{ margin: 0, fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: 400, fontSize: 46, lineHeight: 0.95 }}>The whole sky went dark for a second.</h1>
          <p style={{ margin: 0, color: "#b9b5ad", lineHeight: 1.5 }}>Something broke before the page could even load. Give it another go. If that fails, clear your saved sign and start fresh.</p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
            <button type="button" onClick={reset} style={{ ...btn, background: "#c6ff3d", color: "#07070a", border: "none" }}>
              Try again
            </button>
            <button type="button" onClick={clearAndReset} style={{ ...btn, background: "transparent", color: "#f3f1ec", border: "1px solid #24242c" }}>
              Clear saved sign
            </button>
          </div>
          {error.digest && <p style={{ margin: 0, fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#8c877f" }}>ref {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
