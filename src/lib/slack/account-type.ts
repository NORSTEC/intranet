/**
 * What an account *is* in the Slack workspace, in Slack's own vocabulary, so an
 * administrator comparing this screen against Slack's member admin is reading
 * the same words. "Workspace admin" is the one departure: Slack calls it Admin,
 * which in this portal already means a portal administrator and an organization
 * administrator, neither of which this is.
 *
 * Kept out of `directory.ts` deliberately. That module reaches for the Vercel
 * OIDC token and only ever runs on the server; this is plain vocabulary the
 * table needs in the browser.
 */

// Ordered by how much a row deserves a second look, which is also the sort
// order. Alphabetical would bury Owner under Member.
export const slackAccountTypes = [
  "owner",
  "workspace_admin",
  "multi_channel_guest",
  "single_channel_guest",
  "member",
] as const;

export type SlackAccountType = (typeof slackAccountTypes)[number];

export const slackAccountTypeLabels: Record<SlackAccountType, string> = {
  member: "Member",
  multi_channel_guest: "Multi-channel guest",
  owner: "Owner",
  single_channel_guest: "Single-channel guest",
  workspace_admin: "Workspace admin",
};

/**
 * Role beats guest status. Slack allows both at once — a multi-channel guest
 * can hold no admin role, but an owner's row still carries the guest flags as
 * false — and reporting somebody as a guest when they administer the workspace
 * would hide the fact that matters.
 */
export function slackAccountType(account: {
  guestType: "multi_channel" | "single_channel" | null;
  workspaceRole: "admin" | "member" | "owner";
}): SlackAccountType {
  if (account.workspaceRole === "owner") return "owner";
  if (account.workspaceRole === "admin") return "workspace_admin";
  if (account.guestType === "multi_channel") return "multi_channel_guest";
  if (account.guestType === "single_channel") return "single_channel_guest";
  return "member";
}

/** Position in `slackAccountTypes`, as a sortable string. */
export function slackAccountTypeRank(account: {
  guestType: "multi_channel" | "single_channel" | null;
  workspaceRole: "admin" | "member" | "owner";
}) {
  return String(slackAccountTypes.indexOf(slackAccountType(account)));
}
