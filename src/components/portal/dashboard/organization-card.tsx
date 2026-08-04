import Link from "next/link";
import { OrganizationLogo } from "@/components/portal/organization-logo";
import { formatMonth, type DashboardOrganization } from "@/lib/portal/dashboard";

export function OrganizationCard({ organization }: { organization: DashboardOrganization }) {
  const period = organization.until
    ? `Member ${formatMonth(organization.since)} — ${formatMonth(organization.until)}`
    : `Member since ${formatMonth(organization.since)}`;

  return (
    <Link
      className="portal-surface portal-card-link group flex min-h-72 flex-col p-5"
      href={`/organizations/${organization.slug}`}
    >
      <OrganizationLogo logoPath={organization.logoPath} name={organization.name} />

      <h3 className="mt-7 text-2xl font-medium">{organization.name}</h3>
      <p className="mt-3 text-sm opacity-55">{period}</p>

      <span className="mt-auto flex items-center justify-end pt-8">
        <span
          aria-hidden="true"
          className="material-symbols-outlined transition-transform group-hover:translate-x-1"
        >
          trending_flat
        </span>
      </span>
    </Link>
  );
}
