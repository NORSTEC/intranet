"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { dismissAccessWelcome } from "@/app/(portal)/actions";
import type { DashboardWelcome } from "@/lib/portal/dashboard";

/**
 * The approval, said once. It sits above everything else on the first
 * dashboard a newly approved person sees, carries whatever note the reviewer
 * wrote, and does not come back after it is dismissed.
 */
export function AccessWelcome({ welcome }: { welcome: DashboardWelcome }) {
  const router = useRouter();
  const [dismissing, startDismissing] = useTransition();

  return (
    <section
      aria-labelledby="access-welcome-heading"
      className="dashboard-rise portal-surface p-6 sm:p-8"
    >
      <h2 className="text-h2" id="access-welcome-heading">
        Your request was approved
      </h2>
      <p className="mt-4 max-w-[65ch] leading-relaxed opacity-65">
        {welcome.organizationName
          ? `You are an active member of ${welcome.organizationName} and the portal is yours to use.`
          : "You hold alumni access to the portal."}
      </p>

      {welcome.note && (
        <figure className="mt-6">
          <figcaption className="section-label opacity-45">
            Note from the reviewer
          </figcaption>
          <blockquote className="mt-1.5 max-w-[60ch] leading-relaxed">
            {welcome.note}
          </blockquote>
        </figure>
      )}

      <button
        className="portal-button mt-7"
        disabled={dismissing}
        onClick={() =>
          startDismissing(async () => {
            await dismissAccessWelcome(welcome.requestId);
            router.refresh();
          })
        }
        type="button"
      >
        <span
          aria-hidden="true"
          className={`material-symbols-outlined text-[1.1rem]${dismissing ? " animate-spin" : ""}`}
        >
          {dismissing ? "progress_activity" : "check"}
        </span>
        {dismissing ? "Dismissing…" : "Got it"}
      </button>
    </section>
  );
}
