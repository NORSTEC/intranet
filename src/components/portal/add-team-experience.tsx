"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useProfileEdit } from "@/components/portal/profile-edit-form";

type OrganizationOption = { id: number; name: string };
type TeamOption = { id: number; name: string; organization_id: number };
type RoleDraft = { key: string; roleTitle: string; startsOn: string; endsOn: string };
type TeamDraft = { key: string; teamName: string; roles: RoleDraft[] };
type ExperienceDraft = {
  key: string;
  organizationName: string;
  description: string;
  startsOn: string;
  endsOn: string;
  teams: TeamDraft[];
};

function emptyRole(): RoleDraft {
  return { key: crypto.randomUUID(), roleTitle: "", startsOn: "", endsOn: "" };
}

function emptyTeam(): TeamDraft {
  return { key: crypto.randomUUID(), teamName: "", roles: [emptyRole()] };
}

function emptyExperience(): ExperienceDraft {
  return {
    key: crypto.randomUUID(),
    organizationName: "",
    description: "",
    startsOn: "",
    endsOn: "",
    teams: [],
  };
}

export function AddTeamExperience({
  organizations,
  teams,
}: {
  organizations: OrganizationOption[];
  teams: TeamOption[];
}) {
  const [drafts, setDrafts] = useState<ExperienceDraft[]>([]);
  const anchorRef = useRef<HTMLInputElement>(null);
  const { markDirty, setSaveBlocked } = useProfileEdit();
  const incomplete = drafts.some((draft) =>
    !draft.organizationName.trim() ||
    draft.teams.some((team) => !team.teamName.trim()));
  const emptyExperienceCount = drafts.filter(
    (draft) => !draft.organizationName.trim(),
  ).length;

  useEffect(() => {
    setSaveBlocked("new-experiences", incomplete);
    return () => setSaveBlocked("new-experiences", false);
  }, [incomplete, setSaveBlocked]);

  useEffect(() => {
    const form = anchorRef.current?.form;
    if (!form) return;
    const resetDrafts = () => setDrafts([]);
    form.addEventListener("reset", resetDrafts);
    return () => form.removeEventListener("reset", resetDrafts);
  }, []);

  const serializedDrafts = useMemo(
    () => JSON.stringify(drafts.map((draft) => {
      const organization = organizations.find(
        (option) => option.name === draft.organizationName.trim(),
      );
      return {
        organizationId: organization?.id ?? null,
        organizationName: draft.organizationName.trim(),
        description: draft.description.trim(),
        startsOn: draft.startsOn,
        endsOn: draft.endsOn,
        roles: draft.teams.flatMap((team, teamIndex) => team.roles
          .map((role, roleIndex) => ({
            teamName: team.teamName.trim(),
            roleTitle: role.roleTitle.trim(),
            startsOn: role.startsOn,
            endsOn: role.endsOn,
            sortOrder: (teamIndex * 100) + roleIndex,
          }))),
      };
    })),
    [drafts, organizations],
  );

  const updateDraft = (draftKey: string, patch: Partial<ExperienceDraft>) => {
    setDrafts((current) => current.map((draft) =>
      draft.key === draftKey ? { ...draft, ...patch } : draft));
  };

  const updateTeam = (
    draftKey: string,
    teamKey: string,
    patch: Partial<TeamDraft>,
  ) => {
    setDrafts((current) => current.map((draft) => draft.key === draftKey
      ? {
          ...draft,
          teams: draft.teams.map((team) =>
            team.key === teamKey ? { ...team, ...patch } : team),
        }
      : draft));
  };

  const updateRole = (
    draftKey: string,
    teamKey: string,
    roleKey: string,
    patch: Partial<RoleDraft>,
  ) => {
    setDrafts((current) => current.map((draft) => draft.key === draftKey
      ? {
          ...draft,
          teams: draft.teams.map((team) => team.key === teamKey
            ? {
                ...team,
                roles: team.roles.map((role) =>
                  role.key === roleKey ? { ...role, ...patch } : role),
              }
            : team),
        }
      : draft));
  };

  return (
    <>
      <input ref={anchorRef} type="hidden" />
      <input name="newProfileExperiences" type="hidden" value={serializedDrafts} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-h2">Experience</h2>
        <button
          className="portal-button"
          disabled={emptyExperienceCount >= 5}
          onClick={() => {
            setDrafts((current) => [...current, emptyExperience()]);
            markDirty();
          }}
          type="button"
        >
          <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">add</span>
          Add experience
        </button>
      </div>

      {drafts.map((draft) => {
        const matchedOrganization = organizations.find(
          (organization) => organization.name === draft.organizationName.trim(),
        );
        const suggestedTeams = matchedOrganization
          ? teams.filter((team) => team.organization_id === matchedOrganization.id)
          : [];
        const organizationListId = `new-experience-${draft.key}-organizations`;
        const teamListId = `new-experience-${draft.key}-teams`;
        const emptyTeamCount = draft.teams.filter(
          (team) => !team.teamName.trim(),
        ).length;

        return (
          <article className="portal-surface mt-8 px-6 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-8" key={draft.key}>
            <datalist id={organizationListId}>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.name} />
              ))}
            </datalist>
            <datalist id={teamListId}>
              {suggestedTeams.map((team) => <option key={team.id} value={team.name} />)}
            </datalist>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="grid gap-2">
                <span className="section-label opacity-45">Organization <span className="text-copper" aria-hidden="true">*</span></span>
                <input
                  className="portal-field"
                  list={organizationListId}
                  maxLength={160}
                  onChange={(event) => updateDraft(draft.key, {
                    organizationName: event.target.value,
                    teams: [],
                  })}
                  placeholder="e.g. NORSTEC or another organization"
                  required
                  value={draft.organizationName}
                />
              </label>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <label className="grid min-w-0 gap-2"><span className="section-label opacity-45">From</span><input className="portal-field profile-date-field" lang="en-GB" onChange={(event) => updateDraft(draft.key, { startsOn: event.target.value })} type="date" value={draft.startsOn} /></label>
                <label className="grid min-w-0 gap-2"><span className="section-label opacity-45">To</span><input className="portal-field profile-date-field" lang="en-GB" onChange={(event) => updateDraft(draft.key, { endsOn: event.target.value })} type="date" value={draft.endsOn} /></label>
              </div>
            </div>

            <label className="mt-4 grid max-w-2xl gap-2">
              <span className="section-label opacity-45">Description</span>
              <textarea className="portal-field min-h-24 resize-y" maxLength={2000} onChange={(event) => updateDraft(draft.key, { description: event.target.value })} placeholder="Describe the work, responsibilities, or results" value={draft.description} />
            </label>

            <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
              <h3 className="text-xl font-medium">Teams and roles</h3>
              <button className="portal-button" disabled={emptyTeamCount >= 5} onClick={() => updateDraft(draft.key, { teams: [...draft.teams, emptyTeam()] })} type="button">
                <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">add</span>
                Add team
              </button>
            </div>

            {draft.teams.length > 0 ? (
              <div className="mt-3 grid gap-10">
                {draft.teams.map((team, teamIndex) => (
                  <section className="border-l-4 border-sky pl-5 sm:pl-7" key={team.key}>
                    <div className="flex flex-wrap items-end justify-between gap-4">
                      <label className="grid w-full max-w-lg gap-2">
                        <span className="section-label opacity-45">Team {teamIndex + 1} <span className="text-copper" aria-hidden="true">*</span></span>
                        <input className="portal-field" list={teamListId} maxLength={160} onChange={(event) => updateTeam(draft.key, team.key, { teamName: event.target.value })} placeholder="e.g. Avionics" required value={team.teamName} />
                      </label>
                      <button className="portal-button" onClick={() => updateDraft(draft.key, { teams: draft.teams.filter((entry) => entry.key !== team.key) })} type="button">
                        <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">delete</span>
                        Remove team
                      </button>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                      <p className="section-label opacity-60">Roles</p>
                      <button
                        className="portal-button"
                        disabled={
                          !team.teamName.trim() ||
                          team.roles.filter((role) =>
                            !role.roleTitle.trim() && !role.startsOn && !role.endsOn).length >= 5
                        }
                        onClick={() => updateTeam(draft.key, team.key, { roles: [...team.roles, emptyRole()] })}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">add</span>
                        Add role
                      </button>
                    </div>

                    <div className="mt-5 grid gap-7 sm:grid-cols-2 2xl:grid-cols-3">
                      {team.roles.map((role, roleIndex) => (
                        <div key={role.key}>
                          <label className="grid gap-2">
                            <span className="section-label opacity-45">Role {roleIndex + 1}</span>
                            <input className="portal-field" disabled={!team.teamName.trim()} maxLength={160} onChange={(event) => updateRole(draft.key, team.key, role.key, { roleTitle: event.target.value })} placeholder="e.g. Project manager" value={role.roleTitle} />
                          </label>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <label className="grid gap-2"><span className="section-label opacity-45">From</span><input className="portal-field profile-date-field" disabled={!team.teamName.trim()} lang="en-GB" onChange={(event) => updateRole(draft.key, team.key, role.key, { startsOn: event.target.value })} type="date" value={role.startsOn} /></label>
                            <label className="grid gap-2"><span className="section-label opacity-45">To</span><input className="portal-field profile-date-field" disabled={!team.teamName.trim()} lang="en-GB" onChange={(event) => updateRole(draft.key, team.key, role.key, { endsOn: event.target.value })} type="date" value={role.endsOn} /></label>
                          </div>
                          {team.roles.length > 1 && (
                            <button className="portal-button mt-4" onClick={() => updateTeam(draft.key, team.key, { roles: team.roles.filter((entry) => entry.key !== role.key) })} type="button">
                              <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">delete</span>
                              Remove role
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-sm opacity-50">No teams added.</p>
            )}

            <button
              className="portal-button mt-8"
              onClick={() => {
                setDrafts((current) => current.filter((entry) => entry.key !== draft.key));
                markDirty();
              }}
              type="button"
            >
              <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">delete</span>
              Remove experience
            </button>
          </article>
        );
      })}
    </>
  );
}
