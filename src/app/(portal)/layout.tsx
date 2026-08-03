import { PortalShell } from "@/components/portal/portal-shell";
import { requirePortalAccess } from "@/lib/auth/access";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const access = await requirePortalAccess();
  const organizationLabel = access.memberships.length === 0
    ? "Alumni"
    : access.memberships.length === 1
      ? access.memberships[0].organizationName
      : `${access.memberships.length} organizations`;

  return (
    <PortalShell
      displayName={access.profile.fullName ?? access.profile.email}
      organizationName={organizationLabel}
      canAdministerOrganization={
        access.isPortalAdmin ||
        access.memberships.some(
          (membership) =>
            membership.status === "active" && membership.role === "organization_admin",
        )
      }
      isPortalAdmin={access.isPortalAdmin}
    >
      {children}
    </PortalShell>
  );
}
