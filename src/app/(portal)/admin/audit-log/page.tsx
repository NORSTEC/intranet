import { requirePortalAdminAccess } from "@/lib/auth/access";
import { loadAuditLog } from "@/lib/portal/person-audit";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function AuditLogPage() {
  await requirePortalAdminAccess();
  const events = await loadAuditLog();

  return (
    <>
      <div className="mb-7 flex flex-wrap gap-2">
        <button className="portal-pill" type="button">
          All events
        </button>
        <button className="portal-pill portal-pill-outline" type="button">
          Access
        </button>
        <button className="portal-pill portal-pill-outline" type="button">
          Memberships
        </button>
        <button className="portal-pill portal-pill-outline" type="button">
          Administrators
        </button>
      </div>
      <section className="grid gap-3">
      {events.length === 0 ? (
        <p className="text-sm opacity-55">No events recorded yet.</p>
      ) : (
        events.map((event) => {
          const subject = [event.targetName, event.organizationName]
            .filter(Boolean)
            .join(" · ");
          return (
            <article
              className="portal-surface grid gap-3 p-5 sm:grid-cols-[1.2fr_1fr_auto] sm:items-center sm:px-6"
              key={event.id}
            >
              <p className="font-medium">
                {event.title}
                {event.detail && (
                  <span className="block text-sm font-normal opacity-55">
                    {event.detail}
                  </span>
                )}
              </p>
              <p className="text-sm opacity-55">
                {subject || event.actorName || "—"}
              </p>
              <time className="portal-pill portal-pill-outline">
                {formatTimestamp(event.createdAt)}
              </time>
            </article>
          );
        })
      )}
      </section>
    </>
  );
}
