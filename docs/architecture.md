# Architecture

## System

| Component | Responsibility |
| --- | --- |
| Next.js | Pages, server actions, OAuth callback and integration clients |
| Supabase Auth | Google authentication, sessions, MFA and identity records |
| Postgres | People, memberships, roles, audit, RLS and mutation RPCs |
| Supabase Storage | Private member avatars |
| Vercel | Production runtime and deployment identity |
| Google Workspace | NORSTEC account directory and suspension |
| Slack | Read-only workspace inventory |
| Resend | Transactional email delivery |

The browser uses the Supabase publishable key and the signed-in user’s JWT.
It never receives a service-role key. RLS and database functions therefore
remain the authorization boundary even when a request bypasses the UI.

## Core records

| Record | Meaning |
| --- | --- |
| `auth.users` | Supabase login identity and session owner |
| `auth.identities` | Stable Google subject and provider claims |
| `portal_accounts` | One Google login connected to one person |
| `people` | Portal profile and lifecycle state |
| `person_emails` | Contact/organization addresses owned by a person record |
| `memberships` | Current relationship between person and organization |
| `membership_periods` | Immutable active intervals for a membership |
| `portal_administrators` | System-wide administrator assignment |
| `teams`, `team_memberships` | Authoritative organization team structure |
| `profile_experiences`, `profile_experience_roles` | User-authored profile history |
| `external_accounts` | Google Workspace and Slack directory snapshots |
| `audit_events` | Security and lifecycle actions |

Authentication, person, email, membership and administrator role are separate
facts. Code must not treat any one of them as a substitute for another.

## Request path

1. The proxy refreshes the Supabase session when required.
2. `src/lib/auth/access.ts` resolves page-level access once per request.
3. Reads use the signed-in Supabase client and RLS.
4. Server actions validate browser input and call a database RPC.
5. The RPC repeats validation, authorization and concurrency checks.
6. Audit and notification rows are written in the same transaction as the
   decision they describe.

## Source of truth

- Membership and roles: Postgres.
- Google identity: `auth.identities.provider_id`, never editable user metadata.
- NORSTEC Workspace account status: Google, copied into `external_accounts`.
- Slack account status: Slack, copied read-only into `external_accounts`.
- Contact address: the single primary `person_emails` row.

See [Access and identity](access-and-identity.md) for lifecycle rules and
[Security](security.md) for enforcement. The [flow index](flows/README.md)
connects these components across complete user and administrator operations.
