"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganizationAdminAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

const specializations = new Set([
  "rocketeering",
  "satellites",
  "satellites-and-rocketeering",
]);

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveOrganizationSettings(formData: FormData) {
  const access = await requireOrganizationAdminAccess();
  const organizationSlug = textValue(formData, "organizationSlug");
  const administeredOrganization = access.administeredOrganizations.find(
    (membership) => membership.organizationSlug === organizationSlug,
  );

  if (!administeredOrganization) redirect("/administration/organization");

  function editRedirect(value: string): never {
    redirect(`/administration/organization/${organizationSlug}?${value}`);
  }

  const name = textValue(formData, "name");
  const websiteUrl = textValue(formData, "websiteUrl");
  const shortDescription = textValue(formData, "shortDescription");
  const specialization = textValue(formData, "specialization");
  const location = textValue(formData, "location");
  const expectedUpdatedAt = textValue(formData, "expectedUpdatedAt");

  let validWebsite = true;
  if (websiteUrl) {
    try {
      const url = new URL(websiteUrl);
      validWebsite = url.protocol === "https:" || url.protocol === "http:";
    } catch {
      validWebsite = false;
    }
  }

  if (
    !expectedUpdatedAt ||
    name.length < 1 ||
    name.length > 120 ||
    websiteUrl.length > 2048 ||
    !validWebsite ||
    shortDescription.length > 1000 ||
    location.length > 160 ||
    (specialization && !specializations.has(specialization))
  ) {
    editRedirect("error=invalid_organization");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_organization_settings", {
    p_expected_updated_at: expectedUpdatedAt,
    p_location: location || null,
    p_name: name,
    p_organization_id: administeredOrganization.organizationId,
    p_short_description: shortDescription || null,
    p_specialization: specialization || null,
    p_website_url: websiteUrl || null,
  });

  if (error) {
    if (error.message.includes("organization_conflict")) {
      editRedirect("error=organization_conflict");
    }
    editRedirect("error=organization_update_failed");
  }

  revalidatePath("/", "layout");
  redirect(`/administration/organization/${organizationSlug}?saved=true`);
}
