import { MembersDirectory } from "@/components/portal/members-directory";
import type { DirectoryMember } from "@/components/portal/members-directory";
import { requirePortalAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { getMemberAvatarUrls } from "@/lib/storage/member-avatars";

type MembershipRow = {
  status: string;
  people:
    | {
        id: number;
        full_name: string | null;
        avatar_path: string | null;
        linkedin_url: string | null;
        phone_number: string | null;
      }
    | Array<{
        id: number;
        full_name: string | null;
        avatar_path: string | null;
        linkedin_url: string | null;
        phone_number: string | null;
      }>;
  organizations:
    | { id: number; name: string; slug: string }
    | Array<{ id: number; name: string; slug: string }>;
};

type AlumniPersonRow = {
  id: number;
  full_name: string | null;
  avatar_path: string | null;
  linkedin_url: string | null;
  phone_number: string | null;
};

type PersonEmailRow = {
  person_id: number;
  email: string;
  email_type: string;
  is_primary: boolean;
};

type MemberAccumulator = {
  id: number;
  name: string;
  avatarPath: string | null;
  linkedinUrl: string | null;
  phoneNumber: string | null;
  statuses: Set<string>;
  organizations: Map<number, { id: number; name: string; slug: string }>;
};

export default async function MembersPage() {
  const access = await requirePortalAccess();
  const supabase = await createClient();

  const [membershipsResult, alumniResult] = await Promise.all([
    supabase
      .from("memberships")
      .select(
        "status, people (id, full_name, avatar_path, linkedin_url, phone_number), organizations (id, name, slug)",
      )
      .in("status", ["active", "ended"]),
    // Alumni granted portal access directly belong to no organization, so
    // they have no membership row to reach them through.
    supabase
      .from("people")
      .select("id, full_name, avatar_path, linkedin_url, phone_number")
      .not("alumni_access_granted_at", "is", null)
      .eq("portal_access_status", "active"),
  ]);

  if (membershipsResult.error || alumniResult.error) {
    throw new Error("Could not load member directory");
  }

  const membersById = new Map<number, MemberAccumulator>();
  for (const row of membershipsResult.data as MembershipRow[]) {
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    const organization = Array.isArray(row.organizations)
      ? row.organizations[0]
      : row.organizations;
    if (!person || !organization) continue;

    const member = membersById.get(person.id) ?? {
      id: person.id,
      name: person.full_name ?? "Unnamed member",
      avatarPath: person.avatar_path,
      linkedinUrl: person.linkedin_url,
      phoneNumber: person.phone_number,
      statuses: new Set<string>(),
      organizations: new Map(),
    };
    member.statuses.add(row.status);
    if (row.status === "active") {
      member.organizations.set(organization.id, organization);
    }
    membersById.set(person.id, member);
  }

  for (const person of alumniResult.data as AlumniPersonRow[]) {
    const member = membersById.get(person.id) ?? {
      id: person.id,
      name: person.full_name ?? "Unnamed member",
      avatarPath: person.avatar_path,
      linkedinUrl: person.linkedin_url,
      phoneNumber: person.phone_number,
      statuses: new Set<string>(),
      organizations: new Map(),
    };
    member.statuses.add("ended");
    membersById.set(person.id, member);
  }

  const [emailsResult, avatarUrls] = await Promise.all([
    supabase
      .from("person_emails")
      .select("person_id, email, email_type, is_primary"),
    getMemberAvatarUrls(
      [...membersById.values()].map((member) => member.avatarPath),
    ),
  ]);

  if (emailsResult.error) throw new Error("Could not load member email addresses");

  const emailsByPerson = new Map<number, PersonEmailRow[]>();
  for (const personEmail of emailsResult.data as PersonEmailRow[]) {
    const emails = emailsByPerson.get(personEmail.person_id) ?? [];
    emails.push(personEmail);
    emailsByPerson.set(personEmail.person_id, emails);
  }

  const members: DirectoryMember[] = [...membersById.values()]
    .map((member) => {
      const personEmails = emailsByPerson.get(member.id) ?? [];
      const preferredEmail =
        personEmails.find((email) => email.email_type === "organization") ??
        personEmails.find((email) => email.is_primary) ??
        personEmails[0];

      return {
        id: member.id,
        name: member.name,
        avatarUrl: member.avatarPath
          ? avatarUrls.get(member.avatarPath)
          : undefined,
        email: preferredEmail?.email ?? null,
        linkedinUrl: member.linkedinUrl,
        organizations: [...member.organizations.values()].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
        phoneNumber: member.phoneNumber,
        profileHref: `/members/${member.id}`,
        status: member.statuses.has("active")
          ? ("active" as const)
          : ("alumni" as const),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const organizations = [...membersById.values()]
    .flatMap((member) => [...member.organizations.values()])
    .filter(
      (organization, index, all) =>
        all.findIndex((candidate) => candidate.id === organization.id) === index,
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  return (
    <MembersDirectory
      currentPersonId={access.profile.personId}
      members={members}
      organizations={organizations}
    />
  );
}
