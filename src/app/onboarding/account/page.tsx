import { redirect } from "next/navigation";
import { createNewPortalProfile } from "@/app/onboarding/account/actions";
import { PortalEntryShell } from "@/components/portal/portal-entry-shell";
import { Toast } from "@/components/portal/toast";
import { getPortalAccess } from "@/lib/auth/access";

const linkErrors: Record<string, string> = {
  expired: "The account-link request expired. Please try again.",
  limit: "That profile already has two connected Google accounts.",
  merge: "The profiles could not be connected. Please try again.",
  oauth: "Google sign-in could not be completed. Please try again.",
  profile_has_data: "This organization account already contains intranet data and must be merged by NORSTEC IT.",
  same: "Choose the Google account you already used for your existing intranet profile.",
  source_inactive: "This organization account no longer has intranet access. Contact NORSTEC IT.",
  start: "Account linking could not be started. Please try again.",
};

export default async function AccountOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ accountLinkError?: string; error?: string }>;
}) {
  const access = await getPortalAccess();
  const { accountLinkError, error } = await searchParams;

  if (access.status === "unauthenticated") redirect("/login");
  if (access.status === "error") redirect("/login?error=authorization");
  if (access.status === "inactive") redirect(`/login?error=${access.reason}`);
  if (access.profile.onboardingStatus !== "pending") {
    redirect(access.membership ? "/" : "/access");
  }

  return (
    <PortalEntryShell>
      <section>
        <h1 className="flex items-center gap-2 text-h2">
          Do you already have an intranet profile?
          <span
            aria-hidden="true"
            className="entry-heading-star inline-block shrink-0"
          />
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed opacity-60">
          You signed in with {access.profile.email}. Choose whether this organization account belongs to an existing profile or should create a new one.
        </p>
        {/* Either choice writes membership data: connecting merges this
            sign-in into an existing profile, creating one starts a new
            member record. Article 13 asks for that to be said where the
            choice is made. */}
        <p className="mt-3 max-w-3xl text-sm leading-relaxed opacity-45">
          If that organization admits its own Google accounts without review,
          either choice gives you a membership and puts your name in its member
          directory. If it reviews them, you are taken to a request instead, and
          an administrator decides.{" "}
          <a
            className="legal-link"
            href="/privacy"
            rel="noreferrer"
            target="_blank"
          >
            Privacy policy
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          .
        </p>

        {/* Both failures arrive by redirect, which is how every other page
            here reports one — the toast clears its own parameter so a reload
            does not repeat a message about an attempt that is over. */}
        {(accountLinkError || error) && (
          <Toast
            clearParams={["accountLinkError", "error"]}
            message={
              accountLinkError
                ? linkErrors[accountLinkError] ?? linkErrors.merge
                : "The profile could not be created. Please try again."
            }
            status="error"
          />
        )}

        <div className="mt-8 grid max-w-4xl gap-5 md:grid-cols-2">
          <article className="portal-surface flex min-h-64 flex-col p-6 sm:p-7">
            <span className="material-symbols-outlined text-2xl">link</span>
            <h2 className="mt-5 text-h3 font-medium">Use existing profile</h2>
            <p className="mt-3 flex-1 text-sm leading-relaxed opacity-65">
              Choose this if you have previously signed in with another organization or personal Google account.
            </p>
            <a className="portal-button mt-7 w-fit" href="/auth/account-link/start?mode=use_existing">
              Continue with existing account
              <span className="material-symbols-outlined" aria-hidden="true">link</span>
            </a>
          </article>

          <article className="portal-surface flex min-h-64 flex-col p-6 sm:p-7">
            <span className="material-symbols-outlined text-2xl">person_add</span>
            <h2 className="mt-5 text-h3 font-medium">Create new profile</h2>
            <p className="mt-3 flex-1 text-sm leading-relaxed opacity-65">
              Choose this if this is your first time using the NORSTEC intranet.
            </p>
            <form action={createNewPortalProfile} className="mt-7">
              <button className="portal-button" type="submit">
                Create profile
                <span className="material-symbols-outlined" aria-hidden="true">person_add</span>
              </button>
            </form>
          </article>
        </div>
      </section>
    </PortalEntryShell>
  );
}
