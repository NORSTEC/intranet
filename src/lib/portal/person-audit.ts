import "server-only";

import {
  accessLevelLabels,
  personStatusLabels,
} from "@/lib/portal/access-labels";
import { categoryFor, type AuditCategory } from "@/lib/portal/audit-categories";
import { createClient } from "@/lib/supabase/server";

export type { AuditCategory };

export type AuditLogEntry = {
  action: string;
  actorEmail: string | null;
  actorId: number | null;
  actorName: string | null;
  category: AuditCategory;
  createdAt: string;
  id: number;
  organizationName: string | null;
  targetEmail: string | null;
  targetId: number | null;
  targetName: string | null;
  title: string;
};

/** One labelled fact on an event's own page. */
export type AuditField = {
  term: string;
  value: string;
};

export type AuditLogEntryDetail = AuditLogEntry & { fields: AuditField[] };

export type PersonAuditEntry = AuditLogEntry;

type PersonRef = {
  full_name: string | null;
  person_emails: Array<{ email: string; is_primary: boolean }>;
};

type AuditEventRow = {
  action: string;
  actor: PersonRef | PersonRef[] | null;
  actor_person_id: number | null;
  created_at: string;
  details: Record<string, unknown> | null;
  id: number;
  organizations: { name: string } | Array<{ name: string }> | null;
  target: PersonRef | PersonRef[] | null;
  target_person_id: number | null;
};

// Addresses come along so the log can be searched by email as well as by name.
// A person owns several; the primary one is the address they are known by.
const PERSON_COLUMNS = "full_name, person_emails (email, is_primary)";

const SELECT_COLUMNS = `id, action, created_at, details, actor_person_id, target_person_id, organizations (name), actor:people!audit_events_actor_person_id_fkey (${PERSON_COLUMNS}), target:people!audit_events_target_person_id_fkey (${PERSON_COLUMNS})`;

// The number of events one person accumulates is small; a cap only exists so a
// pathological history cannot turn the page into a scroll of hundreds of rows.
const MAX_EVENTS = 120;

// A portal-wide history is longer-lived than one person's, so it gets its own,
// larger cap.
const MAX_LOG_EVENTS = 200;

function single<Row>(value: Row | Row[] | null): Row | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function text(details: Record<string, unknown> | null, key: string) {
  const value = details?.[key];
  return typeof value === "string" ? value : null;
}

function number(details: Record<string, unknown> | null, key: string) {
  const value = details?.[key];
  return typeof value === "number" ? value : null;
}

function flag(details: Record<string, unknown> | null, key: string) {
  const value = details?.[key];
  return typeof value === "boolean" ? value : null;
}

// A person snapshot the writing RPC left behind — `deleted_person`,
// `purged_person`, `applicant`. Nested one level below the action's own fields
// so the purge PII scrub, which only inspects top-level keys, never strips it.
function snapshot(details: Record<string, unknown> | null, key: string) {
  const value = details?.[key];
  if (!value || typeof value !== "object") return null;
  const { email, name } = value as { email?: unknown; name?: unknown };
  return {
    email: typeof email === "string" ? email : null,
    name: typeof name === "string" ? name : null,
  };
}

/** The name on any snapshot this event may carry, whichever one it wrote. */
function snapshotName(details: Record<string, unknown> | null) {
  return (
    snapshot(details, "deleted_person")?.name ??
    snapshot(details, "purged_person")?.name ??
    snapshot(details, "applicant")?.name ??
    null
  );
}

/** The address on any snapshot this event may carry, on the same terms. */
function snapshotEmail(details: Record<string, unknown> | null) {
  return (
    snapshot(details, "deleted_person")?.email ??
    snapshot(details, "purged_person")?.email ??
    snapshot(details, "applicant")?.email ??
    null
  );
}

/** The address a person is known by, falling back to any address they own. */
function primaryEmail(person: PersonRef | null) {
  const emails = person?.person_emails ?? [];
  return (
    emails.find((candidate) => candidate.is_primary)?.email ??
    emails[0]?.email ??
    null
  );
}

function roleLabel(role: string | null) {
  return role === "organization_admin" ? "Organization administrator" : "Member";
}

// portal_access.status — whether the person may sign in at all. It is not the
// access level (member, organization admin, portal admin), so every field that
// prints it says "Portal access" rather than "Access".
function accessStatusLabel(status: string | null) {
  if (status === "active") return "Active";
  if (status === "suspended") return "Suspended";
  if (status === "unclaimed") return "Never signed in";
  if (status === "deactivated") return "Deactivated";
  return "Unknown";
}

// Deletion snapshots taken before these facts were recorded carry neither
// value, and a heading is better left out than filled with a guess — every
// label below returns null when the event does not hold the fact.
function personStatusLabel(status: string | null) {
  if (status === "active") return personStatusLabels.active;
  if (status === "alumni") return personStatusLabels.alumni;
  if (status === "none") return personStatusLabels.none;
  return null;
}

function accessLevelLabel(level: string | null) {
  if (level === "portal_admin") return accessLevelLabels.portal_admin;
  if (level === "organization_admin") return accessLevelLabels.organization_admin;
  if (level === "member") return accessLevelLabels.member;
  return null;
}

function membershipStatusLabel(status: string | null) {
  return status === "active" ? "Active" : "Ended";
}

function requestTypeLabel(type: string | null) {
  return type === "alumni" ? "Alumni access" : "Organization membership";
}

// Every RPC stamps where it was called from, and the raw value is a database
// token rather than something an administrator should have to read.
function sourceLabel(source: string | null) {
  if (source === "portal_management") return "Portal management";
  if (source === "self_service") return "Requested by the person themselves";
  if (source === "database_admin") return "Database administrator";
  if (source === "retention_expiry") return "Automatic, retention period expired";
  if (source === "withdrawal_expiry")
    return "Automatic, access request withdrawn and never renewed";
  if (source === "access_request") return "Access request";
  return source;
}

function yesNo(value: boolean | null) {
  if (value === null) return null;
  return value ? "Yes" : "No";
}

/**
 * Audit actions are free text written by the RPCs, and older events keep the
 * spelling they were written with. Anything unrecognised falls back to a
 * humanised form of the action itself rather than disappearing from the
 * history — an unexplained gap is worse than an unpolished label.
 */
function describe(action: string, details: Record<string, unknown> | null) {
  switch (action) {
    case "portal_access.active":
      return "Portal access activated";
    case "portal_access.suspended":
      return "Portal access suspended";
    case "portal_access.deactivated":
      return "Portal access deactivated";
    case "portal_administrator.granted":
    case "portal_admin.assigned":
      return "Portal administrator role granted";
    case "portal_administrator.revoked":
      return "Portal administrator role revoked";
    case "membership.role_changed":
      return text(details, "role") === "organization_admin"
        ? "Organization administrator role granted"
        : "Organization administrator role revoked";
    case "membership.role_assigned":
      return "Membership role assigned";
    case "membership.status_changed":
      return text(details, "status") === "active"
        ? "Membership activated"
        : "Membership ended";
    case "team_membership.added":
      return "Added to team";
    case "team_membership.removed":
      return "Removed from team";
    case "team_experience_archived":
      return "Team experience archived";
    case "team_experience_restored":
      return "Team experience restored";
    case "access_request_approved":
      return "Access request approved";
    case "access_request_rejected":
      return "Access request rejected";
    case "access_request_cancelled":
      return "Access request cancelled";
    case "historical_membership_requested":
      return "Past membership requested";
    case "historical_membership_approved":
      return "Past membership approved";
    case "historical_membership_rejected":
      return "Past membership rejected";
    case "auth.portal_account_linked":
      return "Sign-in account linked";
    case "auth.portal_account_unlinked":
      return "Sign-in account unlinked";
    case "auth.identity_linked":
      return "Google identity linked";
    case "person.merged":
      return "Profiles merged";
    case "person.soft_deleted":
      return "Person deleted";
    case "person.self_deleted":
      return "Account deleted";
    case "person.restored":
      return "Person restored";
    case "person.purged":
      return "Data purged";
    case "person.abandoned_discarded":
      return "Abandoned profile discarded";
    case "profile.directory_visibility_changed":
      return "Directory visibility changed";
    case "workspace_account.suspended":
      return "Norstec account suspended";
    case "workspace_account.reactivated":
      return "Norstec account reactivated";
    case "workspace_directory.synced":
      return "Workspace directory synced";
    default:
      return action
        .replace(/[._]/g, " ")
        .replace(/^./, (first) => first.toUpperCase());
  }
}

function mapRow(row: AuditEventRow): AuditLogEntry {
  const actor = single(row.actor);
  const target = single(row.target);

  return {
    action: row.action,
    actorEmail: row.actor_person_id === null ? null : primaryEmail(actor),
    actorId: row.actor_person_id,
    actorName:
      row.actor_person_id === null ? null : (actor?.full_name ?? "Unnamed person"),
    category: categoryFor(row.action),
    createdAt: row.created_at,
    id: row.id,
    organizationName: single(row.organizations)?.name ?? null,
    // Same fallback as the name: the profile's own address while it exists,
    // the snapshot the writing RPC left behind once it does not.
    targetEmail:
      row.target_person_id !== null
        ? primaryEmail(target)
        : snapshotEmail(row.details),
    targetId: row.target_person_id,
    // A person the event still points at is named from their row. Once the
    // profile is gone — purged, or discarded with a declined request — only
    // the snapshot the writing RPC left behind can name them, and a purge
    // deliberately erases even that.
    targetName:
      row.target_person_id !== null
        ? (target?.full_name ?? "Unnamed person")
        : snapshotName(row.details),
    title: describe(row.action, row.details),
  } satisfies AuditLogEntry;
}

/**
 * Every recorded change to one person's rights and memberships, newest first.
 * Row level security limits `audit_events` to portal administrators, which is
 * the only role that reaches the page this feeds.
 */
export async function loadPersonAudit(
  personId: number,
): Promise<PersonAuditEntry[]> {
  const supabase = await createClient();

  const result = await supabase
    .from("audit_events")
    .select(SELECT_COLUMNS)
    .eq("target_person_id", personId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MAX_EVENTS);

  if (result.error) {
    throw new Error("Could not load this person's history");
  }

  return (result.data as unknown as AuditEventRow[]).map(mapRow);
}

/**
 * Every recorded event across the portal, newest first. A deleted or purged
 * target falls back to the name/email snapshot `describe` and the deletion
 * RPCs already carry in `details`, since the person row — and the join to
 * it — may be gone by the time this is read.
 */
export async function loadAuditLog(): Promise<AuditLogEntry[]> {
  const supabase = await createClient();

  const result = await supabase
    .from("audit_events")
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MAX_LOG_EVENTS);

  if (result.error) {
    throw new Error("Could not load the audit log");
  }

  return (result.data as unknown as AuditEventRow[]).map(mapRow);
}

// Facts an event references by id rather than by value, resolved once for the
// single event its own page shows.
type ResolvedContext = {
  deletionReason: string | null;
  teamName: string | null;
};

/**
 * The facts that belong to this kind of event and no other. Every field is
 * spelled out under its own heading — an event's page states what changed
 * rather than hinting at it in secondary text.
 */
function buildFields(
  row: AuditEventRow,
  context: ResolvedContext,
): AuditField[] {
  const details = row.details;
  const fields: AuditField[] = [];
  const add = (term: string, value: string | null | undefined) => {
    if (value) fields.push({ term, value });
  };

  switch (row.action) {
    case "portal_access.active":
    case "portal_access.suspended":
    case "portal_access.deactivated":
      add(
        "Portal access change",
        `${accessStatusLabel(text(details, "previous_status"))} → ${accessStatusLabel(
          row.action.slice("portal_access.".length),
        )}`,
      );
      add("Performed from", sourceLabel(text(details, "source")));
      break;

    case "portal_administrator.granted":
    case "portal_admin.assigned":
      add("Role change", "Member → Portal administrator");
      add("Performed from", sourceLabel(text(details, "source")));
      break;

    case "portal_administrator.revoked":
      add("Role change", "Portal administrator → Member");
      add("Performed from", sourceLabel(text(details, "source")));
      break;

    case "membership.role_changed":
      add(
        "Role change",
        `${roleLabel(text(details, "previous_role"))} → ${roleLabel(
          text(details, "role"),
        )}`,
      );
      break;

    case "membership.role_assigned":
      add("Role", roleLabel(text(details, "role")));
      add("Performed from", sourceLabel(text(details, "source")));
      break;

    case "membership.status_changed":
      add(
        "Status change",
        `${membershipStatusLabel(
          text(details, "previous_status"),
        )} → ${membershipStatusLabel(text(details, "status"))}`,
      );
      break;

    case "team_membership.added":
    case "team_membership.removed":
      add("Team", text(details, "team_name") ?? context.teamName);
      break;

    case "team_experience_archived":
    case "team_experience_restored":
      add("Team", context.teamName);
      break;

    case "access_request_approved":
    case "access_request_rejected":
    case "access_request_cancelled":
      add("Request type", requestTypeLabel(text(details, "request_type")));
      add("Applicant email", snapshot(details, "applicant")?.email);
      add("Decision note", text(details, "decision_note"));
      break;

    case "historical_membership_requested":
    case "historical_membership_approved":
    case "historical_membership_rejected":
      add("Team", context.teamName);
      break;

    case "auth.portal_account_linked":
      add("Linked account", text(details, "account_email"));
      add(
        "Membership created",
        yesNo(flag(details, "membership_created")),
      );
      break;

    case "auth.portal_account_unlinked":
      add("Unlinked account", text(details, "account_email"));
      add("Provider", text(details, "provider") === "google" ? "Google" : null);
      break;

    case "auth.identity_linked":
      add("Linked email", text(details, "email"));
      add(
        "Address type",
        text(details, "email_type") === "organization"
          ? "Organization address"
          : "Personal address",
      );
      add("Provider", text(details, "provider") === "google" ? "Google" : null);
      break;

    case "person.merged": {
      const sourceId = number(details, "source_person_id");
      add("Folded-in profile", sourceId === null ? null : `Person #${sourceId}`);
      break;
    }

    case "profile.directory_visibility_changed":
      add(
        "Visible to other members",
        `${yesNo(flag(details, "from"))} → ${yesNo(flag(details, "to"))}`,
      );
      add("Requested by", sourceLabel(text(details, "source")));
      break;

    case "person.soft_deleted":
    case "person.self_deleted":
      add("Deleted account email", snapshot(details, "deleted_person")?.email);
      add(
        "Status before deletion",
        personStatusLabel(text(details, "previous_status")),
      );
      add(
        "Access before deletion",
        accessLevelLabel(text(details, "previous_access_level")),
      );
      // Deletion suspends portal access on its way through, so printing the
      // portal access a person held says nothing. Having already been
      // suspended before the deletion does.
      add(
        "Was suspended",
        text(details, "previous_access_status") === "suspended" ? "Yes" : null,
      );
      add(
        "Reason",
        context.deletionReason ??
          (flag(details, "has_reason") === false ? "None given" : null),
      );
      add("Requested by", sourceLabel(text(details, "source")));
      break;

    case "person.restored":
      add(
        "Portal access restored to",
        accessStatusLabel(text(details, "restored_access_status")),
      );
      break;

    case "person.abandoned_discarded": {
      const discardedId = number(details, "discarded_person_id");
      // No name and no address: the job removes people the portal had no
      // reason to hold, and its own record must not hold them either.
      add(
        "Discarded profile",
        discardedId === null ? null : `Person #${discardedId}`,
      );
      add("Triggered by", sourceLabel(text(details, "source")));
      break;
    }

    case "person.purged": {
      const purged = snapshot(details, "purged_person");
      const purgedId = number(details, "purged_person_id");
      add("Purged account", purged?.name);
      add("Purged account email", purged?.email);
      add("Purged profile", purgedId === null ? null : `Person #${purgedId}`);
      add("Triggered by", sourceLabel(text(details, "source")));
      break;
    }

    default:
      break;
  }

  return fields;
}

/**
 * One audit event by id, with the facts specific to its kind resolved, for the
 * event's own page.
 */
export async function loadAuditLogEntry(
  id: number,
): Promise<AuditLogEntryDetail | null> {
  const supabase = await createClient();

  const result = await supabase
    .from("audit_events")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (result.error) {
    throw new Error("Could not load this event");
  }
  if (!result.data) return null;

  const row = result.data as unknown as AuditEventRow;
  const teamId = number(row.details, "team_id");
  const wasDeletion =
    row.action === "person.soft_deleted" || row.action === "person.self_deleted";

  const [teamResult, personResult] = await Promise.all([
    teamId === null
      ? null
      : supabase.from("teams").select("name").eq("id", teamId).maybeSingle(),
    // The reason itself never enters the audit payload — only whether one was
    // given — so it is read from the person, and disappears with them.
    wasDeletion && row.target_person_id !== null
      ? supabase
          .from("people")
          .select("deletion_reason")
          .eq("id", row.target_person_id)
          .maybeSingle()
      : null,
  ]);

  return {
    ...mapRow(row),
    fields: buildFields(row, {
      deletionReason: personResult?.data?.deletion_reason ?? null,
      teamName: teamResult?.data?.name ?? null,
    }),
  };
}
