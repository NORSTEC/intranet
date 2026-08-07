import Link from "next/link";
import { requirePortalAdminAccess } from "@/lib/auth/access";
import { NORSTEC_EMAIL_DOMAIN } from "@/lib/portal/norstec";
import { CardIcon, SLACK_ICON } from "@/components/portal/card-icon";
import { createClient } from "@/lib/supabase/server";

const sections = [
  {
    description:
      "Everyone who holds a membership or alumni access. Portal access, roles, merges, and deletion happen here.",
    href: "/admin/people",
    icon: "person_edit",
    title: "Manage people",
  },
  {
    description:
      "Which email domains belong to which organization, and whether an account on one joins straight away or has to ask.",
    href: "/admin/organizations",
    icon: "domain",
    title: "Organizations and joining",
  },
  {
    description:
      "Every account in the norstec.no Google Workspace, and which of them belong to nobody in the portal.",
    href: "/admin/workspace",
    icon: "cloud",
    title: "Google accounts",
  },
  {
    description:
      "Everyone in the Norstec Slack workspace, and which of them belong to nobody in the portal.",
    href: "/admin/slack",
    icon: SLACK_ICON,
    title: "Slack accounts",
  },
  {
    description:
      "People who have been deleted but not yet purged. Restore them, or remove their data for good.",
    href: "/admin/deleted",
    icon: "person_remove",
    title: "Deleted people",
  },
  {
    description:
      "Every administrative decision in the portal, with who made it and when.",
    href: "/admin/audit-log",
    icon: "history",
    title: "Audit log",
  },
];

type AdministratorRow = {
  person_id: number;
  people: {
    full_name: string | null;
    portal_accounts: Array<{ account_email: string }>;
  } | null;
};

/**
 * The norstec.no requirement is checked when the role is granted and never
 * again, and `is_portal_admin()` reads the table alone. Enforcing it on every
 * authorization check would make one bad directory sync capable of locking
 * every administrator out at once, so the portal reports instead and leaves
 * the decision to a person who can see the whole picture.
 */
async function administratorsWithoutNorstecAccount() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portal_administrators")
    .select("person_id, people (full_name, portal_accounts (account_email))");

  if (error || !data) return [];

  return (data as unknown as AdministratorRow[])
    .filter(
      (administrator) =>
        !administrator.people?.portal_accounts.some(
          (account) =>
            account.account_email.split("@")[1]?.toLocaleLowerCase("en") ===
            NORSTEC_EMAIL_DOMAIN,
        ),
    )
    .map((administrator) => ({
      id: administrator.person_id,
      name: administrator.people?.full_name ?? "Unnamed person",
    }));
}

export default async function PortalManagementPage() {
  await requirePortalAdminAccess();
  const strandedAdministrators = await administratorsWithoutNorstecAccount();

  return (
    <>
      {strandedAdministrators.length > 0 && (
        <section
          aria-labelledby="stranded-administrators-heading"
          className="portal-surface mb-5 border-copper p-6 sm:p-7"
        >
          <h2 className="text-h3" id="stranded-administrators-heading">
            Portal administrators without a Norstec account
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed opacity-60">
            Becoming a portal administrator requires a norstec.no Google
            account. These administrators no longer sign in with one, so the
            role now rests on nothing. Revoke it, or have them link the account
            again.
          </p>
          <ul className="mt-5 grid gap-2">
            {strandedAdministrators.map((administrator) => (
              <li key={administrator.id}>
                <Link
                  className="font-medium underline underline-offset-4"
                  href={`/admin/people/${administrator.id}`}
                >
                  {administrator.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <Link
            className="portal-surface portal-card-link group flex min-h-64 flex-col p-5"
            href={section.href}
            key={section.href}
          >
            <CardIcon icon={section.icon} />
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
    </>
  );
}
