import { notFound } from "next/navigation";
import { PortalBreadcrumbData } from "@/components/portal/portal-breadcrumb-data";
import { TeamMemberCard } from "@/components/portal/team-member-card";
import { requirePortalAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { getMemberAvatarUrls } from "@/lib/storage/member-avatars";

type TeamMemberRow = {
  id: number;
  role_title: string | null;
  sort_order: number;
  people:
    | {
        id: number;
        full_name: string | null;
        avatar_path: string | null;
        phone_number: string | null;
        linkedin_url: string | null;
      }
    | Array<{
        id: number;
        full_name: string | null;
        avatar_path: string | null;
        phone_number: string | null;
        linkedin_url: string | null;
      }>;
};

type PersonEmailRow = {
  person_id: number;
  email: string;
  email_type: string;
  is_primary: boolean;
};

export default async function TeamDetailsPage({
  params,
}: {
  params: Promise<{ slug: string; teamSlug: string }>;
}) {
  await requirePortalAccess();
  const { slug, teamSlug } = await params;
  const supabase = await createClient();

  const organizationResult = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (organizationResult.error) throw new Error("Could not load organization");
  if (!organizationResult.data) notFound();

  const teamResult = await supabase
    .from("teams")
    .select("id, name, description")
    .eq("organization_id", organizationResult.data.id)
    .eq("slug", teamSlug)
    .eq("status", "active")
    .maybeSingle();

  if (teamResult.error) throw new Error("Could not load team");
  if (!teamResult.data) notFound();

  const membersResult = await supabase
    .from("team_memberships")
    .select(
      "id, role_title, sort_order, people!team_memberships_person_id_fkey (id, full_name, avatar_path, phone_number, linkedin_url)",
    )
    .eq("team_id", teamResult.data.id)
    .is("archived_at", null)
    .order("sort_order");

  if (membersResult.error) throw new Error("Could not load team members");

  const members = (membersResult.data as TeamMemberRow[])
    .map((membership) => ({
      ...membership,
      person: Array.isArray(membership.people)
        ? membership.people[0]
        : membership.people,
    }))
    .filter((membership) => Boolean(membership.person));
  const [avatarUrls, emailsResult] = await Promise.all([
    getMemberAvatarUrls(members.map((membership) => membership.person.avatar_path)),
    members.length
      ? supabase
          .from("person_emails")
          .select("person_id, email, email_type, is_primary")
          .in(
            "person_id",
            members.map((membership) => membership.person.id),
          )
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (emailsResult.error) throw new Error("Could not load member contact details");

  const emailsByPerson = new Map<number, PersonEmailRow[]>();
  for (const personEmail of emailsResult.data as PersonEmailRow[]) {
    const emails = emailsByPerson.get(personEmail.person_id) ?? [];
    emails.push(personEmail);
    emailsByPerson.set(personEmail.person_id, emails);
  }

  return (
    <>
      <PortalBreadcrumbData
        labels={{
          [`/organizations/${slug}`]: organizationResult.data.name,
          [`/organizations/${slug}/teams/${teamSlug}`]: teamResult.data.name,
        }}
      />
      <header className="max-w-3xl">
        <h1 className="text-h2">{teamResult.data.name}</h1>
        {teamResult.data.description && (
          <p className="mt-4 text-sm opacity-60">{teamResult.data.description}</p>
        )}
      </header>

      {members.length > 0 ? (
        <section className="mt-10 grid grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((membership) => {
            const name = membership.person.full_name ?? "Unnamed member";
            const avatarPath = membership.person.avatar_path;
            const personEmails = emailsByPerson.get(membership.person.id) ?? [];
            const preferredEmail =
              personEmails.find((email) => email.email_type === "organization") ??
              personEmails.find((email) => email.is_primary) ??
              personEmails[0];

            return (
              <TeamMemberCard
                avatarUrl={avatarPath ? avatarUrls.get(avatarPath) : undefined}
                email={preferredEmail?.email}
                href={`/organizations/${slug}/teams/${teamSlug}/members/${membership.person.id}`}
                key={membership.id}
                linkedinUrl={membership.person.linkedin_url}
                name={name}
                phoneNumber={membership.person.phone_number}
                roleTitle={membership.role_title}
              />
            );
          })}
        </section>
      ) : (
        <p className="mt-8 text-sm opacity-55">No team members have been added yet.</p>
      )}
    </>
  );
}
