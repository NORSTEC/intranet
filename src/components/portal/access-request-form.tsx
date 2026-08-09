"use client";

import Script from "next/script";
import { type FormEvent, useRef, useState } from "react";
import { submitAccessRequest } from "@/app/access/actions";
import { STUDY_FIELDS } from "@/lib/profile/study-fields";
import { RECAPTCHA_ACTION } from "@/lib/security/recaptcha-constants";

declare global {
  interface Window {
    grecaptcha?: {
      execute: (
        siteKey: string,
        options: { action: string },
      ) => Promise<string>;
      ready: (callback: () => void) => void;
    };
  }
}

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
  isReturningMember,
  lastName,
  organizations,
  provenOrganization,
  recaptchaSiteKey,
  scriptNonce,
  studyYear,
}: {
  errorMessage?: string;
  firstName: string;
  isReturningMember?: boolean;
  lastName: string;
  organizations: Organization[];
  provenOrganization?: Organization | null;
  recaptchaSiteKey: string;
  scriptNonce?: string;
  studyYear: number | null;
}) {
  // Arriving with an organization account already answers the first question
  // the form asks, and for somebody who was a member before, an empty form
  // reads as the portal having forgotten them.
  const [requestType, setRequestType] = useState<"alumni" | "organization">(
    provenOrganization ? "organization" : "alumni",
  );
  const isOrganizationRequest = requestType === "organization";
  const formRef = useRef<HTMLFormElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!recaptchaSiteKey || tokenRef.current?.value) return;

    event.preventDefault();
    setCaptchaError(null);
    setIsChecking(true);

    try {
      const grecaptcha = window.grecaptcha;

      if (!grecaptcha) throw new Error("reCAPTCHA has not loaded");

      const token = await new Promise<string>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("reCAPTCHA timed out")),
          8_000,
        );

        grecaptcha.ready(() => {
          grecaptcha
            .execute(recaptchaSiteKey, { action: RECAPTCHA_ACTION })
            .then((value) => {
              window.clearTimeout(timeout);
              resolve(value);
            })
            .catch((error: unknown) => {
              window.clearTimeout(timeout);
              reject(error);
            });
        });
      });

      if (!tokenRef.current || !formRef.current) {
        throw new Error("Form is unavailable");
      }

      tokenRef.current.value = token;
      formRef.current.requestSubmit();
    } catch {
      setCaptchaError(
        "The security check could not run. Check your connection or content blocker, then try again.",
      );
      setIsChecking(false);
    }
  }

  return (
    <form
      action={submitAccessRequest}
      className="mt-8 grid max-w-4xl gap-6 sm:grid-cols-2"
      onSubmit={handleSubmit}
      ref={formRef}
    >
      {recaptchaSiteKey && (
        <Script
          nonce={scriptNonce}
          onError={() =>
            setCaptchaError(
              "The security check could not load. Check your connection or content blocker, then try again.",
            )
          }
          src={`https://www.recaptcha.net/recaptcha/api.js?render=${encodeURIComponent(recaptchaSiteKey)}&hl=en`}
          strategy="afterInteractive"
        />
      )}
      <input name="recaptchaToken" ref={tokenRef} type="hidden" />
      {errorMessage && (
        <p className="text-sm text-[#a33b2b] sm:col-span-2" role="alert">
          {errorMessage}
        </p>
      )}

      {provenOrganization && (
        <section className="portal-surface border-copper p-5 sm:col-span-2 sm:p-6">
          <h2 className="text-h3">
            {isReturningMember
              ? `You were a member of ${provenOrganization.name}`
              : `${provenOrganization.name} reviews who joins`}
          </h2>
          <p className="mt-3 max-w-[65ch] text-sm leading-relaxed opacity-65">
            {isReturningMember
              ? `That membership has ended, so an administrator has to approve you again before you get back in. ${provenOrganization.name} is selected below.`
              : `Signing in with one of its Google accounts is not enough on its own there. ${provenOrganization.name} is selected below — send the request and an administrator decides.`}
          </p>
        </section>
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
                className={`portal-surface portal-choice p-5 ${
                  isSelected ? "portal-choice-selected" : ""
                }`}
                key={option.value}
              >
                <span className="flex items-center gap-3">
                  <input
                    checked={isSelected}
                    className="size-4"
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
          {!provenOrganization && (
            <div className="flex items-start gap-3 text-sm leading-relaxed opacity-65 sm:col-span-2">
              <span
                aria-hidden="true"
                className="material-symbols-outlined mt-0.5 shrink-0 text-base"
              >
                info
              </span>
              <p>
                If your organization gave you an organization email address,
                sign in with that Google account instead. Some organizations let
                you straight in that way; the rest still review the request, but
                they know the account is theirs.
              </p>
            </div>
          )}
          <label className="grid gap-2 sm:col-span-2">
            <span className="section-label opacity-45">
              Organization{" "}
              <span aria-hidden="true" className="text-copper">
                *
              </span>
            </span>
            <select
              className="portal-field"
              defaultValue={provenOrganization?.id ?? ""}
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
      {/* Sending the request widens the processing in two ways the sign-in
          notice does not cover: it hands the form to administrators of an
          organization the applicant is not yet in, and a decline deletes the
          profile outright. Article 13(1)(e) and (2)(a) want both said before
          the click, which is what this is — a notice, not a consent gate. */}
      <div className="border-t border-moody/20 pt-6 text-sm leading-relaxed opacity-65 sm:col-span-2">
        <p>
          Sending this shows your name, email address, field of study, study
          year and message to{" "}
          {isOrganizationRequest
            ? "the administrators of the organization you selected"
            : "NORSTEC portal administrators"}
          , so that one of them can decide. If the request is declined, your
          portal profile is deleted along with it — the name, the addresses and
          the Google sign-in — and only a record that a decision was made
          remains.{" "}
          <a
            className="legal-link"
            href="/privacy"
            rel="noreferrer"
            target="_blank"
          >
            Privacy policy
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          .
        </p>
      </div>

      <div className="grid justify-items-start gap-3 sm:col-span-2">
        {captchaError && (
          <p className="max-w-[65ch] text-sm text-[#a33b2b]" role="alert">
            {captchaError}
          </p>
        )}
        <button
          className="portal-button"
          disabled={isChecking}
          type="submit"
        >
          {isChecking ? "Checking…" : "Send request"}
          <span
            aria-hidden="true"
            className={`material-symbols-outlined${isChecking ? " animate-spin" : ""}`}
          >
            {isChecking ? "progress_activity" : "arrow_right_alt"}
          </span>
        </button>
        {recaptchaSiteKey && (
          <p className="max-w-[65ch] text-sm leading-relaxed opacity-65">
            This site is protected by reCAPTCHA and the Google{" "}
            <a
              className="legal-link"
              href="https://policies.google.com/privacy"
              rel="noreferrer"
              target="_blank"
            >
              Privacy Policy
              <span className="sr-only"> (opens in a new tab)</span>
            </a>{" "}
            and{" "}
            <a
              className="legal-link"
              href="https://policies.google.com/terms"
              rel="noreferrer"
              target="_blank"
            >
              Terms of Service
              <span className="sr-only"> (opens in a new tab)</span>
            </a>{" "}
            apply.
          </p>
        )}
      </div>
    </form>
  );
}
