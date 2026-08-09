# Integrations

See [Integration and notification flows](flows/integrations-and-notifications.md)
for the complete sync, suspension and outbox paths.

## Google sign-in

Supabase Auth handles Google OAuth. Hosted configuration must disable manual
linking, enable the before-user-created hook and allow only controlled redirect
URLs. Stable identity comes from Google’s provider subject; hosted domain is a
claim, not an email suffix guess.

## Google Workspace

The portal reads the NORSTEC directory and can suspend/reactivate accounts. It
does not create Workspace accounts.

- Production authentication uses Vercel OIDC and Google Workload Identity.
- The delegated Google role needs user read/update permissions, not super-admin.
- A delegated role cannot modify a Google super administrator; the portal
  reports that refusal.
- Directory sync is administrator-triggered, idempotent and stored in
  `external_accounts`.
- A portal lifecycle decision is committed first, including session revocation.
  When a matching Workspace account must follow it, Google is called next and
  `external_accounts` is updated only after Google succeeds. A Google failure
  leaves the portal decision intact and reports that reconciliation is needed.

Required variables are listed in [Operations](operations.md#vercel).

## Slack

Slack integration is read-only. It records member/deactivated status and
reports unmatched accounts; it does not deactivate people or manage channels.
The production token is obtained through the configured Vercel Connect
connector. Required scopes: `users:read`, `users:read.email`, `team:read`.

## Email

The database queues access approval, rejection and membership-ended messages
inside the transaction that made the decision. The server claims queued rows,
sends through Resend and either settles or releases them for retry.

Notification kinds must agree in four places:

1. `private.pending_notifications` constraint.
2. TypeScript `NotificationKind`.
3. `src/lib/email/templates.ts`.
4. The public privacy inventory/page.

Templates use the `html` tagged template: untrusted scalar values are escaped,
while `SafeHtml` fragments built inside the template module are inserted as
markup. Do not concatenate member or administrator input into HTML.

## Failure behavior

Integration failures must not corrupt membership state. Record a bounded error,
show an actionable administrator message and allow a safe retry. Never log
tokens or full provider payloads.
