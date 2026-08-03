import { redirect } from "next/navigation";
import { submitAccessRequest } from "@/app/access/actions";
import { PortalEntryShell } from "@/components/portal/portal-entry-shell";
import { STUDY_FIELDS } from "@/lib/profile/study-fields";
import { getPortalAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type Organization = { id: number; name: string };
type AccessRequest = {
  id: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  organizations: { name: string } | { name: string }[];
};

const errorMessages: Record<string, string> = {
  invalid_request: "Check the information and try again.",
  already_pending: "You already have a pending request for this organization.",
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

  if (access.membership) {
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
      .select("id, status, organizations (name)")
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
  const pendingOrganization = pendingRequest
    ? Array.isArray(pendingRequest.organizations)
      ? pendingRequest.organizations[0]?.name
      : pendingRequest.organizations.name
    : null;

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
            {pendingOrganization && (
              <p className="mt-2 text-sm opacity-55">{pendingOrganization}</p>
            )}
          </section>
        ) : (
          <form action={submitAccessRequest} className="mt-8 grid max-w-4xl gap-6 sm:grid-cols-2">
            {error && errorMessages[error] && (
              <p className="text-sm text-[#a33b2b] sm:col-span-2" role="alert">{errorMessages[error]}</p>
            )}
            <label className="grid gap-2"><span className="section-label opacity-45">First name <span className="text-copper" aria-hidden="true">*</span></span><input name="firstName" className="portal-field" defaultValue={access.profile.firstName ?? ""} maxLength={80} autoComplete="given-name" required /></label>
            <label className="grid gap-2"><span className="section-label opacity-45">Last name <span className="text-copper" aria-hidden="true">*</span></span><input name="lastName" className="portal-field" defaultValue={access.profile.lastName ?? ""} maxLength={80} autoComplete="family-name" required /></label>
            <label className="grid gap-2 sm:col-span-2">
              <span className="section-label opacity-45">Organization <span className="text-copper" aria-hidden="true">*</span></span>
              <select name="organizationId" className="portal-field" defaultValue="" required>
                <option value="" disabled>Select organization</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>{organization.name}</option>
                ))}
              </select>
            </label>
              <label className="grid gap-2">
                <span className="section-label opacity-45">Field of study</span>
                <select name="fieldOfStudy" className="portal-field" defaultValue="">
                  <option value="">Not provided</option>
                  {STUDY_FIELDS.map((field) => (
                    <option key={field} value={field}>{field}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="section-label opacity-45">Study year <span className="text-copper" aria-hidden="true">*</span></span>
                <select name="studyYear" className="portal-field" defaultValue={access.profile.studyYear ?? ""} required>
                  <option value="" disabled>Select year</option>
                  {[1, 2, 3, 4, 5, 6].map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </label>
            <label className="grid gap-2 sm:col-span-2"><span className="section-label opacity-45">Message</span><textarea name="message" className="portal-field min-h-32 resize-y" maxLength={2000} /></label>
            <div className="sm:col-span-2">
              <button className="portal-button" type="submit">Send request<span className="material-symbols-outlined">arrow_right_alt</span></button>
            </div>
          </form>
        )}
      </section>
    </PortalEntryShell>
  );
}
