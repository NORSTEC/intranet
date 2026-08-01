"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePortalAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(formData: FormData, key: string) {
  const value = Number(formData.get(key));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function optionalDate(formData: FormData, key: string) {
  const value = textValue(formData, key);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : value ? null : "";
}

function validPeriod(startsOn: string, endsOn: string) {
  return !startsOn || !endsOn || endsOn >= startsOn;
}

function profileRedirect(value: string): never {
  redirect(`/profile?${value}`);
}

export async function updatePersonalProfile(formData: FormData) {
  const access = await requirePortalAccess();
  const fullName = textValue(formData, "fullName");
  const phoneNumber = textValue(formData, "phoneNumber");
  const fieldOfStudy = textValue(formData, "fieldOfStudy");
  const studyYearValue = textValue(formData, "studyYear");
  const linkedinUrl = textValue(formData, "linkedinUrl");
  const studyYear = studyYearValue ? Number(studyYearValue) : null;

  let validLinkedIn = true;
  if (linkedinUrl) {
    try {
      const url = new URL(linkedinUrl);
      validLinkedIn =
        url.protocol === "https:" &&
        (url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com"));
    } catch {
      validLinkedIn = false;
    }
  }

  if (
    fullName.length < 1 ||
    fullName.length > 160 ||
    phoneNumber.length > 40 ||
    (phoneNumber && !/^[0-9+() .-]+$/.test(phoneNumber)) ||
    fieldOfStudy.length > 160 ||
    (studyYear !== null &&
      (!Number.isInteger(studyYear) || studyYear < 1 || studyYear > 10)) ||
    linkedinUrl.length > 2048 ||
    !validLinkedIn
  ) {
    profileRedirect("error=invalid_profile");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({
      full_name: fullName,
      phone_number: phoneNumber || null,
      field_of_study: fieldOfStudy || null,
      study_year: studyYear,
      linkedin_url: linkedinUrl || null,
    })
    .eq("id", access.profile.personId);

  if (error) profileRedirect("error=profile_update_failed");
  revalidatePath("/", "layout");
  profileRedirect("saved=profile");
}

export async function updateOrganizationHistory(formData: FormData) {
  const access = await requirePortalAccess();
  const membershipId = positiveInteger(formData, "membershipId");
  const startsOn = optionalDate(formData, "startsOn");
  const endsOn = optionalDate(formData, "endsOn");

  if (
    !membershipId ||
    startsOn === null ||
    endsOn === null ||
    !validPeriod(startsOn, endsOn)
  ) {
    profileRedirect("error=invalid_history");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("memberships")
    .update({ starts_on: startsOn || null, ends_on: endsOn || null })
    .eq("id", membershipId)
    .eq("person_id", access.profile.personId);

  if (error) profileRedirect("error=history_update_failed");
  revalidatePath("/", "layout");
  profileRedirect("saved=history");
}

export async function saveTeamHistory(formData: FormData) {
  const access = await requirePortalAccess();
  const teamMembershipId = positiveInteger(formData, "teamMembershipId");
  const teamId = positiveInteger(formData, "teamId");
  const roleTitle = textValue(formData, "roleTitle");
  const startsOn = optionalDate(formData, "startsOn");
  const endsOn = optionalDate(formData, "endsOn");

  if (
    !teamId ||
    roleTitle.length < 1 ||
    roleTitle.length > 160 ||
    startsOn === null ||
    endsOn === null ||
    !validPeriod(startsOn, endsOn)
  ) {
    profileRedirect("error=invalid_team_history");
  }

  const supabase = await createClient();
  const values = {
    role_title: roleTitle,
    starts_on: startsOn || null,
    ends_on: endsOn || null,
  };
  const result = teamMembershipId
    ? await supabase
        .from("team_memberships")
        .update(values)
        .eq("id", teamMembershipId)
        .eq("person_id", access.profile.personId)
    : await supabase.from("team_memberships").insert({
        ...values,
        team_id: teamId,
        person_id: access.profile.personId,
      });

  if (result.error) profileRedirect("error=team_history_update_failed");
  revalidatePath("/", "layout");
  profileRedirect("saved=team_history");
}

export async function removeTeamHistory(formData: FormData) {
  const access = await requirePortalAccess();
  const teamMembershipId = positiveInteger(formData, "teamMembershipId");
  if (!teamMembershipId) profileRedirect("error=invalid_team_history");

  const supabase = await createClient();
  const { error } = await supabase
    .from("team_memberships")
    .delete()
    .eq("id", teamMembershipId)
    .eq("person_id", access.profile.personId);

  if (error) profileRedirect("error=team_history_update_failed");
  revalidatePath("/", "layout");
  profileRedirect("saved=team_history");
}
