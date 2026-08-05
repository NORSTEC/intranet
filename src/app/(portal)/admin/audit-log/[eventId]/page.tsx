import { notFound } from "next/navigation";
import { AuditEventFacts } from "@/components/portal/audit-event-facts";
import { PortalBreadcrumbData } from "@/components/portal/portal-breadcrumb-data";
import { requirePortalAdminAccess } from "@/lib/auth/access";
import { loadAuditLogEntry } from "@/lib/portal/person-audit";

export default async function AuditLogEntryPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  await requirePortalAdminAccess();
  const { eventId: eventIdParameter } = await params;
  const eventId = Number(eventIdParameter);

  if (!Number.isSafeInteger(eventId) || eventId <= 0) notFound();

  const event = await loadAuditLogEntry(eventId);
  if (!event) notFound();

  return (
    <>
      <PortalBreadcrumbData
        labels={{ [`/admin/audit-log/${eventId}`]: event.title }}
      />

      <section aria-labelledby="audit-event-heading">
        <h1 className="text-h2" id="audit-event-heading">
          {event.title}
        </h1>

        <AuditEventFacts className="mt-10 xl:grid-cols-3" event={event} />
      </section>
    </>
  );
}
