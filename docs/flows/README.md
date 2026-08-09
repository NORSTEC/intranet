# Flow diagrams

These diagrams describe the current application and database behaviour. A
decision is shown where the code can change destination, authorization or
persistent state. Linear read-only pages are not diagrammed.

## Index

| Area | Flows |
| --- | --- |
| [Authentication and accounts](authentication-and-accounts.md) | sign-in, provisioning, onboarding, account linking, unlinking, MFA |
| [Membership and directory](membership-and-directory.md) | domain verification, automatic join, access review, membership lifecycle, profile save, visibility, organization/team editing |
| [Portal administration](portal-administration.md) | access and roles, merge, deletion/restore/purge, contact addresses |
| [Integrations and notifications](integrations-and-notifications.md) | Workspace sync, suspension, Slack sync, email outbox |

## Reading the diagrams

- Rectangles are actions or stored state.
- Diamonds are decisions enforced by the application or database.
- Redirection destinations use their application route.
- “Blocked” means the database rejects the operation, even if the UI is
  bypassed.

Update the relevant diagram whenever a route, RPC, authorization rule or state
transition changes.
