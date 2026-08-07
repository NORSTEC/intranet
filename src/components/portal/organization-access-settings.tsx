"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addOrganizationDomain,
  previewOrganizationDomain,
  removeOrganizationDomain,
  setOrganizationJoinPolicy,
  type PortalManagementResult,
} from "@/app/(portal)/admin/actions";
import { ConfirmDialog } from "@/components/portal/confirm-dialog";
import { Toast } from "@/components/portal/toast";

export type OrganizationAccess = {
  domains: Array<{ domain: string; verifiedAt: string | null }>;
  id: number;
  joinPolicy: "auto" | "request" | "off";
  name: string;
};

const joinPolicies = [
  {
    description:
      "Signing in with an account on one of the domains below joins the organization, with nobody in the loop.",
    label: "Join automatically",
    value: "auto",
  },
  {
    description:
      "The account is recognised as the organization's, and the person is sent to a request an administrator decides.",
    label: "Ask for approval",
    value: "request",
  },
  {
    description:
      "The domain proves who somebody is and nothing more. Membership only ever comes from an approved request.",
    label: "Prove identity only",
    value: "off",
  },
] as const;

type Preview = {
  addressCount: number;
  domain: string;
  wouldJoinCount: number;
};

export function OrganizationAccessSettings({
  organizations,
}: {
  organizations: OrganizationAccess[];
}) {
  const router = useRouter();
  const [domainDrafts, setDomainDrafts] = useState<Record<number, string>>({});
  const [previews, setPreviews] = useState<Record<number, Preview | null>>({});
  const [pendingRemoval, setPendingRemoval] = useState<{
    domain: string;
    organizationName: string;
  } | null>(null);
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    status: "success" | "error";
  } | null>(null);
  const [busy, startTransition] = useTransition();

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
                <div className="mt-1 grid gap-3 lg:grid-cols-3">
                  {joinPolicies.map((policy) => {
                    const isSelected = organization.joinPolicy === policy.value;
                    return (
                      <label
                        className={`portal-surface cursor-pointer p-4 transition-all ${
                          isSelected
                            ? "bg-moody/[0.06]"
                            : "border-moody/20 opacity-55 hover:border-moody/40 hover:opacity-90"
                        }`}
                        key={policy.value}
                      >
                        <span className="flex items-center gap-3">
                          <input
                            checked={isSelected}
                            className="size-4 accent-moody"
                            disabled={busy}
                            name={`join-policy-${organization.id}`}
                            onChange={() =>
                              run(() =>
                                setOrganizationJoinPolicy({
                                  organizationId: organization.id,
                                  policy: policy.value,
                                }),
                              )
                            }
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
                      className="flex flex-wrap items-center gap-x-3 gap-y-2"
                      key={domain.domain}
                    >
                      <span className="break-all font-medium">
                        {domain.domain}
                      </span>
                      <button
                        className="portal-button ml-auto"
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
                      the portal already holds.{" "}
                      {organization.joinPolicy === "auto"
                        ? `${
                            preview.wouldJoinCount === 1
                              ? "One person"
                              : `${preview.wouldJoinCount} people`
                          } would join ${organization.name} as they sign in.`
                        : `${
                            preview.wouldJoinCount === 1
                              ? "One person"
                              : `${preview.wouldJoinCount} people`
                          } would be sent to a request instead of joining, because this organization asks first.`}
                    </p>
                    <button
                      className="portal-button mt-5"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const result = await addOrganizationDomain({
                            domain: preview.domain,
                            organizationId: organization.id,
                          });
                          if (result.ok) {
                            setDomainDrafts((current) => ({
                              ...current,
                              [organization.id]: "",
                            }));
                            setPreviews((current) => ({
                              ...current,
                              [organization.id]: null,
                            }));
                          }
                          return result;
                        })
                      }
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="material-symbols-outlined text-[1.1rem]"
                      >
                        add
                      </span>
                      Register {preview.domain}
                    </button>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

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
