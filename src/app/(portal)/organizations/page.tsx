import Link from "next/link";
import { OrganizationLogo } from "@/components/portal/organization-logo";
import { requirePortalAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export default async function OrganizationsPage() {
  await requirePortalAccess();
  const supabase = await createClient();

  const organizationsResult = await supabase
    .from("organizations")
    .select("id, name, slug, short_description, logo_path")
    .eq("status", "active")
    .order("name");

  if (organizationsResult.error) {
    throw new Error("Could not load organizations");
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {organizationsResult.data.map((organization) => (
        <Link
          key={organization.id}
          href={`/organizations/${organization.slug}`}
          className="portal-surface portal-card-link group flex min-h-72 flex-col p-5"
        >
          <OrganizationLogo logoPath={organization.logo_path} name={organization.name} />
          <h2 className="mt-7 text-2xl font-medium">{organization.name}</h2>
          {organization.short_description && (
            <p className="mt-3 text-sm opacity-55">{organization.short_description}</p>
          )}
          <span className="mt-auto flex items-center justify-end pt-8">
            <span className="material-symbols-outlined ml-auto transition-transform group-hover:translate-x-1">
              trending_flat
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
