import { PortalShell } from "@/components/portal/portal-shell";
import { requirePortalAccess } from "@/lib/auth/access";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const access = await requirePortalAccess();

  return (
    <PortalShell
      displayName={access.profile.fullName ?? access.profile.email}
      organizationName={access.membership.organizationName}
      role={access.membership.role}
    >
      {children}
    </PortalShell>
  );
}
