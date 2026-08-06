"use server";

import { revalidatePath } from "next/cache";
import {
  isWorkspaceConfigured,
  listWorkspaceUsers,
  setWorkspaceUserSuspended,
  WorkspaceError,
} from "@/lib/google/workspace";
import { requirePortalAdminAccess } from "@/lib/auth/access";
import { NORSTEC_ORGANIZATION_SLUG } from "@/lib/portal/norstec";
import {
  isSlackConfigured,
  listSlackUsers,
  SlackError,
} from "@/lib/slack/directory";
import { createClient } from "@/lib/supabase/server";

export type PortalManagementResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const portalAccessStatuses = ["active", "suspended"] as const;

export type PortalAccessStatus = (typeof portalAccessStatuses)[number];

const membershipRoles = ["member", "organization_admin"] as const;

export type MembershipRole = (typeof membershipRoles)[number];

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidPersonId(personId: number) {
  return Number.isSafeInteger(personId) && personId > 0;
}

function revalidatePersonViews(personId: number) {
  revalidatePath("/admin");
  revalidatePath("/admin/people");
  revalidatePath("/admin/deleted");
  revalidatePath(`/admin/people/${personId}`);
  revalidatePath("/members");
}

function messageFor(error: { message: string }, fallback: string) {
  if (error.message.includes("not_authorized")) {
    return "You are not a portal administrator.";
  }
  if (error.message.includes("self_action_blocked")) {
    return "You cannot run this on yourself. Ask another portal administrator.";
  }
  if (error.message.includes("person_not_found")) {
    return "This person no longer exists.";
  }
  if (error.message.includes("person_already_deleted")) {
    return "This person is already deleted.";
  }
  if (error.message.includes("person_not_deleted")) {
    return "This person is not deleted.";
  }
  if (error.message.includes("person_deleted")) {
    return "This person is deleted. Restore them first.";
  }
  if (error.message.includes("person_never_claimed")) {
    return "This person has never signed in, so there is no access to activate.";
  }
  if (error.message.includes("portal_admin_role_first")) {
    return "Remove the portal administrator role first.";
  }
  if (error.message.includes("last_portal_admin")) {
    return "The portal must keep at least one administrator.";
  }
  if (error.message.includes("portal_access_required")) {
    return "Only someone with active portal access can administer the portal.";
  }
  if (error.message.includes("norstec_domain_required")) {
    return "Only people with a norstec.no Google account can become portal administrators.";
  }
  if (error.message.includes("last_organization_admin")) {
    return "This person is the last active administrator of an organization. Appoint another administrator first.";
  }
  if (error.message.includes("membership_not_active")) {
    return "This membership has ended. Reactivate it before changing the role.";
  }
  if (error.message.includes("membership_not_found")) {
    return "This membership no longer exists.";
  }
  if (error.message.includes("purge_conflict")) {
    return "This deletion changed while the page was open. Reload and try again.";
  }
  if (error.message.includes("too_many_portal_accounts")) {
    return "Together these two hold more than two sign-in accounts. Unlink one first.";
  }
  if (error.message.includes("primary_email_not_found")) {
    return "The chosen contact address does not belong to this person.";
  }
  if (error.message.includes("person_email_not_found")) {
    return "This address is not registered on this person.";
  }
  if (error.message.includes("email_has_sign_in_account")) {
    return "A Google account still signs in with this address. Remove the sign-in account first.";
  }
  if (error.message.includes("member_must_keep_email")) {
    return "An active member must keep at least one address.";
  }
  if (error.message.includes("last_portal_account")) {
    return "This is their only sign-in account. Removing it would lock them out.";
  }
  if (error.message.includes("portal_admin_requires_norstec_account")) {
    return "Portal administrators must keep a norstec.no sign-in account. Revoke the role first.";
  }
  if (error.message.includes("membership_requires_account")) {
    return "An active organization membership rests on this account. End the membership first.";
  }
  if (error.message.includes("person_primary_email_invariant")) {
    return "This would leave the person without a contact address.";
  }
  if (error.message.includes("same_person")) {
    return "Pick two different people.";
  }
  if (error.message.includes("source_is_portal_administrator")) {
    return "A portal administrator cannot be folded into someone else. Merge the duplicate into them instead, or revoke the role first.";
  }
  if (error.message.includes("source_is_norstec_account")) {
    return "A Norstec account cannot be folded into someone else. Merge the duplicate into them instead.";
  }
  if (error.message.includes("account_not_found")) {
    return "This person has no Norstec account.";
  }
  if (error.message.includes("norstec_organization_missing")) {
    return "Norstec is missing from the organizations table.";
  }
  return fallback;
}

/**
 * Google's own wording is the most useful thing to show — it names the actual
 * refusal — but the two failures an administrator can do something about are
 * worth saying in the portal's own words first.
 */
function workspaceMessageFor(
  error: unknown,
  fallback: string,
  // Reading the directory and changing one account are two different
  // privileges, and Google answers a missing one with the same sentence either
  // way. Only the caller knows which it was attempting, and only that tells an
  // administrator which privilege to go and look at.
  intent: "read" | "write" = "read",
) {
  if (!(error instanceof WorkspaceError)) return fallback;
  if (error.message === "workspace_not_configured") {
    return "Google Workspace is not configured on this server.";
  }
  if (error.status === 403 && intent === "write") {
    return `Google refused to change this account: ${error.message} Check that the portal's role in the Google Admin console holds Admin API privileges › Users › Update, and that this account is not a super administrator — a delegated role cannot change one.`;
  }
  if (error.status === 403 || error.status === 401) {
    return `Google refused the portal's service account: ${error.message}`;
  }
  return `Google refused the request: ${error.message}`;
}

/**
 * Reads the whole Workspace directory and hands it to the database in one
 * call. Deliberately administrator-triggered rather than scheduled: a cron
 * job has no signed-in user, so it would need a privileged Supabase key
 * stored on the server — and this portal deliberately holds none. Everything
 * it does goes through row level security with the caller's own token.
 */
export async function syncWorkspaceDirectory(): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();

  if (!isWorkspaceConfigured()) {
    return {
      ok: false,
      message: "Google Workspace is not configured on this server.",
    };
  }

  let accounts;
  try {
    accounts = await listWorkspaceUsers();
  } catch (error) {
    return {
      ok: false,
      message: workspaceMessageFor(
        error,
        "Google could not be reached. Nothing was changed.",
      ),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sync_workspace_directory", {
    p_accounts: accounts.map((account) => ({
      accountEmail: account.primaryEmail,
      displayName: account.displayName,
      externalId: account.id,
      suspended: account.suspended,
    })),
  });

  if (error) {
    return {
      ok: false,
      message: messageFor(error, "The directory could not be recorded."),
    };
  }

  revalidatePath("/admin/workspace");
  revalidatePath("/admin/people");

  const summary = data as {
    matched: number;
    removed: number;
    unmatched: number;
  } | null;

  return {
    ok: true,
    message: summary
      ? `Directory synced. ${summary.matched} matched, ${summary.unmatched} not in the portal.`
      : "Directory synced.",
  };
}

/**
 * Slack's error codes are terse and name the fix precisely, which is worth
 * translating rather than passing through: `missing_scope` means somebody has
 * to reinstall the Slack app with another permission, and no administrator
 * reading the raw word would know that.
 */
function slackMessageFor(error: unknown, fallback: string) {
  if (!(error instanceof SlackError)) return fallback;
  if (error.message === "slack_not_configured") {
    return "Slack is not configured on this server.";
  }
  if (error.code === "missing_scope") {
    return "The Slack app is missing a permission. It needs users:read, users:read.email and team:read, and has to be reinstalled to the workspace after they are added.";
  }
  if (error.code === "not_authed" || error.code === "invalid_auth") {
    return "Slack rejected the portal's token. Check the Vercel Connect connector is still installed in the workspace.";
  }
  if (error.code === "ratelimited") {
    return "Slack is rate limiting the portal. Wait a minute and sync again.";
  }
  if (error.code) {
    return `Slack refused the request: ${error.code}`;
  }
  return error.message;
}

/**
 * Reads the Slack member list and hands it to the database in one call, the
 * same way the Workspace sync does — and, like it, triggered by an
 * administrator rather than scheduled, because a cron job has no signed-in user
 * and would need a privileged Supabase key this portal deliberately holds none
 * of.
 *
 * Unlike the Workspace sync this has no counterpart that writes back. Slack Pro
 * has no API for deactivating a member, and the portal is not in use yet, so
 * nothing here may change the real workspace. It reads, and it reports.
 */
export async function syncSlackDirectory(): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();

  if (!isSlackConfigured()) {
    return { ok: false, message: "Slack is not configured on this server." };
  }

  let accounts;
  try {
    accounts = await listSlackUsers();
  } catch (error) {
    return {
      ok: false,
      message: slackMessageFor(
        error,
        "Slack could not be reached. Nothing was changed.",
      ),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sync_slack_directory", {
    p_accounts: accounts.map((account) => ({
      accountEmail: account.accountEmail,
      deactivated: account.deactivated,
      displayName: account.displayName,
      externalId: account.id,
    })),
  });

  if (error) {
    return {
      ok: false,
      message: messageFor(error, "The Slack directory could not be recorded."),
    };
  }

  revalidatePath("/admin/slack");

  const summary = data as {
    matched: number;
    removed: number;
    unmatched: number;
  } | null;

  // Guest accounts are not stored — the inventory has no column that means
  // anything for the other provider — but the count is worth saying once,
  // because a workspace full of guests explains an unmatched table that
  // otherwise looks alarming.
  const guests = accounts.filter((account) => account.guest).length;
  const guestNote = guests > 0 ? ` ${guests} of them are guests.` : "";

  return {
    ok: true,
    message: summary
      ? `Slack synced. ${summary.matched} matched, ${summary.unmatched} not in the portal.${guestNote}`
      : "Slack synced.",
  };
}

export async function changePortalAccess(input: {
  personId: number;
  status: PortalAccessStatus;
}): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();

  if (
    !isValidPersonId(input.personId) ||
    !portalAccessStatuses.includes(input.status)
  ) {
    return { ok: false, message: "Portal access could not be changed." };
  }

  const supabase = await createClient();
  const workspaceAccount = await loadWorkspaceAccount(input.personId);

  const { error } = await supabase.rpc("set_person_portal_access", {
    p_person_id: input.personId,
    p_status: input.status,
  });

  if (error) {
    return {
      ok: false,
      message: messageFor(error, "Portal access could not be changed."),
    };
  }

  revalidatePersonViews(input.personId);

  const suspending = input.status === "suspended";
  const baseMessage = suspending
    ? "Portal access suspended. Open sessions were signed out."
    : "Portal access restored.";

  // Portal access and the Norstec account move together in both directions.
  // Suspending someone who keeps their Google sign-in has not really suspended
  // them — that is the sign-in the portal itself accepts — and activating them
  // again without their mail and files back is only half a restoration.
  const needsWorkspaceChange = suspending
    ? workspaceAccount?.status === "active"
    : workspaceAccount?.status === "suspended";

  if (!needsWorkspaceChange) {
    return { ok: true, message: baseMessage };
  }

  const change = await applyWorkspaceSuspension({
    externalId: workspaceAccount?.externalId ?? null,
    suspended: suspending,
  });

  revalidatePersonViews(input.personId);

  if (!change.ok) {
    return {
      ok: true,
      message: `${baseMessage} Their Norstec account could not be ${
        suspending ? "suspended" : "reactivated"
      } — ${change.message}`,
    };
  }

  return {
    ok: true,
    message: `${baseMessage} Their Norstec account is ${
      suspending ? "suspended" : "active again"
    }.`,
  };
}

export async function changePortalAdministrator(input: {
  isAdministrator: boolean;
  personId: number;
}): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();

  if (!isValidPersonId(input.personId)) {
    return { ok: false, message: "The administrator role could not be changed." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_portal_administrator", {
    p_is_administrator: input.isAdministrator,
    p_person_id: input.personId,
  });

  if (error) {
    return {
      ok: false,
      message: messageFor(error, "The administrator role could not be changed."),
    };
  }

  revalidatePersonViews(input.personId);
  return {
    ok: true,
    message: input.isAdministrator
      ? "Portal administrator role granted."
      : "Portal administrator role revoked.",
  };
}

export async function setMembershipRole(input: {
  membershipId: number;
  personId: number;
  role: MembershipRole;
}): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();

  if (
    !isValidPersonId(input.membershipId) ||
    !membershipRoles.includes(input.role)
  ) {
    return { ok: false, message: "The organization role could not be changed." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_membership_role", {
    p_membership_id: input.membershipId,
    p_role: input.role,
  });

  if (error) {
    return {
      ok: false,
      message: messageFor(error, "The organization role could not be changed."),
    };
  }

  revalidatePersonViews(input.personId);
  // The role decides who may administer an organization, so every page that
  // reads it — not just the portal-management views — is now stale.
  revalidatePath("/administration", "layout");
  revalidatePath("/organizations", "layout");
  return {
    ok: true,
    message:
      input.role === "organization_admin"
        ? "Organization administrator role granted."
        : "Organization administrator role revoked.",
  };
}

export async function softDeletePerson(input: {
  personId: number;
  reason: string;
}): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();
  const reason = input.reason.trim();

  if (!isValidPersonId(input.personId) || reason.length > 500) {
    return { ok: false, message: "This person could not be deleted." };
  }

  const supabase = await createClient();
  // Read while the person is still whole. Deleting them does not remove the
  // row, but doing this first means a delete that then fails has changed
  // nothing at all.
  const workspaceAccount = await loadWorkspaceAccount(input.personId);

  const { error } = await supabase.rpc("soft_delete_person", {
    p_person_id: input.personId,
    p_reason: reason || null,
  });

  if (error) {
    return {
      ok: false,
      message: messageFor(error, "This person could not be deleted."),
    };
  }

  const baseMessage =
    "Person deleted. Their memberships ended, and their data is erased permanently after 30 days.";

  revalidatePersonViews(input.personId);

  // A deleted person keeps their Norstec account, suspended. Deleting the
  // Workspace user is never done from here: it would destroy their mail and
  // their Drive ownership, which is a decision taken in the Admin console
  // after the data has been transferred.
  if (!workspaceAccount || workspaceAccount.status !== "active") {
    return { ok: true, message: baseMessage };
  }

  const suspension = await applyWorkspaceSuspension({
    externalId: workspaceAccount.externalId,
    suspended: true,
  });

  revalidatePersonViews(input.personId);

  if (!suspension.ok) {
    return {
      ok: true,
      message: `${baseMessage} Their Norstec account could not be suspended — ${suspension.message}`,
    };
  }

  return {
    ok: true,
    message: `${baseMessage} Their Norstec account is suspended.`,
  };
}

export async function restorePerson(input: {
  personId: number;
}): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();

  if (!isValidPersonId(input.personId)) {
    return { ok: false, message: "This person could not be restored." };
  }

  const supabase = await createClient();
  const workspaceAccount = await loadWorkspaceAccount(input.personId);
  const { error } = await supabase.rpc("restore_person", {
    p_person_id: input.personId,
  });

  if (error) {
    return {
      ok: false,
      message: messageFor(error, "This person could not be restored."),
    };
  }

  revalidatePersonViews(input.personId);

  // Deleting them suspended the Norstec account, so restoring them brings it
  // back. Leaving it suspended would restore a person who still cannot reach
  // their mail, their files, or the Google sign-in the portal accepts.
  if (workspaceAccount?.status !== "suspended") {
    return { ok: true, message: "Person restored." };
  }

  const change = await applyWorkspaceSuspension({
    externalId: workspaceAccount.externalId,
    suspended: false,
  });

  revalidatePersonViews(input.personId);

  return {
    ok: true,
    message: change.ok
      ? "Person restored. Their Norstec account is active again."
      : `Person restored. Their Norstec account could not be reactivated — ${change.message}`,
  };
}

export async function purgePerson(input: {
  deletedAt: string;
  personId: number;
}): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();

  if (!isValidPersonId(input.personId) || !input.deletedAt) {
    return { ok: false, message: "This person could not be purged." };
  }

  const supabase = await createClient();
  const { data: avatarPath, error } = await supabase.rpc("purge_person", {
    p_expected_deleted_at: input.deletedAt,
    p_person_id: input.personId,
  });

  if (error) {
    return {
      ok: false,
      message: messageFor(error, "This person could not be purged."),
    };
  }

  // Storage lives outside the database, so the avatar object survives the
  // cascade and has to be removed on its own. A failure here leaves an
  // orphaned file, not a half-purged person.
  if (avatarPath) {
    await supabase.storage.from("member-avatars").remove([avatarPath]);
  }

  revalidatePersonViews(input.personId);
  return { ok: true, message: "Person purged. This cannot be undone." };
}

export async function mergePeople(input: {
  contactEmail?: string | null;
  sourcePersonId: number;
  targetPersonId: number;
}): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();

  if (
    !isValidPersonId(input.targetPersonId) ||
    !isValidPersonId(input.sourcePersonId)
  ) {
    return { ok: false, message: "These two could not be merged." };
  }

  const supabase = await createClient();
  // Passed explicitly, chosen in the merge dialog. Left null the surviving
  // person keeps the address they already answered on; the duplicate's address
  // only wins when somebody says so.
  const { error } = await supabase.rpc("merge_people", {
    p_primary_email: input.contactEmail ?? undefined,
    p_source_person_id: input.sourcePersonId,
    p_target_person_id: input.targetPersonId,
  });

  if (error) {
    return {
      ok: false,
      message: messageFor(error, "These two could not be merged."),
    };
  }

  revalidatePersonViews(input.targetPersonId);
  revalidatePath(`/admin/people/${input.sourcePersonId}`);
  return { ok: true, message: "People merged." };
}

/**
 * Unlinking on somebody's behalf. Two profiles holding three sign-in accounts
 * between them cannot be merged, and before this the only way to get under
 * that limit was for the duplicate's owner to sign in — which, for a duplicate
 * nobody can sign in to, never happened.
 */
export async function unlinkPersonAccount(input: {
  authUserId: string;
  personId: number;
}): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();

  if (!isValidPersonId(input.personId) || !uuidPattern.test(input.authUserId)) {
    return { ok: false, message: "That sign-in account could not be removed." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("unlink_portal_account", {
    p_auth_user_id: input.authUserId,
  });

  if (error) {
    return {
      ok: false,
      message: messageFor(error, "That sign-in account could not be removed."),
    };
  }

  revalidatePersonViews(input.personId);
  return { ok: true, message: "Sign-in account removed." };
}

type WorkspaceAccountRow = {
  accountEmail: string | null;
  externalId: string | null;
  status: string;
};

async function loadWorkspaceAccount(
  personId: number,
): Promise<WorkspaceAccountRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("external_accounts")
    .select("account_email, external_id, status, organizations!inner (slug)")
    .eq("person_id", personId)
    .eq("provider", "google_workspace")
    .eq("organizations.slug", NORSTEC_ORGANIZATION_SLUG)
    .maybeSingle();

  if (error || !data) return null;

  return {
    accountEmail: data.account_email,
    externalId: data.external_id,
    status: data.status,
  };
}

/**
 * Google first, then the database. The reverse order can leave a row claiming
 * an account is suspended while the person is still signing in, which is the
 * one inconsistency that actually matters here; this order can only leave the
 * portal a step behind Google, and pressing the button again catches it up.
 */
async function applyWorkspaceSuspension(input: {
  externalId: string | null;
  suspended: boolean;
}): Promise<PortalManagementResult> {
  if (!input.externalId) {
    return { ok: false, message: "This person has no Norstec account." };
  }

  try {
    await setWorkspaceUserSuspended(input.externalId, input.suspended);
  } catch (error) {
    return {
      ok: false,
      message: workspaceMessageFor(
        error,
        "Google could not be reached. Nothing was changed.",
        "write",
      ),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_workspace_account_suspended", {
    p_external_id: input.externalId,
    p_suspended: input.suspended,
  });

  if (error) {
    return {
      ok: false,
      message: messageFor(
        error,
        "Google was updated, but the portal could not record it. Try again.",
      ),
    };
  }

  return {
    ok: true,
    message: input.suspended
      ? "Norstec account suspended."
      : "Norstec account reactivated.",
  };
}

export async function setNorstecAccountSuspension(input: {
  personId: number;
  suspended: boolean;
}): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();

  if (!isValidPersonId(input.personId)) {
    return { ok: false, message: "This Norstec account could not be changed." };
  }

  if (!isWorkspaceConfigured()) {
    return {
      ok: false,
      message: "Google Workspace is not configured on this server.",
    };
  }

  const account = await loadWorkspaceAccount(input.personId);
  const result = await applyWorkspaceSuspension({
    externalId: account?.externalId ?? null,
    suspended: input.suspended,
  });

  revalidatePersonViews(input.personId);
  revalidatePath("/admin/workspace");
  return result;
}

/**
 * The same suspension, reached from the directory rather than from a person.
 * Accounts nobody in the portal claims are the ones this page exists to find,
 * and they have no person page to act from — so Google's user id is what the
 * caller names, and the portal never has to invent a profile to hang the
 * decision on.
 */
export async function setWorkspaceAccountSuspension(input: {
  externalId: string;
  suspended: boolean;
}): Promise<PortalManagementResult> {
  await requirePortalAdminAccess();

  if (!input.externalId.trim()) {
    return { ok: false, message: "This account could not be changed." };
  }

  if (!isWorkspaceConfigured()) {
    return {
      ok: false,
      message: "Google Workspace is not configured on this server.",
    };
  }

  const result = await applyWorkspaceSuspension({
    externalId: input.externalId,
    suspended: input.suspended,
  });

  revalidatePath("/admin/workspace");
  revalidatePath("/admin/people");
  return result;
}
