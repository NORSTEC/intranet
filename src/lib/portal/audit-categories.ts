export type AuditCategory =
  | "account"
  | "permissions"
  | "membership"
  | "team"
  | "access_requests"
  | "sign_in"
  | "other";

export const auditCategoryLabels: Record<AuditCategory, string> = {
  account: "Account",
  permissions: "Permissions",
  membership: "Membership",
  team: "Team",
  access_requests: "Access requests",
  sign_in: "Sign-in",
  other: "Other",
};

// Buckets every action by the same prefixes `describe` in person-audit.ts
// switches on, so a new action only needs to be taught to one of the two
// functions to file correctly into both.
export function categoryFor(action: string): AuditCategory {
  if (
    action.startsWith("portal_access.") ||
    action.startsWith("person.") ||
    action.startsWith("workspace_account.") ||
    action.startsWith("workspace_directory.")
  ) {
    return "account";
  }
  if (
    action.startsWith("portal_administrator.") ||
    action === "portal_admin.assigned" ||
    action.startsWith("membership.role_")
  ) {
    return "permissions";
  }
  if (action === "membership.status_changed") return "membership";
  if (
    action.startsWith("team_membership.") ||
    action.startsWith("team_experience_")
  ) {
    return "team";
  }
  if (
    action.startsWith("access_request_") ||
    action.startsWith("historical_membership_")
  ) {
    return "access_requests";
  }
  if (action.startsWith("auth.")) return "sign_in";
  return "other";
}
