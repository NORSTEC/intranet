import "server-only";

import { createClient } from "@/lib/supabase/server";

export type PersonAuditEntry = {
  actorName: string | null;
  createdAt: string;
  detail: string | null;
  id: number;
  organizationName: string | null;
  title: string;
};

type AuditEventRow = {
  action: string;
  actor_person_id: number | null;
  created_at: string;
  details: Record<string, unknown> | null;
  id: number;
  organizations: { name: string } | Array<{ name: string }> | null;
  people: { full_name: string | null } | Array<{ full_name: string | null }> | null;
};

// The number of events one person accumulates is small; a cap only exists so a
// pathological history cannot turn the page into a scroll of hundreds of rows.
const MAX_EVENTS = 120;

function single<Row>(value: Row | Row[] | null): Row | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function text(details: Record<string, unknown> | null, key: string) {
  const value = details?.[key];
  return typeof value === "string" ? value : null;
}

// The person a `deleted_person`/`purged_person` snapshot names. Nested one
// level below the action's own fields so the purge PII scrub — which only
// inspects top-level keys — never strips it.
function snapshotName(details: Record<string, unknown> | null, key: string) {
  const snapshot = details?.[key];
  if (!snapshot || typeof snapshot !== "object") return null;
  const name = (snapshot as { name?: unknown }).name;
  return typeof name === "string" ? name : null;
}

function roleLabel(role: string | null) {
  return role === "organization_admin" ? "Organization administrator" : "Member";
}

/**
 * Audit actions are free text written by the RPCs, and older events keep the
 * spelling they were written with. Anything unrecognised falls back to a
 * humanised form of the action itself rather than disappearing from the
 * history — an unexplained gap is worse than an unpolished label.
 */
function describe(action: string, details: Record<string, unknown> | null): {
  detail: string | null;
  title: string;
} {
  switch (action) {
    case "portal_access.active":
      return { detail: "Sign-in is allowed again.", title: "Portal access activated" };
    case "portal_access.suspended":
      return {
        detail: "Signed out everywhere and blocked from signing in.",
        title: "Portal access suspended",
      };
    case "portal_access.deactivated":
      return { detail: null, title: "Portal access deactivated" };
    case "portal_administrator.granted":
    case "portal_admin.assigned":
      return { detail: null, title: "Portal administrator role granted" };
    case "portal_administrator.revoked":
      return { detail: null, title: "Portal administrator role revoked" };
    case "membership.role_changed":
      return {
        detail: `${roleLabel(text(details, "previous_role"))} → ${roleLabel(
          text(details, "role"),
        )}`,
        title:
          text(details, "role") === "organization_admin"
            ? "Organization administrator role granted"
            : "Organization administrator role revoked",
      };
    case "membership.role_assigned":
      return {
        detail: roleLabel(text(details, "role")),
        title: "Membership role assigned",
      };
    case "membership.status_changed":
      return {
        detail: null,
        title:
          text(details, "status") === "active"
            ? "Membership activated"
            : "Membership ended",
      };
    case "team_membership.added":
      return { detail: text(details, "team_name"), title: "Added to team" };
    case "team_membership.removed":
      return { detail: text(details, "team_name"), title: "Removed from team" };
    case "team_experience_archived":
      return { detail: null, title: "Team experience archived" };
    case "team_experience_restored":
      return { detail: null, title: "Team experience restored" };
    case "access_request_approved":
      return { detail: null, title: "Access request approved" };
    case "access_request_rejected":
      return { detail: null, title: "Access request rejected" };
    case "access_request_cancelled":
      return {
        detail: text(details, "request_type") === "alumni" ? "Alumni access" : null,
        title: "Access request cancelled",
      };
    case "historical_membership_requested":
      return { detail: null, title: "Past membership requested" };
    case "historical_membership_approved":
      return { detail: null, title: "Past membership approved" };
    case "historical_membership_rejected":
      return { detail: null, title: "Past membership rejected" };
    case "auth.portal_account_linked":
      return { detail: text(details, "account_email"), title: "Sign-in account linked" };
    case "auth.portal_account_unlinked":
      return {
        detail: text(details, "account_email"),
        title: "Sign-in account unlinked",
      };
    case "auth.identity_linked":
      return { detail: text(details, "email"), title: "Google identity linked" };
    case "person.merged":
      return { detail: "A duplicate profile was folded in.", title: "Profiles merged" };
    case "person.soft_deleted":
      return { detail: snapshotName(details, "deleted_person"), title: "Person deleted" };
    case "person.self_deleted":
      return {
        detail: snapshotName(details, "deleted_person") ?? "Requested by the person themselves.",
        title: "Account deleted",
      };
    case "person.restored":
      return { detail: null, title: "Person restored" };
    case "person.purged":
      return { detail: snapshotName(details, "purged_person"), title: "Data purged" };
    default:
      return {
        detail: null,
        title: action.replace(/[._]/g, " ").replace(/^./, (first) => first.toUpperCase()),
      };
  }
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
    .select(
      "id, action, created_at, details, actor_person_id, organizations (name), people!audit_events_actor_person_id_fkey (full_name)",
    )
    .eq("target_person_id", personId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MAX_EVENTS);

  if (result.error) {
    throw new Error("Could not load this person's history");
  }

  return (result.data as unknown as AuditEventRow[]).map((row) => {
    const described = describe(row.action, row.details);
    return {
      actorName:
        row.actor_person_id === null
          ? null
          : (single(row.people)?.full_name ?? "Unnamed person"),
      createdAt: row.created_at,
      detail: described.detail,
      id: row.id,
      organizationName: single(row.organizations)?.name ?? null,
      title: described.title,
    } satisfies PersonAuditEntry;
  });
}

export type AuditLogEntry = {
  actorName: string | null;
  createdAt: string;
  detail: string | null;
  id: number;
  organizationName: string | null;
  targetName: string | null;
  title: string;
};

type GlobalAuditEventRow = {
  action: string;
  actor: { full_name: string | null } | Array<{ full_name: string | null }> | null;
  actor_person_id: number | null;
  created_at: string;
  details: Record<string, unknown> | null;
  id: number;
  organizations: { name: string } | Array<{ name: string }> | null;
  target: { full_name: string | null } | Array<{ full_name: string | null }> | null;
  target_person_id: number | null;
};

// A portal-wide history is longer-lived than one person's, so it gets its
// own, larger cap.
const MAX_LOG_EVENTS = 200;

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
    .select(
      "id, action, created_at, details, actor_person_id, target_person_id, organizations (name), actor:people!audit_events_actor_person_id_fkey (full_name), target:people!audit_events_target_person_id_fkey (full_name)",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MAX_LOG_EVENTS);

  if (result.error) {
    throw new Error("Could not load the audit log");
  }

  return (result.data as unknown as GlobalAuditEventRow[]).map((row) => {
    const described = describe(row.action, row.details);
    return {
      actorName:
        row.actor_person_id === null
          ? null
          : (single(row.actor)?.full_name ?? "Unnamed person"),
      createdAt: row.created_at,
      detail: described.detail,
      id: row.id,
      organizationName: single(row.organizations)?.name ?? null,
      targetName:
        (row.target_person_id !== null ? single(row.target)?.full_name : null) ??
        snapshotName(row.details, "deleted_person") ??
        snapshotName(row.details, "purged_person"),
      title: described.title,
    } satisfies AuditLogEntry;
  });
}
