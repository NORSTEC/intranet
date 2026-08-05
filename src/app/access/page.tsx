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
  decision_note: string | null;
  id: number;
  message: string | null;
  request_type: "organization" | "alumni";
  reviewed_at: string | null;
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
  searchParams: Promise<{ error?: string; withdrawn?: string }>;
}) {
  const access = await getPortalAccess();
  const { error, withdrawn } = await searchParams;

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
        "id, created_at, decision_note, message, request_type, reviewed_at, status, organizations (name)",
      )
      .eq("person_id", access.profile.personId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (organizationsResult.error || requestsResult.error) {
    redirect("/login?error=authorization");
  }

  const organizations = (organizationsResult.data ?? []) as Organization[];
  const latestRequest = requestsResult.data as AccessRequest | null;
  const pendingRequest =
    latestRequest?.status === "pending" ? latestRequest : null;
  const declinedRequest =
    latestRequest?.status === "rejected" ? latestRequest : null;

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
            {declinedRequest && (
              <section className="portal-surface mt-8 max-w-4xl p-6 sm:p-8">
                <h2 className="text-h2">Your request was declined</h2>
                <p className="mt-4 max-w-[65ch] leading-relaxed opacity-65">
                  {scopeLabel(declinedRequest)} did not approve the request you
                  sent on {formatMoment(declinedRequest.created_at)}.
                </p>
                <dl className="mt-7 grid gap-5 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="section-label opacity-45">Decided</dt>
                    <dd className="mt-1.5">
                      {formatMoment(declinedRequest.reviewed_at) ?? "—"}
                    </dd>
                  </div>
                  {declinedRequest.decision_note && (
                    <div className="sm:col-span-2">
                      <dt className="section-label opacity-45">
                        Note from the reviewer
                      </dt>
                      <dd className="mt-1.5 max-w-[60ch] leading-relaxed">
                        {declinedRequest.decision_note}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="mt-5 text-sm opacity-55">
                  You can send a new request below.
                </p>
              </section>
            )}

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
              lastName={access.profile.lastName ?? ""}
              organizations={organizations}
              studyYear={access.profile.studyYear}
            />
          </>
        )}
      </section>
    </PortalEntryShell>
  );
}
