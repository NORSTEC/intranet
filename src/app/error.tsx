"use client";

import { useEffect } from "react";
import { FailureNotice } from "@/components/failure-notice";

/**
 * Catches a failed render anywhere outside the intranet shell — the sign-in
 * page, the access request form, the legal pages.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on the server-side log entry, and it is
    // the one part of the error that carries nothing about the person or the
    // request.
    console.error("unhandled error", error.digest);
  }, [error]);

  return (
    <FailureNotice
      action={
        <button className="portal-button" onClick={reset} type="button">
          Try again
        </button>
      }
      description="Something went wrong on our side. Trying again often works; if it does not, the problem is already recorded and someone will see it."
      title="This page could not be loaded"
    />
  );
}
