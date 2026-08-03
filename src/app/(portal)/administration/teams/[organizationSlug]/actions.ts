"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationAdminAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export type CreateTeamResult =
  | { ok: true; slug: string }
  | { ok: false; message: string };

export type TeamActionResult = { ok: true; message: string } | { ok: false; message: string };

export async function createTeam(input: {
  description: string;
  name: string;
  organizationSlug: string;
}): Promise<CreateTeamResult> {
  const access = await requireOrganizationAdminAccess();
  const administeredOrganization = access.administeredOrganizations.find(
    (membership) => membership.organizationSlug === input.organizationSlug,
  );

  const name = input.name.trim();
  const description = input.description.trim();

  if (!administeredOrganization || name.length < 1 || name.length > 160) {
    return { ok: false, message: "The team could not be created." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_team", {
    p_description: description || null,
    p_name: name,
    p_organization_id: administeredOrganization.organizationId,
  });

  if (error || !data) {
    return { ok: false, message: "The team could not be created." };
  }

  const created = data as { id: number; slug: string };
  revalidatePath(`/administration/teams/${input.organizationSlug}`);
  return { ok: true, slug: created.slug };
}

export async function deleteTeam(input: {
  organizationSlug: string;
  teamId: number;
}): Promise<TeamActionResult> {
  const access = await requireOrganizationAdminAccess();
  const allowedOrganization = access.administeredOrganizations.some(
    (membership) => membership.organizationSlug === input.organizationSlug,
  );

  if (!allowedOrganization || !Number.isSafeInteger(input.teamId) || input.teamId <= 0) {
    return { ok: false, message: "The team could not be deleted." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_team", {
    p_team_id: input.teamId,
  });

  if (error) {
    return { ok: false, message: "The team could not be deleted." };
  }

  revalidatePath(`/administration/teams/${input.organizationSlug}`);
  return { ok: true, message: "Team deleted." };
}
