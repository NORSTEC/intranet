"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePortalAccess } from "@/lib/auth/access";
import { isStudyField } from "@/lib/profile/study-fields";
import { createClient } from "@/lib/supabase/server";

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function optionalDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : value ? null : "";
}

function validPeriod(startsOn: string, endsOn: string) {
  return !startsOn || !endsOn || endsOn >= startsOn;
}

type ExperienceRoleInput = {
  experienceId?: number;
  teamName: string;
  roleTitle: string;
  startsOn: string;
  endsOn: string;
  sortOrder?: number;
};

type NewProfileExperienceInput = {
  organizationId: number | null;
  organizationName: string;
  description: string;
  startsOn: string;
  endsOn: string;
  roles: ExperienceRoleInput[];
};

function parseExperienceRoles(
  values: FormDataEntryValue[],
  includeExperienceId: boolean,
) {
  const roles: ExperienceRoleInput[] = [];

  for (const value of values) {
    if (typeof value !== "string" || !value) continue;
    let entries: unknown;
    try {
      entries = JSON.parse(value);
    } catch {
      return null;
    }
    if (!Array.isArray(entries)) return null;

    for (const entry of entries) {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const teamName = typeof item.teamName === "string" ? item.teamName.trim() : "";
      const roleTitle = typeof item.roleTitle === "string" ? item.roleTitle.trim() : "";
      const startsOn = optionalDate(typeof item.startsOn === "string" ? item.startsOn : "");
      const endsOn = optionalDate(typeof item.endsOn === "string" ? item.endsOn : "");
      const experienceId = includeExperienceId ? Number(item.experienceId) : undefined;
      const sortOrder = Number(item.sortOrder ?? 0);

      if (
        (includeExperienceId && (!Number.isSafeInteger(experienceId) || experienceId! < 1)) ||
        !teamName ||
        teamName.length > 160 ||
        roleTitle.length > 160 ||
        startsOn === null ||
        endsOn === null ||
        !validPeriod(startsOn, endsOn) ||
        !Number.isSafeInteger(sortOrder) ||
        sortOrder < 0
      ) return null;

      roles.push({
        experienceId,
        teamName,
        roleTitle,
        startsOn,
        endsOn,
        sortOrder,
      });
    }
  }

  return roles;
}

function parseDeletedRows(values: FormDataEntryValue[]) {
  const rows: Array<{ id: number; expectedUpdatedAt: string }> = [];
  for (const value of values) {
    if (typeof value !== "string" || !value) continue;
    let entries: unknown;
    try {
      entries = JSON.parse(value);
    } catch {
      return null;
    }
    if (!Array.isArray(entries)) return null;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const id = Number(item.id);
      const expectedUpdatedAt = typeof item.expectedUpdatedAt === "string"
        ? item.expectedUpdatedAt
        : "";
      if (!Number.isSafeInteger(id) || id < 1 || !expectedUpdatedAt) return null;
      rows.push({ id, expectedUpdatedAt });
    }
  }
  return rows;
}

function parseNewProfileExperiences(values: FormDataEntryValue[]) {
  const experiences: NewProfileExperienceInput[] = [];
  for (const value of values) {
    if (typeof value !== "string" || !value) continue;
    let entries: unknown;
    try {
      entries = JSON.parse(value);
    } catch {
      return null;
    }
    if (!Array.isArray(entries)) return null;

    for (const entry of entries) {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const organizationName = typeof item.organizationName === "string"
        ? item.organizationName.trim()
        : "";
      const organizationIdValue = item.organizationId;
      const organizationId = organizationIdValue === null
        ? null
        : Number(organizationIdValue);
      const description = typeof item.description === "string"
        ? item.description.trim()
        : "";
      const startsOn = optionalDate(typeof item.startsOn === "string" ? item.startsOn : "");
      const endsOn = optionalDate(typeof item.endsOn === "string" ? item.endsOn : "");
      const roles = parseExperienceRoles(
        [JSON.stringify(Array.isArray(item.roles) ? item.roles : [])],
        false,
      );

      if (
        organizationName.length < 1 ||
        organizationName.length > 160 ||
        (organizationId !== null &&
          (!Number.isSafeInteger(organizationId) || organizationId < 1)) ||
        description.length > 2000 ||
        startsOn === null ||
        endsOn === null ||
        !validPeriod(startsOn, endsOn) ||
        !roles
      ) return null;

      experiences.push({
        organizationId,
        organizationName,
        description,
        startsOn,
        endsOn,
        roles,
      });
    }
  }
  return experiences;
}

function editRedirect(value: string): never {
  redirect(`/profile/edit?${value}`);
}

async function hasValidImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length));

  if (file.type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (file.type === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (file.type === "image/webp") {
    return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
  }
  if (file.type === "image/avif") {
    return ascii(4, 4) === "ftyp";
  }
  return false;
}

export async function saveProfile(formData: FormData) {
  const access = await requirePortalAccess();
  const fullName = textValue(formData, "fullName");
  const phoneNumber = textValue(formData, "phoneNumber");
  const fieldOfStudy = textValue(formData, "fieldOfStudy");
  const studyYearValue = textValue(formData, "studyYear");
  const linkedinUrl = textValue(formData, "linkedinUrl");
  const expectedProfileUpdatedAt = textValue(
    formData,
    "expectedProfileUpdatedAt",
  );
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
    !expectedProfileUpdatedAt ||
    fullName.length < 1 ||
    fullName.length > 160 ||
    phoneNumber.length > 40 ||
    (phoneNumber && !/^[0-9+() .-]+$/.test(phoneNumber)) ||
    (fieldOfStudy &&
      !isStudyField(fieldOfStudy) &&
      fieldOfStudy !== access.profile.fieldOfStudy) ||
    (studyYear !== null &&
      (!Number.isInteger(studyYear) || studyYear < 1 || studyYear > 6)) ||
    linkedinUrl.length > 2048 ||
    !validLinkedIn
  ) {
    editRedirect("error=invalid_profile");
  }

  const experiences = formData.getAll("experienceId").map((value) => {
    const id = positiveInteger(value);
    const organizationId = positiveInteger(
      formData.get(`experience-${id}-organizationId`),
    );
    const organizationName = textValue(
      formData,
      `experience-${id}-organizationName`,
    );
    const description = textValue(formData, `experience-${id}-description`);
    const startsOn = optionalDate(textValue(formData, `experience-${id}-startsOn`));
    const endsOn = optionalDate(textValue(formData, `experience-${id}-endsOn`));
    const expectedUpdatedAt = textValue(
      formData,
      `experience-${id}-expectedUpdatedAt`,
    );

    if (
      !id ||
      organizationName.length < 1 ||
      organizationName.length > 160 ||
      description.length > 2000 ||
      startsOn === null ||
      endsOn === null ||
      !validPeriod(startsOn, endsOn) ||
      !expectedUpdatedAt
    ) {
      editRedirect("error=invalid_history");
    }

    return {
      description,
      endsOn,
      expectedUpdatedAt,
      id,
      organizationId,
      organizationName,
      startsOn,
    };
  });

  const roles = formData.getAll("experienceRoleId").map((value) => {
    const id = positiveInteger(value);
    const startsOn = optionalDate(textValue(formData, `role-${id}-startsOn`));
    const endsOn = optionalDate(textValue(formData, `role-${id}-endsOn`));
    const teamName = textValue(formData, `role-${id}-teamName`);
    const roleTitle = textValue(formData, `role-${id}-roleTitle`);
    const expectedUpdatedAt = textValue(
      formData,
      `role-${id}-expectedUpdatedAt`,
    );

    if (
      !id ||
      startsOn === null ||
      endsOn === null ||
      !validPeriod(startsOn, endsOn) ||
      teamName.length > 160 ||
      roleTitle.length > 160 ||
      !teamName ||
      !expectedUpdatedAt
    ) {
      editRedirect("error=invalid_team_history");
    }

    return {
      id,
      startsOn,
      endsOn,
      roleTitle,
      expectedUpdatedAt,
      teamName,
    };
  });
  const newRoles = parseExperienceRoles(
    formData.getAll("newExistingExperienceRoles"),
    true,
  );
  if (!newRoles) editRedirect("error=invalid_team_history");
  const deletedRoles = parseDeletedRows(formData.getAll("deletedExperienceRoles"));
  if (!deletedRoles) editRedirect("error=invalid_team_history");
  const deletedExperiences = parseDeletedRows(formData.getAll("deletedExperiences"));
  if (!deletedExperiences) editRedirect("error=invalid_history");
  const newExperiences = parseNewProfileExperiences(
    formData.getAll("newProfileExperiences"),
  );
  if (!newExperiences) editRedirect("error=invalid_experience");
  const deletedExperienceIds = new Set(
    deletedExperiences.map((experience) => experience.id),
  );
  const retainedExperiences = experiences.filter(
    (experience) => !deletedExperienceIds.has(experience.id),
  );

  const avatar = formData.get("avatar");
  const hasNewAvatar = avatar instanceof File && avatar.size > 0;
  const validMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
  ]);
  if (
    hasNewAvatar &&
    (avatar.size > 5 * 1024 * 1024 ||
      !validMimeTypes.has(avatar.type) ||
      !(await hasValidImageSignature(avatar)))
  ) {
    editRedirect("error=invalid_avatar");
  }

  const supabase = await createClient();
  let uploadedAvatarPath: string | null = null;
  if (hasNewAvatar) {
    uploadedAvatarPath = `profiles/${access.profile.personId}/${randomUUID()}`;
    const { error } = await supabase.storage
      .from("member-avatars")
      .upload(uploadedAvatarPath, avatar, {
        cacheControl: "3600",
        contentType: avatar.type,
        upsert: false,
      });

    if (error) editRedirect("error=avatar_upload_failed");
  }

  const avatarPath = uploadedAvatarPath ?? access.profile.avatarPath;
  const avatarAlt = avatarPath
    ? `${fullName} profile image`
    : access.profile.avatarAlt;
  const { error } = await supabase.rpc("save_own_profile_v6", {
    p_avatar_alt: avatarAlt,
    p_avatar_path: avatarPath,
    p_expected_profile_updated_at: expectedProfileUpdatedAt,
    p_deleted_experiences: deletedExperiences,
    p_deleted_roles: deletedRoles,
    p_field_of_study: fieldOfStudy || null,
    p_linkedin_url: linkedinUrl || null,
    p_new_roles: newRoles,
    p_new_experiences: newExperiences,
    p_experiences: retainedExperiences,
    p_phone_number: phoneNumber || null,
    p_roles: roles,
    p_study_year: studyYear,
  });

  if (error) {
    if (uploadedAvatarPath) {
      await supabase.storage.from("member-avatars").remove([uploadedAvatarPath]);
    }
    if (error.message.includes("profile_conflict")) {
      editRedirect("error=profile_conflict");
    }
    editRedirect("error=profile_update_failed");
  }

  if (
    uploadedAvatarPath &&
    access.profile.avatarPath &&
    access.profile.avatarPath.startsWith(
      `profiles/${access.profile.personId}/`,
    )
  ) {
    await supabase.storage
      .from("member-avatars")
      .remove([access.profile.avatarPath]);
  }

  revalidatePath("/", "layout");
  redirect("/profile?saved=true");
}
