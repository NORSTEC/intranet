"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * The last boundary. It replaces the root layout, so it renders its own
 * document and cannot rely on the theme script, the fonts or anything else
 * that layout sets up — the failure it exists for may be that layout itself.
 *
 * Only active in a production build; in development the error overlay takes
 * precedence.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("unhandled root error", error.digest);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
          <h1 className="text-2xl font-medium">The intranet could not start</h1>
          <p className="mt-4 text-sm leading-relaxed opacity-70">
            This is a failure in the application itself rather than in the page
            you asked for. It has been recorded.
          </p>
          <div className="mt-8">
            <button
              className="border border-current px-5 py-2.5 text-sm font-medium"
              onClick={reset}
              type="button"
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
