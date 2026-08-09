# Security

## Trust boundaries

| Boundary | Control |
| --- | --- |
| Browser → database | JWT, RLS, grants and validated RPCs |
| Google → portal identity | verified OAuth identity and stable provider subject |
| Domain → membership | Google hosted-domain claim plus DNS ownership proof |
| Member → administration | database role check plus AAL2/MFA |
| Application → integrations | server-only credentials or Vercel OIDC |

The UI is not a security boundary. A user may call the Data API directly; the
database must still reject unauthorized reads and writes.

The [flow index](flows/README.md) shows where each authorization and lifecycle
decision is enforced end to end.

## Database rules

- Personal-data tables have RLS enabled.
- Sensitive writes use `security definer` RPCs with `search_path = ''`, input
  validation, short timeouts and explicit role grants.
- Direct profile and access-request writes are revoked where they could bypass
  validation.
- Organization scope is checked from active database records.
- Role changes, access decisions, lifecycle changes, linking and merge are
  audited in the same transaction.
- Foreign-key indexes cover deletion, merge and queue cleanup paths.
- The 307-assertion pgTAP suite runs against a real database in CI.

## Authentication

- Google is the only provisioning provider.
- Manual identity linking is disabled.
- The before-user-created hook and `auth.identities` guard block address reuse
  with a different Google subject, including Supabase's automatic-link path.
- `raw_user_meta_data` is user-editable and never trusted for authorization.
- Administrator functions require JWT `aal = aal2`.
- Sessions and Auth identities are revoked during deletion/unlink flows as
  documented in [Access and identity](access-and-identity.md).

## Application controls

- Server actions validate size, type, enum and relationship constraints before
  calling the database; the RPC repeats critical checks.
- Avatar uploads validate MIME type, signature, size and person-scoped path.
- Security headers block framing, sniffing, unnecessary browser capabilities
  and broad resource loading.
- Secrets stay server-side. Browser code receives only the Supabase publishable
  key.
- Dependencies are locked, audited and reviewed in CI.

## Main threat cases

| Threat | Control |
| --- | --- |
| Reissued Workspace address inherits old account | pre-user hook compares Google subject |
| Forged `hd` or provider metadata | sanitize from `auth.identities`; domain join uses trusted copy |
| Typo registers a broad domain | reserved list, preview, MFA and DNS TXT proof |
| Suspended admin retains management access | active person/membership checks and AAL2 |
| Hidden member leaks through another relation | RLS covers people, memberships, teams, email and experience |
| Merge grants role or loses sync state | pre-merge guards, ordered locks and freshness rules |
| Direct REST write bypasses form validation | column/table grants revoked; current RPC only |
| Stale profile overwrites a newer edit | optimistic concurrency on `profile_updated_at` |

## Secrets and logging

Never log or commit personal exports, JWTs, OAuth/MFA secrets, Supabase service
keys, Workspace credentials or Slack/Resend tokens. Production secrets belong
in protected provider settings. Rotate a credential after any suspected
exposure; deleting it from Git history is not sufficient.

## Verification

Security-sensitive changes require:

1. A regression test that fails without the change.
2. Fresh migration replay.
3. `pnpm db:test` and `pnpm check`.
4. Review of grants, RLS and the full data path—not only the changed function.
