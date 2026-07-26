"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    // Safe: no stack trace, secrets, or PII is logged to the console here.
    console.error("Admin app error boundary triggered", { digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div className="dk-state" role="alert">
            <p className="dk-state-title">Something went wrong</p>
            <p>An unexpected error occurred. You can try again or return to the dashboard.</p>
            <div className="dk-row" style={{ justifyContent: "center" }}>
              <button type="button" className="dk-btn dk-btn-primary" onClick={reset}>
                Try again
              </button>
              <a href="/dashboard" className="dk-btn dk-btn-secondary">
                Back to dashboard
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
