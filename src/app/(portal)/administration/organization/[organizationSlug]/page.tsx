import { notFound } from "next/navigation";
import { saveOrganizationSettings } from "@/app/(portal)/administration/organization/[organizationSlug]/actions";
import { OrganizationLogo } from "@/components/portal/organization-logo";
import {
  OrganizationEditForm,
  OrganizationEditorActions,
} from "@/components/portal/organization-edit-form";
import { PortalBreadcrumbData } from "@/components/portal/portal-breadcrumb-data";
import { Toast } from "@/components/portal/toast";
import { requireOrganizationAdminAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

const specializationOptions = [
  { label: "Rocketeering", value: "rocketeering" },
  { label: "Satellites", value: "satellites" },
  { label: "Satellites and Rocketeering", value: "satellites-and-rocketeering" },
];

const errorMessages: Record<string, string> = {
  invalid_organization: "Check the organization fields and try again.",
  organization_conflict:
    "The organization changed after this page was opened. Review the latest values and try again.",
  organization_update_failed: "The organization could not be saved.",
};

export default async function OrganizationSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const access = await requireOrganizationAdminAccess();
  const { organizationSlug } = await params;
  const { error, saved } = await searchParams;
  const administeredOrganization = access.administeredOrganizations.find(
    (membership) => membership.organizationSlug === organizationSlug,
  );

  if (!administeredOrganization) notFound();

  const supabase = await createClient();
  const organizationResult = await supabase
    .from("organizations")
    .select(
      "id, name, website_url, short_description, specialization, location, logo_path, updated_at",
    )
    .eq("id", administeredOrganization.organizationId)
    .single();

  if (organizationResult.error) throw new Error("Could not load organization");

  const organization = organizationResult.data;
  const hasSingleAdministeredOrganization =
    access.administeredOrganizations.length === 1;

  return (
    <>
      <PortalBreadcrumbData
        labels={{
          [`/administration/organization/${organizationSlug}`]:
            hasSingleAdministeredOrganization ? null : organization.name,
        }}
      />

      <OrganizationEditForm action={saveOrganizationSettings}>
        <input name="organizationSlug" type="hidden" value={organizationSlug} />
        <input
          name="expectedUpdatedAt"
          type="hidden"
          value={organization.updated_at}
        />

        {saved === "true" && (
          <Toast clearParams={["saved"]} message="Changes saved." status="success" />
        )}
        {error && (
          <Toast
            clearParams={["error"]}
            message={errorMessages[error] ?? "The organization could not be saved."}
            status="error"
          />
        )}

        <div className="mb-8 flex min-h-11 items-center justify-end overflow-x-auto">
          <OrganizationEditorActions />
        </div>

        <section className="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start lg:gap-12">
          <OrganizationLogo
            logoPath={organization.logo_path}
            name={organization.name}
            size="detail"
          />

          <div className="grid gap-6 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="section-label opacity-45">
                Name <span aria-hidden="true" className="text-copper">*</span>
              </span>
              <input
                className="portal-field mt-3"
                defaultValue={organization.name}
                maxLength={120}
                name="name"
                required
              />
            </label>

            <label>
              <span className="section-label opacity-45">Website</span>
              <input
                className="portal-field mt-3"
                defaultValue={organization.website_url ?? ""}
                maxLength={2048}
                name="websiteUrl"
                placeholder="https://"
                type="url"
              />
            </label>

            <label>
              <span className="section-label opacity-45">Location</span>
              <input
                className="portal-field mt-3"
                defaultValue={organization.location ?? ""}
                maxLength={160}
                name="location"
                placeholder="Not specified"
              />
            </label>

            <label className="sm:col-span-2">
              <span className="section-label opacity-45">Specialization</span>
              <select
                className="portal-field mt-3"
                defaultValue={organization.specialization ?? ""}
                name="specialization"
              >
                <option value="">Not specified</option>
                {specializationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="sm:col-span-2">
              <span className="section-label opacity-45">Description</span>
              <textarea
                className="portal-field mt-3 min-h-32 resize-y"
                defaultValue={organization.short_description ?? ""}
                maxLength={1000}
                name="shortDescription"
                placeholder="General information shown on the organization page."
              />
            </label>
          </div>
        </section>

        <div className="mt-10 flex min-h-11 items-center justify-end overflow-x-auto">
          <OrganizationEditorActions />
        </div>
      </OrganizationEditForm>
    </>
  );
}
