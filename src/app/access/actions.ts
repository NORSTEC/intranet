"use server";

import { redirect } from "next/navigation";
import { NORSTEC_ORGANIZATION_SLUG } from "@/lib/portal/norstec";
import { isStudyField } from "@/lib/profile/study-fields";
import { verifyAccessRequestCaptcha } from "@/lib/security/recaptcha";
import { createClient } from "@/lib/supabase/server";

function optionalText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function withdrawAccessRequest(formData: FormData) {
  const requestId = Number(optionalText(formData, "requestId"));

  if (!Number.isSafeInteger(requestId) || requestId <= 0) {
    redirect("/access?error=withdraw_failed");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { error } = await supabase.rpc("cancel_own_access_request", {
    p_request_id: requestId,
  });

  if (error) {
    redirect("/access?error=withdraw_failed");
  }

  redirect("/access?withdrawn=true");
}

export async function submitAccessRequest(formData: FormData) {
  const requestTypeValue = optionalText(formData, "requestType");
  const requestType =
    requestTypeValue === "organization" ? "organization" : "alumni";
  const isOrganizationRequest = requestType === "organization";
  const organizationIdValue = optionalText(formData, "organizationId");
  const organizationId = isOrganizationRequest
    ? Number(organizationIdValue)
    : null;
  const firstName = optionalText(formData, "firstName");
  const lastName = optionalText(formData, "lastName");
  const fieldOfStudy = optionalText(formData, "fieldOfStudy");
  const message = optionalText(formData, "message");
  const recaptchaToken = optionalText(formData, "recaptchaToken");
  const studyYearValue = optionalText(formData, "studyYear");
  // Alumni are no longer studying, so a study year is optional for them.
  const studyYear = studyYearValue ? Number(studyYearValue) : null;

  if (
    requestTypeValue !== "organization" &&
    requestTypeValue !== "alumni"
  ) {
    redirect("/access?error=invalid_request");
  }

  if (
    (organizationId !== null &&
      (!Number.isSafeInteger(organizationId) || organizationId <= 0)) ||
    firstName.length < 1 ||
    firstName.length > 80 ||
    lastName.length < 1 ||
    lastName.length > 80 ||
    (fieldOfStudy && !isStudyField(fieldOfStudy)) ||
    message.length > 2000 ||
    (studyYear !== null &&
      (!Number.isInteger(studyYear) || studyYear < 1 || studyYear > 6)) ||
    (isOrganizationRequest && studyYear === null)
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

  const captcha = await verifyAccessRequestCaptcha(recaptchaToken);

  if (!captcha.ok) {
    redirect(`/access?error=captcha_${captcha.reason}`);
  }

  // The form never offers NORSTEC, so a request naming it was hand-made. It is
  // refused here rather than filed for an administrator who will never look.
  if (organizationId !== null) {
    const { data: organization } = await supabase
      .from("organizations")
      .select("slug")
      .eq("id", organizationId)
      .maybeSingle();

    if (!organization || organization.slug === NORSTEC_ORGANIZATION_SLUG) {
      redirect("/access?error=invalid_request");
    }
  }

  const { error } = await supabase.rpc("submit_access_request", {
    target_organization_id: organizationId,
    requested_first_name: firstName,
    requested_last_name: lastName,
    requested_field_of_study: fieldOfStudy,
    requested_study_year: studyYear,
    requested_message: message,
    requested_request_type: requestType,
  });

  if (error) {
    if (error.code === "23505") {
      redirect("/access?error=already_pending");
    }

    redirect("/access?error=request_failed");
  }

  redirect("/access");
}
