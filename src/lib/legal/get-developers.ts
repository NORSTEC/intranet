"use server";

import {
  PORTAL_DEVELOPERS,
  type ResolvedDeveloper,
} from "@/lib/legal/developers";
import { getMemberAvatarUrls } from "@/lib/storage/member-avatars";
import { createClient } from "@/lib/supabase/server";

type PersonRef = { avatar_path: string | null; id: number };
type EmailRow = { email: string; people: PersonRef | PersonRef[] | null };

/**
 * Fills the developer cards in from the portal itself, so a profile picture
 * changed on somebody's profile page shows up here without an edit to
 * `PORTAL_DEVELOPERS`.
 *
 * The lookup keys on the address rather than the name. `person_emails.email`
 * is unique and constrained to lowercase, so an exact match either finds the
 * person or proves they are not there; matching a display name only ever
 * guesses, and a middle name typed one way here and another way on the
 * profile silently loses the picture and the link.
 *
 * Called when the dialog opens rather than while the footer renders: the
 * footer is on every page in the portal, and a query per page load to fill a
 * panel almost nobody opens is not worth it.
 *
 * A signed-out visitor gets an error back rather than rows — `anon` holds no
 * grant on these tables at all — and the dialog keeps the names, roles and
 * addresses `PORTAL_DEVELOPERS` already carries.
 */
export async function getPortalDevelopers(): Promise<ResolvedDeveloper[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("person_emails")
    .select("email, people (id, avatar_path)")
    .in(
      "email",
      PORTAL_DEVELOPERS.map((developer) =>
        developer.email.toLocaleLowerCase("en"),
      ),
    );

  if (error || !data) {
    return PORTAL_DEVELOPERS;
  }

  const rows = data as EmailRow[];
  const personFor = new Map<string, PersonRef>();

  for (const row of rows) {
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    if (person) personFor.set(row.email, person);
  }

  const avatarUrls = await getMemberAvatarUrls(
    [...personFor.values()].map((person) => person.avatar_path),
  );

  return PORTAL_DEVELOPERS.map((developer) => {
    const person = personFor.get(developer.email.toLocaleLowerCase("en"));

    if (!person) return developer;

    return {
      ...developer,
      avatarUrl: person.avatar_path
        ? avatarUrls.get(person.avatar_path)
        : undefined,
      personId: person.id,
    };
  });
}
