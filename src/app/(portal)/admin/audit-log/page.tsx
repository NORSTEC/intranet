import { requirePortalAdminAccess } from "@/lib/auth/access";

const events = [["Access request approved", "Emilie Moe · Orbit NTNU", "Today, 10:42"], ["Member changed to alumni", "Mina Isaksen · Portal Space", "Yesterday, 15:18"], ["Organization settings updated", "Interstellar NTNU", "30 July, 12:03"], ["Administrator role assigned", "Jonas Strand · Orbit NTNU", "28 July, 09:21"]];

export default async function AuditLogPage() {
  await requirePortalAdminAccess();

  return (
    <>
      <div className="mb-7 flex flex-wrap gap-2"><button className="portal-pill" type="button">All events</button><button className="portal-pill portal-pill-outline" type="button">Access</button><button className="portal-pill portal-pill-outline" type="button">Memberships</button><button className="portal-pill portal-pill-outline" type="button">Administrators</button></div>
      <section className="grid gap-3">
        {events.map(([action, subject, timestamp]) => <article key={`${action}-${timestamp}`} className="portal-surface grid gap-3 p-5 sm:grid-cols-[1.2fr_1fr_auto] sm:items-center sm:px-6"><p className="font-medium">{action}</p><p className="text-sm opacity-55">{subject}</p><time className="portal-pill portal-pill-outline">{timestamp}</time></article>)}
      </section>
    </>
  );
}
