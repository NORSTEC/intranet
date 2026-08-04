import { AuditLogTable } from "@/components/portal/audit-log-table";
import type { PersonAuditEntry } from "@/lib/portal/person-audit";

export function PersonAuditFeed({ entries }: { entries: PersonAuditEntry[] }) {
  return (
    <section aria-labelledby="person-history-heading" className="mt-16">
      <h2 className="text-h2" id="person-history-heading">
        History
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed opacity-55">
        Every recorded change to this person&apos;s access, roles, and
        memberships, newest first.
      </p>

      <AuditLogTable
        emptyMessage="Nothing has been recorded yet."
        entries={entries}
        showDateRangeFilter={false}
      />
    </section>
  );
}
