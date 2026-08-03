"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  createTeam,
  deleteTeam,
} from "@/app/(portal)/administration/teams/[organizationSlug]/actions";
import { Toast } from "@/components/portal/toast";

export type ManagedTeam = {
  id: number;
  memberCount: number;
  name: string;
  slug: string;
};

function CreateTeamDialog({
  onClose,
  onCreated,
  organizationSlug,
}: {
  onClose: () => void;
  onCreated: (slug: string) => void;
  organizationSlug: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createTeam({
        description: String(formData.get("description") ?? ""),
        name: String(formData.get("name") ?? ""),
        organizationSlug,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onCreated(result.slug);
    });
  }

  return (
    <div
      aria-labelledby="create-team-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,17,24,0.72)] p-5"
      role="dialog"
    >
      <form action={handleSubmit} className="portal-surface w-full max-w-md p-7 sm:p-8">
        <h2 className="text-2xl font-medium" id="create-team-title">
          New team
        </h2>

        {error && (
          <p className="mt-4 rounded-2xl border border-copper p-3 text-sm leading-relaxed">
            {error}
          </p>
        )}

        <label className="mt-6 block">
          <span className="section-label opacity-45">
            Name <span aria-hidden="true" className="text-copper">*</span>
          </span>
          <input
            autoFocus
            className="portal-field mt-3"
            maxLength={160}
            name="name"
            required
          />
        </label>

        <label className="mt-5 block">
          <span className="section-label opacity-45">Description</span>
          <textarea className="portal-field mt-3 min-h-28 resize-y" maxLength={5000} name="description" />
        </label>

        <p className="mt-5 text-sm opacity-60">
          You can add members after the team has been created.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <button className="portal-button" disabled={pending} onClick={onClose} type="button">
            <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
              close
            </span>
            Cancel
          </button>
          <button className="portal-button" disabled={pending} type="submit">
            <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
              {pending ? "progress_activity" : "add"}
            </span>
            {pending ? "Creating…" : "Create team"}
          </button>
        </div>
      </form>
    </div>
  );
}

function DeleteTeamDialog({
  onCancel,
  onConfirm,
  pending,
  team,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  team: ManagedTeam;
}) {
  return (
    <div
      aria-labelledby="delete-team-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(15,17,24,0.72)] p-5"
      role="alertdialog"
    >
      <div className="portal-surface w-full max-w-md p-7 sm:p-8">
        <h2 className="text-2xl font-medium" id="delete-team-title">
          Delete {team.name}?
        </h2>
        <p className="mt-4 leading-relaxed opacity-65">
          This permanently deletes the team. This cannot be undone.
        </p>
        {team.memberCount > 0 && (
          <div className="mt-5 rounded-2xl border border-copper p-4 text-sm leading-relaxed">
            <p className="font-medium">
              You have {team.memberCount} {team.memberCount === 1 ? "member" : "members"} in this team
            </p>
            <p className="mt-1 opacity-65">
              They will be removed from the team. Their organization membership is not affected.
            </p>
          </div>
        )}
        <div className="mt-7 flex flex-wrap gap-3">
          <button
            autoFocus
            className="portal-button"
            disabled={pending}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="portal-button portal-button-danger"
            disabled={pending}
            onClick={onConfirm}
            type="button"
          >
            <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
              {pending ? "progress_activity" : "delete"}
            </span>
            {pending ? "Deleting…" : "Delete team"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TeamListManager({
  organizationName,
  organizationSlug,
  teams,
}: {
  organizationName: string;
  organizationSlug: string;
  teams: ManagedTeam[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [deletingTeam, setDeletingTeam] = useState<ManagedTeam | null>(null);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    status: "success" | "error";
  } | null>(null);
  function confirmDelete() {
    if (!deletingTeam) return;
    const team = deletingTeam;

    startTransition(async () => {
      const result = await deleteTeam({ organizationSlug, teamId: team.id });
      setDeletingTeam(null);
      setToast({
        id: Date.now(),
        message: result.message,
        status: result.ok ? "success" : "error",
      });
      if (result.ok) router.refresh();
    });
  }

  return (
    <>
      {toast && <Toast key={toast.id} message={toast.message} status={toast.status} />}

      <h2 className="mb-8 text-2xl font-medium">{organizationName}</h2>

      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <span className="text-sm opacity-55">
          {teams.length} {teams.length === 1 ? "team" : "teams"}
        </span>
        <button className="portal-button" onClick={() => setCreating(true)} type="button">
          <span className="material-symbols-outlined" aria-hidden="true">
            add
          </span>
          New team
        </button>
      </div>

      {teams.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <article className="portal-surface flex min-h-48 flex-col p-6" key={team.id}>
              <span className="portal-pill portal-pill-filled w-fit">
                {team.memberCount} {team.memberCount === 1 ? "member" : "members"}
              </span>
              <h2 className="mt-7 text-xl font-medium">{team.name}</h2>
              <div className="mt-auto flex flex-wrap gap-2 pt-6">
                <Link
                  className="portal-button"
                  href={`/administration/teams/${organizationSlug}/${team.slug}`}
                >
                  <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
                    edit
                  </span>
                  Edit
                </Link>
                <button
                  className="portal-button portal-button-danger"
                  onClick={() => setDeletingTeam(team)}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
                    delete
                  </span>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <p className="mt-8 text-sm opacity-55">No teams yet.</p>
      )}

      {creating && (
        <CreateTeamDialog
          onClose={() => setCreating(false)}
          onCreated={(slug) => {
            setCreating(false);
            router.push(`/administration/teams/${organizationSlug}/${slug}`);
          }}
          organizationSlug={organizationSlug}
        />
      )}

      {deletingTeam && (
        <DeleteTeamDialog
          onCancel={() => setDeletingTeam(null)}
          onConfirm={confirmDelete}
          pending={pending}
          team={deletingTeam}
        />
      )}
    </>
  );
}
