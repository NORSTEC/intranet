import Link from "next/link";
import { redirect } from "next/navigation";
import { OrganizationLogo } from "@/components/portal/organization-logo";
import { requireOrganizationAdminAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export default async function OrganizationSettingsIndexPage() {
  const access = await requireOrganizationAdminAccess();
  const { administeredOrganizations } = access;

  if (administeredOrganizations.length === 1) {
    redirect(
      `/administration/organization/${administeredOrganizations[0].organizationSlug}`,
    );
  }

  const supabase = await createClient();
  const organizationIds = administeredOrganizations.map(
    (membership) => membership.organizationId,
  );
  const organizationResult = await supabase
    .from("organizations")
    .select("id, name, slug, logo_path")
    .in("id", organizationIds)
    .order("name");

  if (organizationResult.error) {
    throw new Error("Could not load administered organizations");
  }

  return (
    <section>
      <p className="mb-7 max-w-xl text-sm leading-relaxed opacity-60">
        Choose the organization you want to edit.
      </p>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {organizationResult.data.map((organization) => (
          <Link
            className="portal-surface portal-card-link group flex min-h-64 flex-col p-5"
            href={`/administration/organization/${organization.slug}`}
            key={organization.id}
          >
            <OrganizationLogo
              logoPath={organization.logo_path}
              name={organization.name}
            />
            <span className="mt-auto flex items-center justify-between gap-4 pt-7">
              <span className="text-xl font-medium">{organization.name}</span>
              <span
                aria-hidden="true"
                className="material-symbols-outlined shrink-0 transition-transform group-hover:translate-x-1"
              >
                trending_flat
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
