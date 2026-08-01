"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useProfileEdit } from "@/components/portal/profile-edit-form";

type ExistingRole = {
  id: number;
  team_name: string;
  role_title: string | null;
  starts_on: string | null;
  ends_on: string | null;
  updated_at: string;
};

type RoleEditor = {
  key: string;
  id?: number;
  expectedUpdatedAt?: string;
  roleTitle: string;
  startsOn: string;
  endsOn: string;
};

type TeamEditor = {
  key: string;
  teamName: string;
  roles: RoleEditor[];
};

function emptyRole(): RoleEditor {
  return {
    key: crypto.randomUUID(),
    roleTitle: "",
    startsOn: "",
    endsOn: "",
  };
}

function buildTeams(roles: ExistingRole[]): TeamEditor[] {
  const groups = new Map<string, TeamEditor>();
  roles.forEach((role) => {
    const teamName = role.team_name;
    const groupKey = teamName.toLocaleLowerCase();
    const group = groups.get(groupKey) ?? {
      key: crypto.randomUUID(),
      teamName,
      roles: [],
    };
    group.roles.push({
      key: `existing-${role.id}`,
      id: role.id,
      expectedUpdatedAt: role.updated_at,
      roleTitle: role.role_title ?? "",
      startsOn: role.starts_on ?? "",
      endsOn: role.ends_on ?? "",
    });
    groups.set(groupKey, group);
  });
  return [...groups.values()];
}

function PeriodFields({
  disabled,
  endsOn,
  onChange,
  startsOn,
}: {
  disabled: boolean;
  endsOn: string;
  onChange: (patch: Pick<RoleEditor, "startsOn"> | Pick<RoleEditor, "endsOn">) => void;
  startsOn: string;
}) {
  return (
    <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="grid min-w-0 gap-2">
        <span className="section-label opacity-45">From</span>
        <input className="portal-field profile-date-field" disabled={disabled} lang="en-GB" onChange={(event) => onChange({ startsOn: event.target.value })} type="date" value={startsOn} />
      </label>
      <label className="grid min-w-0 gap-2">
        <span className="section-label opacity-45">To</span>
        <input className="portal-field profile-date-field" disabled={disabled} lang="en-GB" onChange={(event) => onChange({ endsOn: event.target.value })} type="date" value={endsOn} />
      </label>
    </div>
  );
}

export function ExperienceRolesEditor({
  experienceId,
  experienceUpdatedAt,
  roles,
  suggestedTeams,
}: {
  experienceId: number;
  experienceUpdatedAt: string;
  roles: ExistingRole[];
  suggestedTeams: string[];
}) {
  const initialTeams = useMemo(() => buildTeams(roles), [roles]);
  const [teams, setTeams] = useState<TeamEditor[]>(initialTeams);
  const [deletedRoles, setDeletedRoles] = useState<Array<{ id: number; expectedUpdatedAt: string }>>([]);
  const [removed, setRemoved] = useState(false);
  const formAnchorRef = useRef<HTMLInputElement>(null);
  const { markDirty, setSaveBlocked } = useProfileEdit();
  const hasUnnamedTeam = !removed && teams.some((team) => !team.teamName.trim());

  const updateTeam = (teamKey: string, patch: Partial<TeamEditor>) => {
    setTeams((current) => current.map((team) => team.key === teamKey ? { ...team, ...patch } : team));
  };

  const updateRole = (teamKey: string, roleKey: string, patch: Partial<RoleEditor>) => {
    setTeams((current) => current.map((team) => team.key === teamKey
      ? { ...team, roles: team.roles.map((role) => role.key === roleKey ? { ...role, ...patch } : role) }
      : team));
  };

  const rememberDeletedRoles = (removedRoles: RoleEditor[]) => {
    const existing = removedRoles
      .filter((role): role is RoleEditor & { id: number; expectedUpdatedAt: string } => Boolean(role.id && role.expectedUpdatedAt))
      .map((role) => ({ id: role.id, expectedUpdatedAt: role.expectedUpdatedAt }));
    setDeletedRoles((current) => [...current, ...existing]);
  };

  const removeTeam = (teamKey: string) => {
    const team = teams.find((entry) => entry.key === teamKey);
    if (team) rememberDeletedRoles(team.roles);
    setTeams((current) => current.filter((entry) => entry.key !== teamKey));
    markDirty();
  };

  const removeRole = (teamKey: string, roleKey: string) => {
    const team = teams.find((entry) => entry.key === teamKey);
    const role = team?.roles.find((entry) => entry.key === roleKey);
    if (role) rememberDeletedRoles([role]);
    setTeams((current) => current.map((entry) => entry.key === teamKey
      ? { ...entry, roles: entry.roles.filter((candidate) => candidate.key !== roleKey) }
      : entry));
    markDirty();
  };

  const newRoles = removed ? [] : teams.flatMap((team, teamIndex) => team.roles
    .filter((role) => !role.id)
    .map((role, roleIndex) => ({
      experienceId,
      teamName: team.teamName.trim(),
      roleTitle: role.roleTitle.trim(),
      startsOn: role.startsOn,
      endsOn: role.endsOn,
      sortOrder: (teamIndex * 100) + roleIndex,
    })));

  useEffect(() => {
    const form = formAnchorRef.current?.form;
    if (!form) return;
    const resetEditor = () => {
      setTeams(initialTeams);
      setDeletedRoles([]);
      setRemoved(false);
    };
    form.addEventListener("reset", resetEditor);
    return () => form.removeEventListener("reset", resetEditor);
  }, [initialTeams]);

  useEffect(() => {
    const source = `experience-${experienceId}-teams`;
    setSaveBlocked(source, hasUnnamedTeam);
    return () => setSaveBlocked(source, false);
  }, [experienceId, hasUnnamedTeam, setSaveBlocked]);

  return (
    <div className="mt-10">
      <input ref={formAnchorRef} type="hidden" />
      <input checked={removed} className="experience-remove-toggle sr-only" readOnly type="checkbox" />
      <input name="newExistingExperienceRoles" type="hidden" value={JSON.stringify(newRoles)} />
      <input name="deletedExperienceRoles" type="hidden" value={JSON.stringify(deletedRoles)} />
      <input
        name="deletedExperiences"
        type="hidden"
        value={JSON.stringify(removed ? [{ id: experienceId, expectedUpdatedAt: experienceUpdatedAt }] : [])}
      />
      <datalist id={`experience-${experienceId}-teams`}>
        {suggestedTeams.map((team) => <option key={team} value={team} />)}
      </datalist>

      <div className="experience-removable-content">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-xl font-medium">Teams and roles</h3>
          <button
            className="portal-button"
            disabled={teams.filter((team) => !team.teamName.trim()).length >= 5}
            onClick={() => setTeams((current) => [...current, { key: crypto.randomUUID(), teamName: "", roles: [emptyRole()] }])}
            type="button"
          >
            <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">add</span>
            Add team
          </button>
        </div>

        {teams.length > 0 ? (
          <div className="mt-3 grid gap-10">
            {teams.map((team, teamIndex) => (
              <section className="border-l-4 border-sky pl-5 sm:pl-7" key={team.key}>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <label className="grid w-full max-w-lg gap-2">
                  <span className="section-label opacity-45">Team {teamIndex + 1} <span className="text-copper" aria-hidden="true">*</span></span>
                  <input
                    className="portal-field"
                    list={`experience-${experienceId}-teams`}
                    maxLength={160}
                    onChange={(event) => updateTeam(team.key, { teamName: event.target.value })}
                    placeholder="e.g. Avionics"
                    required
                    value={team.teamName}
                  />
                </label>
                <button className="portal-button" onClick={() => removeTeam(team.key)} type="button">
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
                  onClick={() => updateTeam(team.key, { roles: [...team.roles, emptyRole()] })}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">add</span>
                  Add role
                </button>
              </div>

              <div className="mt-5 grid gap-7 sm:grid-cols-2 2xl:grid-cols-3">
                {team.roles.map((role, roleIndex) => (
                  <div key={role.key}>
                    {role.id && (
                      <>
                        <input name="experienceRoleId" type="hidden" value={role.id} />
                        <input name={`role-${role.id}-expectedUpdatedAt`} type="hidden" value={role.expectedUpdatedAt} />
                        <input name={`role-${role.id}-teamName`} type="hidden" value={team.teamName} />
                      </>
                    )}
                    <label className="grid gap-2">
                      <span className="section-label opacity-45">Role {roleIndex + 1}</span>
                      <input
                        className="portal-field"
                        disabled={!team.teamName.trim()}
                        maxLength={160}
                        name={role.id ? `role-${role.id}-roleTitle` : undefined}
                        onChange={(event) => updateRole(team.key, role.key, { roleTitle: event.target.value })}
                        placeholder="e.g. Project manager"
                        value={role.roleTitle}
                      />
                    </label>
                    <PeriodFields
                      disabled={!team.teamName.trim()}
                      endsOn={role.endsOn}
                      onChange={(patch) => updateRole(team.key, role.key, patch)}
                      startsOn={role.startsOn}
                    />
                    {role.id && (
                      <>
                        <input name={`role-${role.id}-startsOn`} type="hidden" value={role.startsOn} />
                        <input name={`role-${role.id}-endsOn`} type="hidden" value={role.endsOn} />
                      </>
                    )}
                    {team.roles.length > 1 && (
                      <button className="portal-button mt-4" onClick={() => removeRole(team.key, role.key)} type="button">
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
      </div>

      {removed ? (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <p className="font-medium">This experience will be removed when you save.</p>
          <button className="portal-button" onClick={() => { setRemoved(false); markDirty(); }} type="button">
            <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">undo</span>
            Undo removal
          </button>
        </div>
      ) : (
        <button className="portal-button mt-8" onClick={() => { setRemoved(true); markDirty(); }} type="button">
          <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">delete</span>
          Remove experience
        </button>
      )}
    </div>
  );
}
