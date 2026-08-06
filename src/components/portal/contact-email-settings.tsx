"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setContactEmail } from "@/app/(portal)/profile/actions";

export type ProfileEmailAddress = {
  email: string;
  emailType: "organization" | "personal" | "unknown";
  hasSignInAccount: boolean;
  isPrimary: boolean;
};

function addressTypeLabel(address: ProfileEmailAddress) {
  if (address.emailType === "organization") return "Organization address";
  if (address.emailType === "personal") return "Personal address";
  return "Email address";
}

/**
 * Every address the portal holds for the person, not only the ones that still
 * sign in. A merge or an import can attach an address its owner never chose
 * and, until this existed, could not even see — while other members could.
 */
export function ContactEmailSettings({
  addresses,
  warnAboutOrganizationAddress,
}: {
  addresses: ProfileEmailAddress[];
  warnAboutOrganizationAddress: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function chooseContactAddress(email: string) {
    setError(null);
    setPendingEmail(email);
    startTransition(async () => {
      const result = await setContactEmail(email);
      setPendingEmail(null);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <section aria-labelledby="email-addresses-heading" className="mt-20">
      <h2 className="text-h2" id="email-addresses-heading">
        Email addresses
      </h2>

      <p className="mt-3 max-w-3xl text-sm leading-relaxed opacity-65">
        Your contact address is the one other members see in the directory.
        Choosing it changes nothing about how you sign in.
      </p>

      {warnAboutOrganizationAddress && (
        <p className="mt-3 max-w-3xl text-sm leading-relaxed opacity-65">
          Your contact address belongs to your organization. If you leave, that
          address usually stops working — set a personal one as your contact
          address so people can still reach you.
        </p>
      )}

      <ul className="mt-8 grid gap-4 lg:grid-cols-2">
        {addresses.map((address) => (
          <li
            className="portal-surface flex flex-col px-6 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-8"
            key={address.email}
          >
            {/* Reserved so the cards align whether or not one is the contact
                address. */}
            <div className="min-h-8">
              {address.isPrimary && (
                <span className="portal-pill w-fit border-beachball bg-beachball text-moody-static">
                  Contact address
                </span>
              )}
            </div>
            <p className="mt-6 text-xl font-medium break-all">{address.email}</p>
            <p className="mt-2 text-sm opacity-55">
              {addressTypeLabel(address)}
              {address.hasSignInAccount ? " · signs in" : ""}
            </p>

            {!address.isPrimary && (
              <div className="mt-7">
                <button
                  className="portal-button"
                  disabled={isPending}
                  onClick={() => chooseContactAddress(address.email)}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[1.1rem]"
                  >
                    {pendingEmail === address.email
                      ? "progress_activity"
                      : "alternate_email"}
                  </span>
                  {pendingEmail === address.email
                    ? "Saving…"
                    : "Use as contact address"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p className="mt-3 text-sm text-[#a33b2b]" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
