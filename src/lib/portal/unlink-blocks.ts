/**
 * Why a sign-in account cannot be removed, in the portal's own words.
 *
 * The database decides — `portal_account_unlink_block` asks the same guard the
 * removal runs — and this only translates. Shared between a person's own
 * profile and Portal management so the two cannot end up describing the same
 * refusal differently; they differ only in who is being told, which is what
 * `voice` selects.
 */
export type UnlinkVoice = "self" | "admin";

export function unlinkBlockMessage(
  reason: string | null,
  voice: UnlinkVoice,
): string | null {
  if (!reason) return null;

  if (reason.includes("last_portal_account")) {
    return voice === "self"
      ? "This is your only sign-in account. Add another before removing it."
      : "This is their only sign-in account. Removing it would lock them out.";
  }
  if (reason.includes("portal_admin_requires_norstec_account")) {
    return voice === "self"
      ? "Intranet administrators sign in with a norstec.no account. Hand the role over before removing it."
      : "Intranet administrators sign in with a norstec.no account. Revoke the role first.";
  }
  if (reason.includes("membership_requires_account")) {
    return voice === "self"
      ? "Your active membership in this organization rests on this account. An organization administrator has to end the membership first."
      : "Their active membership in this organization rests on this account. End the membership first.";
  }
  if (reason.includes("portal_account_not_found")) {
    return "This sign-in account no longer exists.";
  }
  return voice === "self"
    ? "This sign-in account cannot be removed."
    : "This sign-in account cannot be removed.";
}
