import { PortalShell } from "@/components/portal/portal-shell";
import { requirePortalAccess } from "@/lib/auth/access";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const access = await requirePortalAccess();
  const organizationLabel = access.memberships.length === 1
    ? access.membership.organizationName
    : `${access.memberships.length} organizations`;

  return (
    <PortalShell
      displayName={access.profile.fullName ?? access.profile.email}
      organizationName={organizationLabel}
      role={access.membership.role}
    >
      {children}
    </PortalShell>
  );
}
