"use client";

import Link from "next/link";
import { useEffect } from "react";
import { FailureNotice } from "@/components/failure-notice";

/**
 * Rendered inside the intranet shell, so the navigation survives the failure
 * and the person is never stranded on a page with no way out.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("unhandled intranet error", error.digest);
  }, [error]);

  return (
    <FailureNotice
      action={
        <>
          <button className="portal-button" onClick={reset} type="button">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[1.1rem]"
            >
              refresh
            </span>
            Try again
          </button>
          <Link className="portal-button" href="/">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[1.1rem]"
            >
              home
            </span>
            Back to the dashboard
          </Link>
        </>
      }
      description="Something went wrong while loading this page. Nothing you had already saved is affected."
      title="This page could not be loaded"
    />
  );
}
