import Link from "next/link";
import { auditCategoryLabels } from "@/lib/portal/audit-categories";
import type { AuditLogEntryDetail } from "@/lib/portal/person-audit";

function formatMoment(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function Fact({ children, term }: { children: React.ReactNode; term: string }) {
  return (
    <div className="min-w-0">
      <dt className="section-label opacity-45">{term}</dt>
      <dd className="mt-2 font-medium break-words">{children}</dd>
    </div>
  );
}

/**
 * A person still in the portal is reachable from the event that touched them.
 * One who is gone — purged, or discarded with a declined request — is named
 * from whatever snapshot survived, and links nowhere.
 */
function Person({
  fallback,
  name,
  personId,
}: {
  fallback: string;
  name: string | null;
  personId: number | null;
}) {
  if (personId === null) return <>{name ?? fallback}</>;

  return (
    <Link
      className="transition-colors hover:text-copper"
      href={`/admin/people/${personId}`}
    >
      {name ?? "Unnamed person"}
    </Link>
  );
}

/**
 * Everything one audit event holds, under its own heading. Shared by the
 * dialog the log opens and the page a link to a single event lands on, so the
 * two never drift apart.
 */
export function AuditEventFacts({
  className,
  event,
}: {
  className?: string;
  event: AuditLogEntryDetail;
}) {
  return (
    <dl className={`grid gap-x-10 gap-y-7 sm:grid-cols-2 ${className ?? ""}`}>
      <Fact term="Category">{auditCategoryLabels[event.category]}</Fact>
      <Fact term="Time">{formatMoment(event.createdAt)}</Fact>
      <Fact term="Affected account">
        <Person
          fallback="Deleted account"
          name={event.targetName}
          personId={event.targetId}
        />
      </Fact>
      <Fact term="Performed by">
        <Person
          fallback="Automatic"
          name={event.actorName}
          personId={event.actorId}
        />
      </Fact>
      {event.organizationName && (
        <Fact term="Organization">{event.organizationName}</Fact>
      )}
      {event.fields.map((field) => (
        <Fact key={field.term} term={field.term}>
          {field.value}
        </Fact>
      ))}
    </dl>
  );
}
