"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function optionalText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function submitAccessRequest(formData: FormData) {
  const organizationId = Number(formData.get("organizationId"));
  const firstName = optionalText(formData, "firstName");
  const lastName = optionalText(formData, "lastName");
  const fieldOfStudy = optionalText(formData, "fieldOfStudy");
  const message = optionalText(formData, "message");
  const studyYearValue = optionalText(formData, "studyYear");
  const studyYear = Number(studyYearValue);

  if (
    !Number.isSafeInteger(organizationId) ||
    organizationId <= 0 ||
    firstName.length < 1 ||
    firstName.length > 80 ||
    lastName.length < 1 ||
    lastName.length > 80 ||
    fieldOfStudy.length > 160 ||
    message.length > 2000 ||
    !Number.isInteger(studyYear) ||
    studyYear < 1 ||
    studyYear > 10
  ) {
    redirect("/access?error=invalid_request");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { error } = await supabase.rpc("submit_access_request", {
    target_organization_id: organizationId,
    requested_first_name: firstName,
    requested_last_name: lastName,
    requested_field_of_study: fieldOfStudy,
    requested_study_year: studyYear,
    requested_message: message,
  });

  if (error) {
    if (error.code === "23505") {
      redirect("/access?error=already_pending");
    }

    redirect("/access?error=request_failed");
  }

  redirect("/access?submitted=true");
}
