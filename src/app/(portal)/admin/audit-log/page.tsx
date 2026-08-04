import { AuditLogTable } from "@/components/portal/audit-log-table";
import { requirePortalAdminAccess } from "@/lib/auth/access";
import { loadAuditLog } from "@/lib/portal/person-audit";

export default async function AuditLogPage() {
  await requirePortalAdminAccess();
  const events = await loadAuditLog();

  return (
    <>
      <p className="max-w-2xl text-sm opacity-55">
        Click an event to see its details.
      </p>

      <AuditLogTable entries={events} />
    </>
  );
}
