# Security model

This is an initial security model. It must be reviewed alongside the data model,
privacy assessment, and threat model before production data is introduced.

## Identity, membership, and authorization

These are separate concepts:

1. Google authenticates the person.
2. The portal stores an internal user profile.
3. An active membership connects the user to an organization.
4. Membership and system roles determine what the user may access.

A verified Google account from an approved Workspace domain can receive its
first active `member` membership automatically. If a membership already exists,
later sign-ins never change its lifecycle state. A linked personal Google
account can authenticate the same person, but does not create or reactivate an
organization membership.

Additional Google accounts are linked only while authenticated to the existing
profile and after Google verifies the added identity. Accounts are never joined
by name or email similarity. If a verified identity email is already assigned
to another portal person, linking stops for portal-admin duplicate review.

Domain matching must never grant an administrative permission.
`organization_admin` and `portal_admin` are assigned through separate,
authorized, audited operations.

## Proposed roles

- `member`
- `organization_admin`
- `portal_admin`

`organization_admin` is attached to an active membership and applies only to
that organization. `portal_admin` is a separate system permission for the small
Norstec IT group. It grants Portal management and Audit log access and inherits
organization administration for every active organization.

## Role scope

![Role scope](diagrams/role-scope.png)

The arrows represent additional permissions, not automatic role assignment.
Roles must always be assigned through an authorized and audited operation.

| Capability | `member` | `organization_admin` | `portal_admin` |
| --- | ---: | ---: | ---: |
| View and edit own profile | Yes | Yes | Yes |
| View permitted member content | Yes | Yes | Yes |
| Manage members in assigned organization | No | Yes | All organizations |
| Manage teams in assigned organization | No | Yes | All organizations |
| Manage organization settings | No | Yes | All organizations |
| Assign administrator roles | No | No | Yes |
| Suspend or restore portal access | No | No | Yes |
| Delete, restore, or purge a person | No | No | Yes |
| Merge duplicate profiles | No | No | Yes |
| Access system-wide audit information | No | No | Yes |

## Authorization rules

- Roles are stored in trusted database tables, not browser state or user-editable
  authentication metadata.
- Every table containing member data uses Row Level Security.
- Organization access is enforced in the database, not only through user-
  interface filtering.
- Sensitive mutations are checked both by the database policy and server-side
  permission functions.
- Privileged service credentials are never included in browser bundles.
- Global administrator roles are assigned manually and audited.
- Linked Google identities are synchronized from Supabase Auth, not from
  user-editable metadata supplied by the browser.
- Ending a membership is organization-scoped and preserves its periods and
  audit history. Reactivation starts a new period with the safe `member` role.
- Portal access is independent of organization membership and has two states:
  sign-in is allowed, or it is suspended by a portal administrator.
- Erasure is two staged operations: a reversible deletion that ends the
  person's memberships, hides them, and revokes their sessions, and an
  irreversible purge that removes Auth identities, Storage objects, and
  personal rows while keeping audit events without any reference to the person.
  A person may start it on their own profile; only a portal administrator may
  start it on somebody else's.
- The purge runs automatically 30 days after the deletion, scheduled in the
  database so that no administrator action is required for erasure to happen.
- A declined access request deletes the profile it was made from, including its
  Google sign-in, and leaves only the audit event behind.
- Merging duplicate profiles never grants a permission. The portal-admin role is
  not carried over and no membership role is promoted.
- Administrative access requires an additional authentication factor before
  production launch.

## Data and environment rules

- Do not use production personal data in local, test, or preview environments.
- Do not commit credentials, tokens, member exports, or environment files.
- Store only personal data with a documented purpose and retention rule.
- Do not log access tokens, session tokens, secrets, or unnecessary personal
  data.
- Keep development, staging, and production environments separate.

## Reliability and integrations

- The membership database is the source of truth.
- Slack synchronization must be asynchronous, idempotent, retryable, and
  auditable.
- A failed Slack request must not corrupt the membership state.
- Destructive bulk actions require confirmation, authorization, and a recovery
  plan.
- Production requires monitored backups and a tested restore procedure.

## Remaining design work

Before implementation is considered production-ready, the project needs:

- A personal-data register
- A detailed data-flow diagram
- A threat model and risk register
- An incident-response procedure
- Backup and restore procedures
- Administrator and project handover procedures

See [Membership lifecycle](membership-lifecycle.md) for the implemented state
transitions and edge-case flow diagrams.
