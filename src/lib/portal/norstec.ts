/**
 * NORSTEC itself is an organization row like any other, but it is not one
 * anybody applies to. Its people are administered in the norstec.no Google
 * Workspace and reach the portal by signing in with that account, which grants
 * access without a request. Offering it in the request form would put people
 * in a queue no one is meant to answer.
 */
export const NORSTEC_ORGANIZATION_SLUG = "norstec";

// The identity `set_portal_administrator` and `merge_people` both key off:
// a norstec.no email, primary or linked. This is a UI-only hint so a button
// doesn't invite a request the database will refuse anyway — the two RPCs
// above are the actual gate, checking both primary emails and linked Google
// accounts against the same domain.
export const NORSTEC_EMAIL_DOMAIN = "norstec.no";

export function hasNorstecEmail(emails: string[]) {
  return emails.some(
    (email) =>
      email.split("@")[1]?.toLocaleLowerCase("en") === NORSTEC_EMAIL_DOMAIN,
  );
}
