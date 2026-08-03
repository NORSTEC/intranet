import { redirect } from "next/navigation";
import { AccessRequestForm } from "@/components/portal/access-request-form";
import { PortalEntryShell } from "@/components/portal/portal-entry-shell";
import { getPortalAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type Organization = { id: number; name: string };
type AccessRequest = {
  id: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  request_type: "organization" | "alumni";
  organizations: { name: string } | { name: string }[] | null;
};

const errorMessages: Record<string, string> = {
  invalid_request: "Check the information and try again.",
  already_pending: "You already have a pending request.",
  request_failed: "The request could not be submitted. Please try again.",
};

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; submitted?: string }>;
}) {
  const access = await getPortalAccess();
  const { error, submitted } = await searchParams;

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
      .order("name"),
    supabase
      .from("access_requests")
      .select("id, status, request_type, organizations (name)")
      .eq("person_id", access.profile.personId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (organizationsResult.error || requestsResult.error) {
    redirect("/login?error=authorization");
  }

  const organizations = (organizationsResult.data ?? []) as Organization[];
  const pendingRequest = requestsResult.data as AccessRequest | null;
  const pendingScope = !pendingRequest
    ? null
    : pendingRequest.request_type === "alumni"
      ? "Alumni access"
      : Array.isArray(pendingRequest.organizations)
        ? pendingRequest.organizations[0]?.name
        : pendingRequest.organizations?.name;

  return (
    <PortalEntryShell>
      <section>
        <h1 className="text-h2">Request access</h1>
        <p className="mt-4 max-w-3xl text-sm opacity-60">
          Signed in as {access.profile.email}. Your request must be approved before you can enter the portal.
        </p>

        {(submitted === "true" || pendingRequest) ? (
          <section className="portal-surface mt-8 max-w-4xl p-6 sm:p-8">
            <span className="portal-pill">Request received</span>
            <h2 className="mt-6 text-h3 font-medium">Pending approval</h2>
            {pendingScope && (
              <p className="mt-2 text-sm opacity-55">{pendingScope}</p>
            )}
          </section>
        ) : (
          <AccessRequestForm
            errorMessage={error ? errorMessages[error] : undefined}
            firstName={access.profile.firstName ?? ""}
            lastName={access.profile.lastName ?? ""}
            organizations={organizations}
            studyYear={access.profile.studyYear}
          />
        )}
      </section>
    </PortalEntryShell>
  );
}
