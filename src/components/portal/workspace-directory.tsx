"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { syncWorkspaceDirectory } from "@/app/(portal)/admin/actions";
import { Toast } from "@/components/portal/toast";

export type WorkspaceDirectoryRow = {
  accountEmail: string;
  adminUrl: string;
  displayName: string | null;
  externalId: string;
  personId: number | null;
  personName: string | null;
  suspended: boolean;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function StatusPill({ suspended }: { suspended: boolean }) {
  return (
    <span className="portal-pill">
      <span
        aria-hidden="true"
        className="material-symbols-outlined text-[1rem]"
      >
        {suspended ? "lock" : "check_circle"}
      </span>
      {suspended ? "Suspended" : "Active"}
    </span>
  );
}

/**
 * The reconciliation between the norstec.no directory and the portal. Its
 * point is the second table: accounts nobody in the portal owns. Some are
 * people who have simply never signed in, and some are accounts left behind by
 * somebody who left years ago — the portal cannot tell those apart, and does
 * not pretend to. It shows them and links to the Admin console, where a human
 * decides.
 *
 * Syncing is a button rather than a schedule on purpose. A scheduled job has
 * no signed-in user, so it would need a privileged database key kept on the
 * server; this portal deliberately holds none, and every read here goes
 * through row level security with the administrator's own session.
 */
export function WorkspaceDirectory({
  accounts,
  lastSyncedAt,
  workspaceConfigured,
}: {
  accounts: WorkspaceDirectoryRow[];
  lastSyncedAt: string | null;
  workspaceConfigured: boolean;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    status: "success" | "error";
  } | null>(null);
  const [busy, startTransition] = useTransition();

  const matched = accounts.filter((account) => account.personId !== null);
  const unmatched = accounts.filter((account) => account.personId === null);

  function sync() {
    startTransition(async () => {
      const result = await syncWorkspaceDirectory();
      setToast({
        id: Date.now(),
        message: result.message,
        status: result.ok ? "success" : "error",
      });
      router.refresh();
    });
  }

  return (
    <>
      {toast && (
        <Toast key={toast.id} message={toast.message} status={toast.status} />
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <button
          className="portal-button"
          disabled={busy || !workspaceConfigured}
          onClick={sync}
          type="button"
        >
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-[1.1rem]"
          >
            {busy ? "progress_activity" : "cloud_sync"}
          </span>
          {busy ? "Reading the directory…" : "Sync with Google"}
        </button>
        <p className="text-sm opacity-55">
          {!workspaceConfigured
            ? "Google Workspace is not configured on this server."
            : lastSyncedAt
              ? `Last synced ${formatDateTime(lastSyncedAt)}`
              : "Never synced"}
        </p>
      </div>

      <section aria-labelledby="workspace-unmatched-heading" className="mt-14">
        <h2 className="text-h2" id="workspace-unmatched-heading">
          Not in the portal
        </h2>
        <p className="mt-3 max-w-2xl text-sm opacity-55">
          Workspace accounts no portal profile claims. A new colleague who has
          not signed in yet looks the same as an account nobody has cleaned up,
          so check each one in the Admin console before acting.
        </p>

        {unmatched.length === 0 ? (
          <p className="portal-surface mt-6 p-6 leading-relaxed opacity-60 sm:p-7">
            {lastSyncedAt
              ? "Every Workspace account belongs to somebody in the portal."
              : "Nothing to show until the directory has been synced."}
          </p>
        ) : (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse">
              <caption className="sr-only">
                Google Workspace accounts with no matching person in the portal,
                with their status and a link to the Google Admin console
              </caption>
              <thead>
                <tr>
                  <th
                    className="pb-3 pl-4 pr-5 text-left font-semibold italic"
                    scope="col"
                  >
                    Account
                  </th>
                  <th className="pb-3 pr-5 text-left font-semibold italic" scope="col">
                    Status
                  </th>
                  <th
                    className="pb-3 pr-4 text-right font-semibold italic"
                    scope="col"
                  >
                    In Google
                  </th>
                </tr>
              </thead>
              <tbody>
                {unmatched.map((account) => (
                  <tr className="border-b border-moody" key={account.externalId}>
                    <td className="py-3 pl-4 pr-5">
                      <span className="block font-medium break-words">
                        {account.accountEmail}
                      </span>
                      {account.displayName && (
                        <span className="block text-sm opacity-55">
                          {account.displayName}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-5">
                      <StatusPill suspended={account.suspended} />
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <a
                        className="portal-pill"
                        href={account.adminUrl}
                        rel="noreferrer noopener"
                        target="_blank"
                      >
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined text-[1rem]"
                        >
                          open_in_new
                        </span>
                        Admin console
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="workspace-matched-heading" className="mt-16">
        <h2 className="text-h2" id="workspace-matched-heading">
          Linked to a person
        </h2>
        <p className="mt-3 max-w-2xl text-sm opacity-55">
          {matched.length} Workspace{" "}
          {matched.length === 1 ? "account belongs" : "accounts belong"} to
          somebody in the portal.
        </p>

        {matched.length > 0 && (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse">
              <caption className="sr-only">
                Google Workspace accounts linked to a person in the portal, with
                the account address and its status
              </caption>
              <thead>
                <tr>
                  <th
                    className="pb-3 pl-4 pr-5 text-left font-semibold italic"
                    scope="col"
                  >
                    Person
                  </th>
                  <th className="pb-3 pr-5 text-left font-semibold italic" scope="col">
                    Account
                  </th>
                  <th className="pb-3 pr-4 text-left font-semibold italic" scope="col">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {matched.map((account) => (
                  <tr className="border-b border-moody" key={account.externalId}>
                    <td className="py-3 pl-4 pr-5">
                      <Link
                        className="font-medium"
                        href={`/admin/people/${account.personId}`}
                      >
                        {account.personName ?? "Unnamed person"}
                      </Link>
                    </td>
                    <td className="py-3 pr-5 break-words">
                      {account.accountEmail}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusPill suspended={account.suspended} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
