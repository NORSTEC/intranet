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
      {/* What access this granted is already the greeting above, so this says
          the one thing the greeting cannot: who decided it, and when. */}
      <p className="mt-4 max-w-[65ch] leading-relaxed opacity-65">
        {welcome.reviewerName
          ? `${welcome.reviewerName} approved it${welcome.decidedLabel ? ` on ${welcome.decidedLabel}` : ""}.`
          : welcome.decidedLabel
            ? `Approved on ${welcome.decidedLabel}.`
            : "Welcome to the intranet."}
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
