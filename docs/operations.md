# Operations

## Development and CI

```bash
pnpm dev:all
pnpm check
pnpm db:test
```

Pull requests run the application checks, a database reset from every
migration, 318 authorization assertions and dependency review. Merge only when
all required checks pass.

`main` triggers two independent production actions:

- GitHub Actions applies new Supabase migrations.
- Vercel builds and deploys the application.

They can overlap. Migrations must therefore support the previous application
version during rollout. Add before removing; remove in a later release.

Do not run hosted `supabase db push` from a workstation. Production migrations
belong to `.github/workflows/migrate.yml`.

## Production configuration

### Supabase Auth

Repository migrations do not update hosted Auth settings. Configure these in
the Supabase dashboard:

- Google provider and the production callback URL.
- Production Site URL and allowed redirect URLs only.
- Manual identity linking disabled.
- TOTP enrollment and verification enabled.
- Before-user-created hook set to
  `pg-functions://postgres/private/before_user_created`.
- Identity linked/unlinked and MFA enrolled/removed security notifications
  enabled.

`supabase/config.toml` is the local reference. Do not push it unchanged to the
hosted project: its Site URL is local.

### Vercel

Set production-only values for:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `PORTAL_SITE_URL`
- `PORTAL_EMAIL_FROM`, `PORTAL_EMAIL_REPLY_TO`, `RESEND_API_KEY`
- Google Workload Identity values and `GOOGLE_WORKSPACE_DOMAIN`
- `SLACK_CONNECT_CONNECTOR`

Preview deployments are disabled because there is no separate hosted database.

### GitHub

- Protect `main`; require pull requests, current checks and resolved threads.
- Enable secret scanning, push protection and CodeQL.
- Store `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_ID` in the protected
  `production` environment, not repository secrets.
- Require one approval when a second maintainer can review releases.

## Launch sequence

1. Enable hosted TOTP, disable manual linking and enable identity security
   notifications.
2. Merge the database and application release during a closed sign-in window.
3. Enable the before-user-created hook after its migration exists.
4. A portal administrator signs in, configures MFA and confirms an AAL2 session.
5. Verify every organization domain through its DNS TXT workflow. Existing
   memberships remain; new automatic joins pause until verification succeeds.
6. Run the checks below, then open sign-in.

## Launch checklist

Repository controls:

- [x] RLS and RPC authorization regression suite.
- [x] Stable Google-subject check before account creation.
- [x] User metadata sanitization and identity synchronization.
- [x] MFA enforced for portal and organization administration.
- [x] DNS ownership proof before a domain can grant membership.
- [x] Directory visibility preference enforced by RLS.
- [x] Merge guards for admin roles, duplicate requests and directory snapshots.
- [x] Security headers and dependency scanning.

External controls that must be confirmed before launch:

- [ ] Hosted Auth settings match the list above.
- [ ] Production migrations completed; any conflict from
      `identities_one_google_per_user_idx` was investigated, never deleted blindly.
- [ ] Every production administrator has tested MFA and a recovery procedure.
- [ ] Every active organization domain is DNS verified in the portal.
- [ ] Production redirect URLs reject localhost and unowned hosts.
- [ ] Branch protection, push protection and production-environment rules are active.
- [ ] Supabase backups/PITR are enabled and a restore has been rehearsed.
- [ ] Vercel, Supabase, Auth and integration failures have alert owners.
- [ ] `PRIVACY_HOSTING_REGION` contains the real Supabase project region.
- [ ] Privacy notice, processor agreements and retention responsibilities are approved.
- [ ] One end-to-end launch rehearsal covers sign-in, join, hidden profile,
      access review, offboarding, email and rollback.

Do not call the portal production-ready while any external item is unchecked.

## Monitoring and incidents

Monitor sign-in failures, Auth hook errors, failed deployments, migration jobs,
notification retries, Workspace/Slack sync failures and unexpected audit-event
volume. Logs must not contain JWTs, OAuth tokens, MFA secrets or unnecessary
personal data.

For suspected unauthorized access:

1. Close sign-in or suspend the affected account.
2. Preserve audit and provider logs.
3. Revoke sessions, tokens and affected integration credentials.
4. Determine people, fields and time range involved.
5. Follow the approved GDPR notification process.
6. Patch, test and record the incident before reopening.

Application rollback is Vercel promotion of the previous deployment. Database
migrations are forward-only; ship a compensating migration rather than editing
or reversing an applied file.
