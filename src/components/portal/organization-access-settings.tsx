"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  completeOrganizationDomainVerification,
  previewOrganizationDomain,
  removeOrganizationDomain,
  setOrganizationJoinPolicy,
  startOrganizationDomainVerification,
  type PortalManagementResult,
} from "@/app/(portal)/admin/actions";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { Toast } from "@/components/portal/toast";

export type OrganizationAccess = {
  domains: Array<{
    domain: string;
    verifiedAt: string | null;
    verificationMethod: "legacy_admin_attestation" | "dns_txt";
  }>;
  id: number;
  joinPolicy: "auto" | "request";
  name: string;
};

const joinPolicies = [
  {
    description:
      "Signing in with an account on a DNS-verified domain makes the person an active member straight away.",
    label: "Join automatically",
    value: "auto",
  },
  {
    description:
      "The person is sent to Request access with this organization already filled in, and an administrator approves or declines it in Access review.",
    label: "Approve each person",
    value: "request",
  },
] as const;

type Preview = {
  addressCount: number;
  domain: string;
  wouldJoinCount: number;
};

type DomainVerification = {
  domain: string;
  organizationId: number;
  recordName: string;
  recordValue: string;
  token: string;
};

function verificationStatusLabel(
  domain: OrganizationAccess["domains"][number],
) {
  if (!domain.verifiedAt) return "Not verified";
  return domain.verificationMethod === "dns_txt"
    ? "DNS verified"
    : "Verified by administrator (legacy)";
}

export function OrganizationAccessSettings({
  organizations,
}: {
  organizations: OrganizationAccess[];
}) {
  const router = useRouter();
  const [domainDrafts, setDomainDrafts] = useState<Record<number, string>>({});
  const [previews, setPreviews] = useState<Record<number, Preview | null>>({});
  const [verification, setVerification] =
    useState<DomainVerification | null>(null);
  const verificationPanelRef = useRef<HTMLDivElement>(null);
  const [copiedField, setCopiedField] = useState<
    "recordName" | "recordValue" | null
  >(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{
    domain: string;
    organizationName: string;
  } | null>(null);
  // Switching to automatic joining is the one control here that decides who
  // gets in without anybody looking, so it asks before it applies rather than
  // acting on the click that selected it.
  const [pendingPolicy, setPendingPolicy] = useState<{
    domainCount: number;
    organizationId: number;
    organizationName: string;
    policy: (typeof joinPolicies)[number];
  } | null>(null);
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    status: "success" | "error";
  } | null>(null);
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    if (!verification) return;
    const frame = window.requestAnimationFrame(() => {
      const panel = verificationPanelRef.current;
      if (!panel) return;
      panel.focus({ preventScroll: true });
      panel.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "nearest",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [verification]);

  function run(action: () => Promise<PortalManagementResult>) {
    startTransition(async () => {
      const result = await action();
      setToast({
        id: Date.now(),
        message: result.message,
        status: result.ok ? "success" : "error",
      });
      if (result.ok) router.refresh();
    });
  }

  // Registering a domain turns every address on it into an organization
  // address, and under an automatic policy into a membership. The number is
  // what separates a domain that is exactly right from one that is a typo, so
  // it is shown before anything is written.
  function checkDomain(organizationId: number) {
    const domain = (domainDrafts[organizationId] ?? "").trim().toLowerCase();
    if (!domain) return;

    startTransition(async () => {
      const result = await previewOrganizationDomain({
        domain,
        organizationId,
      });

      if (!result.ok) {
        setToast({ id: Date.now(), message: result.message, status: "error" });
        return;
      }

      if (result.reservedReason) {
        setPreviews((current) => ({ ...current, [organizationId]: null }));
        setToast({
          id: Date.now(),
          message:
            result.reservedReason === "shared_institution"
              ? `${domain} belongs to a whole institution, so it cannot say which organization somebody is in.`
              : `${domain} is a mailbox provider, so it says nothing about who anybody belongs to.`,
          status: "error",
        });
        return;
      }

      setPreviews((current) => ({
        ...current,
        [organizationId]: {
          addressCount: result.addressCount ?? 0,
          domain,
          wouldJoinCount: result.wouldJoinCount ?? 0,
        },
      }));
    });
  }

  function beginVerification(organizationId: number, domain: string) {
    const action = `start-verification:${organizationId}:${domain}`;
    setPendingAction(action);
    startTransition(async () => {
      try {
        const result = await startOrganizationDomainVerification({
          domain,
          organizationId,
        });

        if (
          !result.ok ||
          !result.domain ||
          !result.recordName ||
          !result.recordValue ||
          !result.token
        ) {
          setToast({
            id: Date.now(),
            message: result.message,
            status: "error",
          });
          return;
        }

        setCopiedField(null);
        setVerification({
          domain: result.domain,
          organizationId,
          recordName: result.recordName,
          recordValue: result.recordValue,
          token: result.token,
        });
        setToast({ id: Date.now(), message: result.message, status: "success" });
      } finally {
        setPendingAction(null);
      }
    });
  }

  function checkVerification() {
    if (!verification) return;
    setPendingAction("check-verification");
    startTransition(async () => {
      try {
        const result = await completeOrganizationDomainVerification({
          domain: verification.domain,
          organizationId: verification.organizationId,
          token: verification.token,
        });
        setToast({
          id: Date.now(),
          message: result.message,
          status: result.ok ? "success" : "error",
        });
        if (!result.ok) return;

        setDomainDrafts((current) => ({
          ...current,
          [verification.organizationId]: "",
        }));
        setPreviews((current) => ({
          ...current,
          [verification.organizationId]: null,
        }));
        setVerification(null);
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  }

  async function copyDnsValue(
    field: "recordName" | "recordValue",
    value: string,
  ) {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
    } catch {
      setToast((current) => ({
        id: (current?.id ?? 0) + 1,
        message: "The DNS value could not be copied. Select and copy it manually.",
        status: "error",
      }));
    }
  }

  return (
    <>
      {toast && (
        <Toast key={toast.id} message={toast.message} status={toast.status} />
      )}

      <div className="grid gap-5">
        {organizations.map((organization) => {
          const preview = previews[organization.id] ?? null;

          return (
            <section
              aria-labelledby={`organization-${organization.id}-heading`}
              className="portal-surface p-6 sm:p-7"
              key={organization.id}
            >
              <h2
                className="text-h3"
                id={`organization-${organization.id}-heading`}
              >
                {organization.name}
              </h2>

              <fieldset className="mt-6 grid gap-3">
                <legend className="section-label opacity-45">
                  Accounts on its own domains
                </legend>
                <div className="mt-1 grid gap-3 sm:grid-cols-2">
                  {joinPolicies.map((policy) => {
                    const isSelected = organization.joinPolicy === policy.value;
                    return (
                      <label
                        className={`portal-surface portal-choice p-4 ${
                          isSelected ? "portal-choice-selected" : ""
                        }`}
                        key={policy.value}
                      >
                        <span className="flex items-center gap-3">
                          <input
                            checked={isSelected}
                            className="size-4"
                            disabled={busy}
                            name={`join-policy-${organization.id}`}
                            onChange={() => {
                              if (policy.value === "auto") {
                                setPendingPolicy({
                                  domainCount: organization.domains.filter(
                                    (domain) => domain.verifiedAt,
                                  ).length,
                                  organizationId: organization.id,
                                  organizationName: organization.name,
                                  policy,
                                });
                                return;
                              }
                              run(() =>
                                setOrganizationJoinPolicy({
                                  organizationId: organization.id,
                                  policy: policy.value,
                                }),
                              );
                            }}
                            type="radio"
                            value={policy.value}
                          />
                          <span
                            className={
                              isSelected ? "font-semibold" : "font-medium"
                            }
                          >
                            {policy.label}
                          </span>
                        </span>
                        <span className="mt-2 block text-sm leading-relaxed opacity-60">
                          {policy.description}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="mt-8">
                <h3 className="section-label opacity-45">Domains</h3>
                <ul className="mt-3 grid gap-2">
                  {organization.domains.map((domain) => (
                    <li
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-moody/10 py-3 last:border-b-0"
                      key={domain.domain}
                    >
                      <span className="break-all font-medium">
                        {domain.domain}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-sm opacity-60">
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined text-[1.05rem]"
                        >
                          {domain.verifiedAt ? "verified" : "warning"}
                        </span>
                        {verificationStatusLabel(domain)}
                      </span>
                      {!domain.verifiedAt && (
                        <button
                          className="portal-button ml-auto"
                          disabled={busy}
                          onClick={() =>
                            beginVerification(organization.id, domain.domain)
                          }
                          type="button"
                        >
                          <span
                            aria-hidden="true"
                            className="material-symbols-outlined text-[1.1rem]"
                          >
                            {pendingAction ===
                            `start-verification:${organization.id}:${domain.domain}`
                              ? "progress_activity"
                              : "domain_verification"}
                          </span>
                          {pendingAction ===
                          `start-verification:${organization.id}:${domain.domain}`
                            ? "Preparing…"
                            : "Verify ownership"}
                        </button>
                      )}
                      <button
                        className={`portal-button ${
                          domain.verifiedAt ? "ml-auto" : ""
                        }`}
                        disabled={busy}
                        onClick={() =>
                          setPendingRemoval({
                            domain: domain.domain,
                            organizationName: organization.name,
                          })
                        }
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined text-[1.1rem]"
                        >
                          close
                        </span>
                        Remove
                      </button>
                    </li>
                  ))}
                  {organization.domains.length === 0 && (
                    <li className="text-sm opacity-60">
                      No domain answers for {organization.name}, so no Google
                      account can prove it belongs here.
                    </li>
                  )}
                </ul>

                {verification?.organizationId === organization.id && (
                  <div
                    className="mt-6 border-t border-moody/20 pt-6 outline-none"
                    ref={verificationPanelRef}
                    tabIndex={-1}
                  >
                    <h3 className="text-xl font-medium">
                      Verify {verification.domain}
                    </h3>
                    <p className="mt-3 max-w-[65ch] text-sm leading-relaxed opacity-65">
                      Add this TXT record in the domain&rsquo;s DNS. Nothing joins
                      the organization until the exact value is visible publicly.
                    </p>
                    <dl className="mt-5 grid gap-4">
                      <div>
                        <dt className="section-label opacity-45">TXT name</dt>
                        <dd className="mt-2 flex items-start gap-2 bg-moody/5 p-3">
                          <code className="min-w-0 flex-1 break-all font-mono text-sm">
                            {verification.recordName}
                          </code>
                          <button
                            aria-label="Copy TXT name"
                            className="portal-button shrink-0"
                            onClick={() =>
                              void copyDnsValue(
                                "recordName",
                                verification.recordName,
                              )
                            }
                            type="button"
                          >
                            <span
                              aria-hidden="true"
                              className="material-symbols-outlined text-[1.1rem]"
                            >
                              {copiedField === "recordName" ? "check" : "content_copy"}
                            </span>
                            {copiedField === "recordName" ? "Copied" : "Copy"}
                          </button>
                        </dd>
                      </div>
                      <div>
                        <dt className="section-label opacity-45">TXT value</dt>
                        <dd className="mt-2 flex items-start gap-2 bg-moody/5 p-3">
                          <code className="min-w-0 flex-1 break-all font-mono text-sm">
                            {verification.recordValue}
                          </code>
                          <button
                            aria-label="Copy TXT value"
                            className="portal-button shrink-0"
                            onClick={() =>
                              void copyDnsValue(
                                "recordValue",
                                verification.recordValue,
                              )
                            }
                            type="button"
                          >
                            <span
                              aria-hidden="true"
                              className="material-symbols-outlined text-[1.1rem]"
                            >
                              {copiedField === "recordValue" ? "check" : "content_copy"}
                            </span>
                            {copiedField === "recordValue" ? "Copied" : "Copy"}
                          </button>
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        className="portal-button"
                        disabled={busy}
                        onClick={checkVerification}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined text-[1.1rem]"
                        >
                          {pendingAction === "check-verification"
                            ? "progress_activity"
                            : "dns"}
                        </span>
                        {pendingAction === "check-verification"
                          ? "Checking DNS…"
                          : "Check DNS and verify"}
                      </button>
                      <button
                        className="portal-button"
                        disabled={busy}
                        onClick={() => setVerification(null)}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined text-[1.1rem]"
                        >
                          close
                        </span>
                        Close instructions
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-5 flex flex-wrap items-end gap-3">
                  <label className="grid min-w-56 flex-1 gap-2">
                    <span className="section-label opacity-45">Add domain</span>
                    <input
                      autoComplete="off"
                      className="portal-field"
                      disabled={busy}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDomainDrafts((current) => ({
                          ...current,
                          [organization.id]: value,
                        }));
                        setPreviews((current) => ({
                          ...current,
                          [organization.id]: null,
                        }));
                      }}
                      placeholder="example.no"
                      spellCheck={false}
                      value={domainDrafts[organization.id] ?? ""}
                    />
                  </label>
                  <button
                    className="portal-button"
                    disabled={busy || !(domainDrafts[organization.id] ?? "").trim()}
                    onClick={() => checkDomain(organization.id)}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined text-[1.1rem]"
                    >
                      search
                    </span>
                    Check domain
                  </button>
                </div>

                {preview && (
                  <div className="mt-5 border-t border-moody/20 pt-5">
                    <p className="max-w-[65ch] leading-relaxed">
                      <span className="font-medium">{preview.domain}</span>{" "}
                      matches{" "}
                      {preview.addressCount === 1
                        ? "one address"
                        : `${preview.addressCount} addresses`}{" "}
                      the intranet already holds.{" "}
                      {organization.joinPolicy === "auto"
                        ? `At most ${
                            preview.wouldJoinCount === 1
                              ? "one of them"
                              : `${preview.wouldJoinCount} of them`
                          } would join ${
                            organization.name
                          } as they sign in — only the ones whose Google account belongs to the Workspace itself.`
                        : `At most ${
                            preview.wouldJoinCount === 1
                              ? "one of them"
                              : `${preview.wouldJoinCount} of them`
                          } would be sent to a request rather than joining, because this organization asks first.`}
                    </p>
                    <button
                      className="portal-button mt-5"
                      disabled={busy}
                      onClick={() =>
                        beginVerification(organization.id, preview.domain)
                      }
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="material-symbols-outlined text-[1.1rem]"
                      >
                        {pendingAction ===
                        `start-verification:${organization.id}:${preview.domain}`
                          ? "progress_activity"
                          : "domain_verification"}
                      </span>
                      {pendingAction ===
                      `start-verification:${organization.id}:${preview.domain}`
                        ? `Preparing ${preview.domain}…`
                        : `Verify ownership of ${preview.domain}`}
                    </button>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {pendingPolicy && (
        <ConfirmDialog
          busy={busy}
          confirmIcon="how_to_reg"
          confirmLabel="Let them join"
          onCancel={() => setPendingPolicy(null)}
          onConfirm={() => {
            const { organizationId, policy } = pendingPolicy;
            setPendingPolicy(null);
            run(() =>
              setOrganizationJoinPolicy({
                organizationId,
                policy: policy.value,
              }),
            );
          }}
          title={`Let ${pendingPolicy.organizationName} accounts join without review?`}
        >
          <p>
            Anybody signing in with a Google account on{" "}
            {pendingPolicy.domainCount === 0
              ? "a domain after it is DNS verified"
              : pendingPolicy.domainCount === 1
                ? "its verified domain"
                : `one of its ${pendingPolicy.domainCount} verified domains`}{" "}
            becomes an active member of {pendingPolicy.organizationName} at that
            moment, appears in its member directory, and sees everything a member
            sees. No request is created and nothing reaches Access review.
          </p>
          <p className="mt-3">
            People whose membership here has ended are the exception: they are
            sent to Request access instead, and an administrator decides.
          </p>
        </ConfirmDialog>
      )}

      {pendingRemoval && (
        <ConfirmDialog
          busy={busy}
          confirmIcon="close"
          confirmLabel="Remove domain"
          danger
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => {
            const domain = pendingRemoval.domain;
            setPendingRemoval(null);
            run(() => removeOrganizationDomain({ domain }));
          }}
          title="Remove this domain?"
        >
          <p>
            Accounts on{" "}
            <span className="font-medium">{pendingRemoval.domain}</span> stop
            proving anything about {pendingRemoval.organizationName}. New
            sign-ins with one are treated as personal.
          </p>
          <p className="mt-3">
            Memberships it already produced are left exactly as they are — they
            are somebody&rsquo;s actual standing, and ending them is a separate
            decision. Their addresses become ordinary personal addresses, which
            their owners may then remove themselves.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
