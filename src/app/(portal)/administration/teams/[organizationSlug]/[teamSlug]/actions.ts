"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganizationAdminAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveTeamSettings(formData: FormData) {
  const access = await requireOrganizationAdminAccess();
  const organizationSlug = textValue(formData, "organizationSlug");
  const teamSlug = textValue(formData, "teamSlug");
  const allowedOrganization = access.administeredOrganizations.some(
    (membership) => membership.organizationSlug === organizationSlug,
  );

  if (!allowedOrganization) redirect("/administration/teams");

  function editRedirect(value: string): never {
    redirect(`/administration/teams/${organizationSlug}/${teamSlug}?${value}`);
  }

  const teamId = Number(textValue(formData, "teamId"));
  const name = textValue(formData, "name");
  const description = textValue(formData, "description");
  const expectedUpdatedAt = textValue(formData, "expectedUpdatedAt");
  const personIds = formData
    .getAll("personIds")
    .map((value) => Number(value))
    .filter((value) => Number.isSafeInteger(value) && value > 0);

  if (
    !Number.isSafeInteger(teamId) ||
    teamId <= 0 ||
    !expectedUpdatedAt ||
    name.length < 1 ||
    name.length > 160 ||
    description.length > 5000
  ) {
    editRedirect("error=invalid_team");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_team_settings", {
    p_description: description || null,
    p_expected_updated_at: expectedUpdatedAt,
    p_name: name,
    p_person_ids: personIds,
    p_team_id: teamId,
  });

  if (error) {
    if (error.message.includes("team_conflict")) {
      editRedirect("error=team_conflict");
    }
    editRedirect("error=team_update_failed");
  }

  revalidatePath("/", "layout");
  redirect(`/administration/teams/${organizationSlug}/${teamSlug}?saved=true`);
}
