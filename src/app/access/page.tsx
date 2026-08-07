import { redirect } from "next/navigation";
import { withdrawAccessRequest } from "@/app/access/actions";
import { AccessRequestForm } from "@/components/portal/access-request-form";
import { PortalEntryShell } from "@/components/portal/portal-entry-shell";
import { Toast } from "@/components/portal/toast";
import { getPortalAccess } from "@/lib/auth/access";
import { NORSTEC_ORGANIZATION_SLUG } from "@/lib/portal/norstec";
import { createClient } from "@/lib/supabase/server";

type Organization = { id: number; name: string };
type AccessRequest = {
  created_at: string;
  id: number;
  message: string | null;
  request_type: "organization" | "alumni";
  status: "pending" | "approved" | "rejected" | "cancelled";
  organizations: { name: string } | { name: string }[] | null;
};

const errorMessages: Record<string, string> = {
  invalid_request: "Check the information and try again.",
  already_pending: "You already have a pending request.",
  request_failed: "The request could not be submitted. Please try again.",
  withdraw_failed: "The request could not be withdrawn. Please try again.",
};

function formatMoment(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function scopeLabel(request: AccessRequest) {
  if (request.request_type === "alumni") return "Alumni access";
  const organization = Array.isArray(request.organizations)
    ? request.organizations[0]
    : request.organizations;
  return organization?.name ?? "An organization";
}

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    organization?: string;
    returning?: string;
    withdrawn?: string;
  }>;
}) {
  const access = await getPortalAccess();
  const {
    error,
    organization: provenOrganizationSlug,
    returning,
    withdrawn,
  } = await searchParams;

  if (access.status === "unauthenticated") {
    redirect("/login");
  }

  if (access.status === "error") {
    redirect("/login?error=authorization");
  }

  if (access.status === "inactive") {
    redirect(`/login?error=${access.reason}`);
  }

  if (access.profile.onboardingStatus === "pending") {
    redirect("/onboarding/account");
  }

  if (access.membership || access.hasAlumniAccess) {
    redirect("/");
  }

  const supabase = await createClient();
  const [organizationsResult, requestsResult] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name")
      .eq("status", "active")
      .neq("slug", NORSTEC_ORGANIZATION_SLUG)
      .order("name"),
    supabase
      .from("access_requests")
      .select(
        "id, created_at, message, request_type, status, organizations (name)",
      )
      .eq("person_id", access.profile.personId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (organizationsResult.error || requestsResult.error) {
    redirect("/login?error=authorization");
  }

  // The sign-in callback names the organization whose Workspace this account
  // proved it belongs to. Norstec is kept out of the list on purpose — nobody
  // asks their way into it — but a Norstec account that needs approval anyway,
  // because the membership behind it ended, has to be able to ask for the one
  // organization it is actually about. So the proven organization joins the
  // list whether or not the list would otherwise carry it.
  const provenOrganization = provenOrganizationSlug
    ? ((
        await supabase
          .from("organizations")
          .select("id, name")
          .eq("slug", provenOrganizationSlug)
          .eq("status", "active")
          .maybeSingle()
      ).data as Organization | null)
    : null;

  const listedOrganizations = (organizationsResult.data ?? []) as Organization[];
  const organizations =
    provenOrganization &&
    !listedOrganizations.some(
      (candidate) => candidate.id === provenOrganization.id,
    )
      ? [...listedOrganizations, provenOrganization].sort((left, right) =>
          left.name.localeCompare(right.name),
        )
      : listedOrganizations;
  const latestRequest = requestsResult.data as AccessRequest | null;
  // Only a pending request is ever read here. A declined one cannot reach this
  // page: the decision discards the applicant's profile, and the request row
  // goes with it, so the decline is told by email instead. The card that used
  // to say it here is kept, layout and copy, in
  // docs/access-decision-notification.md for the sender to be built from.
  const pendingRequest =
    latestRequest?.status === "pending" ? latestRequest : null;

  return (
    <PortalEntryShell>
      <section>
        <h1 className="flex items-center gap-2 text-h2">
          Request access
          <span
            aria-hidden="true"
            className="entry-heading-star inline-block shrink-0"
          />
        </h1>
        <p className="mt-4 max-w-3xl text-sm opacity-60">
          Signed in as {access.profile.email}. Your request must be approved before you can enter the portal.
        </p>

        {pendingRequest ? (
          <section className="portal-surface mt-8 max-w-4xl p-6 sm:p-8">
            <h2 className="flex items-center gap-2 text-h2">
              Waiting for approval
            </h2>
            <p className="mt-4 max-w-[65ch] leading-relaxed opacity-65">
              An administrator must approve your request. You get an email at{" "}
              {access.profile.email} when it is approved or declined.
            </p>

            <dl className="mt-7 grid gap-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="section-label opacity-45">Requested access</dt>
                <dd className="mt-1.5">{scopeLabel(pendingRequest)}</dd>
              </div>
              <div>
                <dt className="section-label opacity-45">Submitted</dt>
                <dd className="mt-1.5">
                  {formatMoment(pendingRequest.created_at)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="section-label opacity-45">Your message</dt>
                <dd className="mt-1.5 max-w-[60ch] leading-relaxed">
                  {pendingRequest.message ?? "No message was added."}
                </dd>
              </div>
            </dl>

            <form action={withdrawAccessRequest} className="mt-8">
              <input name="requestId" type="hidden" value={pendingRequest.id} />
              <button className="portal-button" type="submit">
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[1.1rem]"
                >
                  undo
                </span>
                Withdraw request
              </button>
            </form>
          </section>
        ) : (
          <>
            {withdrawn === "true" && (
              <Toast
                clearParams={["withdrawn"]}
                message="Request withdrawn."
                status="success"
              />
            )}
            <AccessRequestForm
              errorMessage={error ? errorMessages[error] : undefined}
              firstName={access.profile.firstName ?? ""}
              isReturningMember={returning === "true"}
              lastName={access.profile.lastName ?? ""}
              organizations={organizations}
              provenOrganization={provenOrganization}
              studyYear={access.profile.studyYear}
            />
          </>
        )}
      </section>
    </PortalEntryShell>
  );
}
