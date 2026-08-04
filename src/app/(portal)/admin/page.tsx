import Link from "next/link";
import { requirePortalAdminAccess } from "@/lib/auth/access";

const sections = [
  {
    description:
      "Every profile in the portal, including applicants and people who belong to no organization. Access, the administrator role, merges, and deletion happen here.",
    href: "/admin/people",
    icon: "person_edit",
    title: "Manage users",
  },
  {
    description:
      "People who have been deleted but not yet purged. Restore them, or remove their data for good.",
    href: "/admin/deleted",
    icon: "person_remove",
    title: "Deleted users",
  },
  {
    description:
      "Administrative decisions across the portal — access changes, membership changes, and role changes.",
    href: "/admin/audit-log",
    icon: "history",
    title: "Audit log",
  },
];

export default async function PortalManagementPage() {
  await requirePortalAdminAccess();

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {sections.map((section) => (
        <Link
          className="portal-surface portal-card-link group flex min-h-64 flex-col p-5"
          href={section.href}
          key={section.href}
        >
          <span
            aria-hidden="true"
            // Google's own `.material-symbols-outlined` rule is unlayered and
            // therefore beats Tailwind's layered utilities, so the size has to
            // be marked important to apply at all.
            className="material-symbols-outlined text-[5.5rem]! leading-none"
          >
            {section.icon}
          </span>
          <h2 className="mt-7 text-2xl font-medium">{section.title}</h2>
          <p className="mt-3 text-sm opacity-55">{section.description}</p>
          <span className="mt-auto flex items-center justify-end pt-8">
            <span
              aria-hidden="true"
              className="material-symbols-outlined transition-transform group-hover:translate-x-1"
            >
              trending_flat
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
