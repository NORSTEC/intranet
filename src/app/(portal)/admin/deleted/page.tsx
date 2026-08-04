import {
  DeletedPeopleTable,
  type DeletedPerson,
} from "@/components/portal/deleted-people-table";
import { requirePortalAdminAccess } from "@/lib/auth/access";
import { loadRegistryPeople } from "@/lib/portal/people-registry";

export default async function DeletedUsersPage() {
  await requirePortalAdminAccess();
  const people = await loadRegistryPeople();
  const deletedPeople = people.flatMap((person) =>
    person.deletedAt
      ? [
          {
            avatarUrl: person.avatarUrl,
            deletedAt: person.deletedAt,
            email: person.email,
            id: person.id,
            name: person.name,
            organizations: person.organizations,
          } satisfies DeletedPerson,
        ]
      : [],
  );

  return (
    <>
      <p className="max-w-2xl text-sm opacity-55">
        Deleted users are hidden from everyone except portal administrators.
        Their data is erased permanently 30 days after the deletion, whether or
        not anybody acts on it. Restore them, or delete them for good before the
        30 days run out.
      </p>

      <DeletedPeopleTable people={deletedPeople} />
    </>
  );
}
