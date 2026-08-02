"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type LinkedLoginAccount = {
  email: string;
  emailType: "organization" | "personal" | "unknown";
  id: string;
  isPrimary: boolean;
};

function accountTypeLabel(account: LinkedLoginAccount) {
  if (account.emailType === "organization") return "Organization account";
  if (account.emailType === "personal") return "Personal account";
  return "Google account";
}

export function LoginAccountsSettings({ accounts }: { accounts: LinkedLoginAccount[] }) {
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function linkGoogleAccount() {
    setIsLinking(true);
    setError(null);

    const supabase = createClient();
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider: "google",
      options: {
        redirectTo: new URL("/auth/link-callback", window.location.origin).toString(),
        queryParams: { prompt: "select_account" },
      },
    });

    if (linkError) {
      setError("The Google account could not be linked. Please try again.");
      setIsLinking(false);
    }
  }

  return (
    <section
      aria-labelledby="login-accounts-heading"
      className="portal-surface mt-10 p-6 sm:p-8"
    >
      <h2 className="text-2xl font-medium" id="login-accounts-heading">
        Sign-in accounts
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed opacity-65">
        Link another Google account to use the same profile. An approved organization account may add membership in that organization. A personal account only provides another way to sign in.
      </p>

      <div className="mt-6 divide-y divide-moody border-y border-moody">
        {accounts.map((account) => (
          <div
            className="flex flex-wrap items-center justify-between gap-3 py-4"
            key={account.id}
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{account.email}</p>
              <p className="mt-1 text-xs opacity-50">{accountTypeLabel(account)}</p>
            </div>
            {account.isPrimary && (
              <span className="rounded-full border border-moody px-3 py-1 text-xs font-medium">
                Primary
              </span>
            )}
          </div>
        ))}
      </div>

      <button
        className="portal-button mt-6"
        disabled={isLinking}
        onClick={linkGoogleAccount}
        type="button"
      >
        <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
          {isLinking ? "progress_activity" : "add_link"}
        </span>
        {isLinking ? "Opening Google…" : "Link Google account"}
      </button>
      {error && <p className="mt-3 text-sm text-[#a33b2b]" role="alert">{error}</p>}
    </section>
  );
}
