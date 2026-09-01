# Operations

## Development and CI

```bash
pnpm dev:all
pnpm check
pnpm db:test
```

Pull requests run the application checks, a database reset from every
migration, 319 authorization assertions and dependency review. Merge only when
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
- TOTP enrollment and verification enabled, capped at two enrolled factors.
- Session timebox 24 hours and inactivity timeout 8 hours. Neither is on by
  default. Without them a session never ends: the access token expires hourly
  but the refresh token rotates indefinitely, and an administrator's AAL2 claim
  rides on the same session, so one MFA prompt would buy administrator rights
  for as long as the browser survives.
- Before-user-created hook set to
  `pg-functions://postgres/private/before_user_created`.
- Identity linked/unlinked and MFA enrolled/removed security notifications
  enabled.

`supabase/config.toml` is the local reference, and every setting above is
mirrored there so the intended value is reviewable in the repository. Do not run
`supabase config push` against the hosted project. It writes the whole file, and
the file is missing things the dashboard holds — the Google provider is
configured only there, so a push would disable sign-in — while its Site URL
points at localhost.

### Vercel

Set production-only values for:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`
- `PORTAL_SITE_URL`
- `PORTAL_EMAIL_FROM`, `PORTAL_EMAIL_REPLY_TO`, `RESEND_API_KEY`
- Google Workload Identity values and `GOOGLE_WORKSPACE_DOMAIN`
- `SLACK_CONNECT_CONNECTOR`

Functions are pinned to `arn1` (Stockholm) in `vercel.json`, because the
Supabase project is in `eu-north-1` and a page load makes several database round
trips one after another — the account, then the memberships, then whatever the
page itself asks for, then the signed avatar URLs. Unpinned, those functions
default to a region on the other side of the Atlantic and every one of those
hops costs about a hundred milliseconds instead of a handful. It is the single
setting with the largest effect on how fast the intranet feels, and it is here
rather than in the dashboard so it cannot drift without a review.

Preview deployments are disabled because there is no separate hosted database.

### GitHub

- Protect `main`; require pull requests, current checks and resolved threads.
- Enable secret scanning, push protection and CodeQL.
- Store `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_ID` in the protected
  `production` environment, not repository secrets.
- Require one approval when a second maintainer can review releases.

### Moving to a new domain

`portal.norstec.no` is retired outright rather than left redirecting. Every
absolute link the intranet has ever emailed was built from that host, so those
links die with it — approval and rejection notices, and any bookmark a member
kept. That is accepted: the intranet has not opened, and the mail sent so far is
test mail. It stops being acceptable the day real members hold links.

The DNS zone for `norstec.no` is held in Vercel, so the records below are added
on the same screen as the domain itself. Everything that has to *accept* the new
host is in place before the host starts being used, and nothing is deleted until
the replacement answers.

1. Google Workspace: create the `intranet@norstec.no` mailbox or alias. The
   sign-in refusal in `private.before_user_created`, the privacy notice and the
   account-deletion copy all name it, and a person reading any of them has no
   other way to reach anyone.
2. Vercel: add `intranet.norstec.no` to the project. Not the production domain
   yet — it only has to resolve for the steps below.
3. Resend: add `intranet.norstec.no` as a *new* sending domain. It is not the
   old one renamed: none of the `send.portal` records carry over, and Resend
   issues its own `send.intranet` MX and SPF plus a DKIM record to publish in
   the Vercel zone. Wait for verification to go green.
4. Supabase Auth: add `https://intranet.norstec.no/auth/callback` and
   `https://intranet.norstec.no/auth/account-link/callback` to the redirect
   allow-list. Add alongside the old ones; they are still in use until step 7.
5. reCAPTCHA admin: add the new host to the site key's domain list. Without it
   `verifyAccessRequestCaptcha` fails closed and every access request is
   refused with `captcha_*`.
6. Vercel: make `intranet.norstec.no` the production domain. This is the step
   that changes `VERCEL_PROJECT_PRODUCTION_URL`, and so the links in every
   email. If `PORTAL_SITE_URL` is set it overrides that, so update or remove it
   in the same change.
7. Supabase Auth: change Site URL to the new host, then remove the old redirect
   URLs.
8. `DEFAULT_FROM` in `src/lib/email/transport.ts` to
   `noreply@intranet.norstec.no`. Neither `PORTAL_EMAIL_FROM` nor
   `PORTAL_EMAIL_REPLY_TO` is set in Vercel, so that constant is the sender
   rather than a fallback — which is why it still names the old subdomain until
   this step: Resend refuses a From address on a domain it has not verified.
   Then send one real approval to yourself and confirm it arrives and its links
   resolve.
9. Only now: remove `portal.norstec.no` from the project's domains, and delete
   the `portal`, `send.portal` and `resend._domainkey.portal` records from the
   zone. Removing the Resend domain entry itself is the last step, after the
   next send has succeeded from the new one.

Unaffected: the Google OAuth client, which redirects to Supabase rather than to
the application, and `norstec.no` as the Workspace domain. Renaming the Vercel
project is a separate change from renaming the domain and belongs in a separate
deploy — both feed the production URL.

Note that HSTS is sent with `includeSubDomains`, so a browser that has visited
the old host refuses plain HTTP to it for a year afterwards. Harmless once the
host is gone, but it means the old name cannot be reused for anything unencrypted.

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
- [ ] Session timebox and inactivity timeout are set; confirm by leaving a
      session idle past the timeout and checking that it asks to sign in again.
- [ ] Branch protection, push protection and production-environment rules are active.
- [ ] Supabase backups/PITR are enabled and a restore has been rehearsed.
- [ ] Vercel, Supabase, Auth and integration failures have alert owners.
- [x] `PRIVACY_HOSTING_REGION` contains the real Supabase project region.
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
