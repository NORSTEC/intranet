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
      return { detail: null, title: "Person deleted" };
    case "person.self_deleted":
      return { detail: "Requested by the person themselves.", title: "Account deleted" };
    case "person.restored":
      return { detail: null, title: "Person restored" };
    case "person.purged":
      return { detail: null, title: "Data purged" };
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
