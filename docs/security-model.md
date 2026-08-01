# Security model

This is an initial security model. It must be reviewed alongside the data model,
privacy assessment, and threat model before production data is introduced.

## Identity, membership, and authorization

These are separate concepts:

1. Google authenticates the person.
2. The portal stores an internal user profile.
3. An active membership connects the user to an organization.
4. Membership and system roles determine what the user may access.

A verified Google account from an approved Workspace domain receives an active
`member` membership automatically. A personal Google account receives only a
profile and onboarding access until its request is approved.

Domain matching must never grant an administrative role. `organization_admin`
and `norstec_admin` are assigned through authorized, audited operations.

## Proposed roles

- `member`
- `organization_admin`
- `norstec_admin`

Roles are attached to memberships. An active `norstec_admin` membership grants
global portal administration.

## Role scope

![Role scope](diagrams/role-scope.png)

The arrows represent additional permissions, not automatic role assignment.
Roles must always be assigned through an authorized and audited operation.

| Capability | `member` | `organization_admin` | `norstec_admin` |
| --- | ---: | ---: | ---: |
| View and edit own profile | Yes | Yes | Yes |
| View permitted member content | Yes | Yes | Yes |
| Manage members in own organization | No | Yes | Yes |
| Manage teams in own organization | No | Yes | Yes |
| Manage other organizations | No | No | Yes |
| Assign administrator roles | No | No | Yes |
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
