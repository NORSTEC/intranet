# Privacy and retention

## Data inventory

| Data | Location | Purpose | Ordinary member visibility |
| --- | --- | --- | --- |
| Name, phone, study, LinkedIn, avatar | `people`, Storage | member profile | only when directory-visible |
| Contact and organization email | `person_emails` | contact, identity support | primary contact only when visible |
| Login identity and Google subject | Auth, `portal_accounts` | authentication/linking | self only |
| Membership, dates and role | `memberships`, `membership_periods` | access and history | when visible; admin by scope |
| Teams and profile history | team/profile tables | directory and profile | when visible |
| Access requests and notes | `access_requests`, history requests | access decisions | self and scoped administrators |
| Workspace/Slack account snapshot | `external_accounts` | reconciliation/offboarding | self and portal administrators |
| Audit events | `audit_events` | security/accountability | authorized administrators |
| Pending email payload | private notification queue | delivery/retry | not readable through Data API |

The access-request form loads Google reCAPTCHA from `recaptcha.net`. Google
processes browser and interaction signals for abuse detection and sets the
necessary `_GRECAPTCHA` cookie. The portal verifies a short-lived token and
does not store it.

## Directory choice

Members can disable “Show me to other members” on profile edit. RLS then hides
their profile and related directory records from ordinary members across
members, teams and organizations. Self access and necessary administrator
access remain.

This is a visibility preference, not deletion. Membership, account access,
email delivery, security logs and retention rules are unchanged.

See the [directory-visibility flow](flows/membership-and-directory.md#directory-visibility)
for the exact self, administrator and ordinary-member branches.

## Retention

- A self/admin deletion is reversible for 30 days.
- Deletion ends memberships, hides the person and revokes sessions.
- Scheduled purge removes Auth identities, avatars and personal rows after the
  retention period.
- Audit events remain without a person reference where accountability requires
  it.
- Pending notifications are deleted after successful delivery; stale rows are
  discarded by schedule.
- A declined or withdrawn applicant with no other data is discarded according
  to the database lifecycle rules.

Production must enable and monitor the scheduled jobs and backup policy. A
backup can extend practical recoverability; that duration must be stated in the
approved privacy notice.

Deletion, restoration and purge are shown in the
[person-lifecycle flow](flows/portal-administration.md#delete-restore-or-purge-a-person).

## Rights handling

Requests for access, correction, visibility, deletion or restriction must be
authenticated before action. Record who handled the request and when, without
copying more personal data into notes than necessary. Legal/privacy ownership,
processor agreements and breach notification procedures are launch checklist
items in [Operations](operations.md#launch-checklist).
