"use client";

import { useState } from "react";
import { submitAccessRequest } from "@/app/access/actions";
import { STUDY_FIELDS } from "@/lib/profile/study-fields";

type Organization = { id: number; name: string };

const requestTypes = [
  {
    description:
      "You were a member of a NORSTEC organization and want to keep portal access. A portal administrator reviews the request.",
    label: "Alumni",
    value: "alumni",
  },
  {
    description:
      "You are currently a member of a NORSTEC organization. That organization reviews the request.",
    label: "Member of an organization",
    value: "organization",
  },
] as const;

export function AccessRequestForm({
  errorMessage,
  firstName,
  lastName,
  organizations,
  studyYear,
}: {
  errorMessage?: string;
  firstName: string;
  lastName: string;
  organizations: Organization[];
  studyYear: number | null;
}) {
  const [requestType, setRequestType] = useState<"alumni" | "organization">(
    "alumni",
  );
  const isOrganizationRequest = requestType === "organization";

  return (
    <form
      action={submitAccessRequest}
      className="mt-8 grid max-w-4xl gap-6 sm:grid-cols-2"
    >
      {errorMessage && (
        <p className="text-sm text-[#a33b2b] sm:col-span-2" role="alert">
          {errorMessage}
        </p>
      )}

      <fieldset className="grid gap-3 sm:col-span-2">
        <legend className="section-label opacity-45">
          I am requesting access as
        </legend>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          {requestTypes.map((option) => {
            const isSelected = requestType === option.value;
            return (
              <label
                className={`portal-surface cursor-pointer p-5 transition-all ${
                  isSelected
                    ? "bg-moody/[0.06]"
                    : "border-moody/20 opacity-55 hover:opacity-90 hover:border-moody/40"
                }`}
                key={option.value}
              >
                <span className="flex items-center gap-3">
                  <input
                    checked={isSelected}
                    className="size-4 accent-moody"
                    name="requestType"
                    onChange={() => setRequestType(option.value)}
                    type="radio"
                    value={option.value}
                  />
                  <span
                    className={isSelected ? "font-semibold" : "font-medium"}
                  >
                    {option.label}
                  </span>
                </span>
                <span className="mt-2 block text-sm leading-relaxed opacity-60">
                  {option.description}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="grid gap-2">
        <span className="section-label opacity-45">
          First name{" "}
          <span aria-hidden="true" className="text-copper">
            *
          </span>
        </span>
        <input
          autoComplete="given-name"
          className="portal-field"
          defaultValue={firstName}
          maxLength={80}
          name="firstName"
          required
        />
      </label>
      <label className="grid gap-2">
        <span className="section-label opacity-45">
          Last name{" "}
          <span aria-hidden="true" className="text-copper">
            *
          </span>
        </span>
        <input
          autoComplete="family-name"
          className="portal-field"
          defaultValue={lastName}
          maxLength={80}
          name="lastName"
          required
        />
      </label>

      {isOrganizationRequest && (
        <>
          <div className="flex items-start gap-3 text-sm leading-relaxed opacity-65 sm:col-span-2">
            <span
              aria-hidden="true"
              className="material-symbols-outlined mt-0.5 shrink-0 text-base"
            >
              info
            </span>
            <p>
              If your organization gave you an organization email address,
              sign in with that Google account instead — it grants access
              right away, with no approval needed.
            </p>
          </div>
          <label className="grid gap-2 sm:col-span-2">
            <span className="section-label opacity-45">
              Organization{" "}
              <span aria-hidden="true" className="text-copper">
                *
              </span>
            </span>
            <select
              className="portal-field"
              defaultValue=""
              name="organizationId"
              required
            >
              <option disabled value="">
                Select organization
              </option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <label className="grid gap-2">
        <span className="section-label opacity-45">Field of study</span>
        <select className="portal-field" defaultValue="" name="fieldOfStudy">
          <option value="">Not provided</option>
          {STUDY_FIELDS.map((field) => (
            <option key={field} value={field}>
              {field}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2">
        <span className="section-label opacity-45">
          Study year{" "}
          {isOrganizationRequest && (
            <span aria-hidden="true" className="text-copper">
              *
            </span>
          )}
        </span>
        <select
          className="portal-field"
          defaultValue={studyYear ?? ""}
          name="studyYear"
          required={isOrganizationRequest}
        >
          <option value="">
            {isOrganizationRequest ? "Select year" : "Not provided"}
          </option>
          {[1, 2, 3, 4, 5, 6].map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 sm:col-span-2">
        <span className="section-label opacity-45">Message</span>
        <textarea
          className="portal-field min-h-32 resize-y"
          maxLength={2000}
          name="message"
        />
      </label>
      <div className="sm:col-span-2">
        <button className="portal-button" type="submit">
          Send request
          <span className="material-symbols-outlined">arrow_right_alt</span>
        </button>
      </div>
    </form>
  );
}
