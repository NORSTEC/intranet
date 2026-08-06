# Google Workspace

Norstec's own people are administered in the norstec.no Google Workspace. The
portal does not create those accounts and does not delete them. It reads the
directory, links each account to the person who owns it, reports the ones
nobody owns, and keeps suspension in step in both directions.

## Why the portal creates nothing

An earlier version of this had a Create Norstec user form that made the profile
and the Workspace account together. It was removed before it ever ran.

Accounts are made in the Admin console, the person signs in, and the domain
rule in `private.provision_portal_user` already turns that sign-in into a
profile and a Norstec membership. Building a second place to do the same thing
bought nothing, and it required `Users > Create` on the service account — a
write permission with no other use, on a credential the portal has to hold all
the time. The role now carries read, group read, and suspend. Nothing else.

## What the portal stores

`public.external_accounts` is the inventory, one row per account per provider.
The row is keyed on `external_id` — Google's immutable user id — because an
address can be renamed in the Admin console and the id cannot.

`person_id` is **nullable**, and that is the whole shape of the feature: an
account nobody in the portal owns still gets a row, and those rows are the
report. Every existing reader survives it untouched, which is why this is a
nullable column rather than a second table:

- The row level security policy reads `person_id = current_person_id()`.
  `null = anything` is null, never true, so unmatched accounts are visible to
  portal administrators alone.
- `merge_people` loops on `where person_id = ...`, and the empty-profile guard
  in `complete_portal_account_link` asks `exists (... where person_id = ...)`.
  Null matches neither.
- `unique (person_id, organization_id, provider)` still constrains linked rows
  while treating nulls as distinct, so many unmatched rows are allowed.
  `unique (provider, external_id)` is what keeps one row per Google user.

Matching is by address, against every address the portal knows for a person —
somebody whose primary address is their student email still owns their
norstec.no account. One person can hold two addresses the portal knows, and the
table allows only one linked row per person per provider; rather than aborting
the sync, the second account is imported unlinked and shows up in the report,
where a human can see it.

## Syncing

`sync_workspace_directory` takes the whole directory as one JSON snapshot and
applies it in one transaction. Row-by-row updates would leave the table
half-written whenever a request failed midway. An account that has stopped
appearing has been deleted in the Admin console, and its row goes with it.

**It is administrator-triggered, not scheduled.** A cron job has no signed-in
user, so it would need a privileged Supabase key stored on the server — and
this portal deliberately holds none. Every database call it makes goes through
row level security with the caller's own token, and the only Supabase values in
the environment are the URL and the publishable key, both public by design.
Scheduling it later means accepting one privileged key scoped to one route;
that trade has not been made.

### Accounts in "Not in the portal" that must not be touched

The unmatched table exists to find accounts nobody uses any more, and it cannot
tell those apart from accounts nobody *signs in as*. Some of the second kind run
the organization's infrastructure, and suspending one breaks something that will
not obviously point back here.

**`web@norstec.no` is the one to know about.** It is the account behind the
Vercel team that deploys this portal, and behind the Supabase token that applies
migrations from CI. It has no portal profile and never will, so it appears in
the unmatched table looking exactly like an abandoned account. Suspending it
stops deployments and stops migrations.

Before suspending anything from that table, open it in the Admin console and
look at the last sign-in. A role account in active use has a recent one, and
that is the signal that somebody — or something — still depends on it.

## Suspension

Portal access and the Norstec account move together, in both directions.
Suspending portal access suspends the Workspace account; activating it again
reactivates it. Deleting a person suspends it; restoring them brings it back.
A person who keeps their Google sign-in has not really been suspended — that is
the sign-in the portal itself accepts — and a person restored without their
mail and files has only been half restored.

Deletion has two entry points, an administrator and the person themselves, and
only the first of them used to tell Google. The record of the suspension now
lives in `private.soft_delete_person_row`, the body both of them already run,
so a third entry point cannot forget. Only the record: the database cannot make
an outbound request, so pushing it to Google stays with the caller, and a
deletion is never held up by whether Google answered. The row says suspended
either way, and the next sync reconciles against that.

Nothing deletes a Workspace user, and the service account's role cannot.
Deleting one destroys the person's mail, their ownership of shared Drive files
and their Vault history, so it happens by hand in the Admin console after the
data has been transferred. The 30-day purge leaves the account behind,
suspended; the next sync re-imports it as unmatched, which is exactly the list
of accounts somebody should be cleaning up.

## Authentication

No credential exists. Vercel signs a short-lived OIDC token for the deployment,
Google's Security Token Service exchanges it for a federated token, and that
impersonates the service account carrying the Admin console role. Nothing is
downloaded, nothing is stored, and nothing has to be rotated.

The trust is scoped to one Vercel project and one environment: the token's
subject is `owner:<team>:project:<project>:environment:production`, and only
that principal holds Service Account Token Creator. A preview deployment of a
branch is a different subject and reaches nothing. A service account key could
not have made that distinction — it works identically from anywhere.

`ExternalAccountClient` from `google-auth-library` performs the exchange and its
refresh. This is the one place the no-dependency preference elsewhere gives way;
a hand-rolled credential exchange is the wrong thing to maintain.

Setup, once, in Google Cloud:

1. Enable `iamcredentials.googleapis.com` and `sts.googleapis.com`, alongside
   the Admin SDK API.
2. Workload Identity Federation → create pool `vercel`, add an OIDC provider
   with issuer `https://oidc.vercel.com/<team>`, allowed audience
   `https://vercel.com/<team>`, and `google.subject` mapped to `assertion.sub`.
3. On the service account, grant **Service Account Token Creator** to
   `principal://iam.googleapis.com/projects/<number>/locations/global/workloadIdentityPools/vercel/subject/owner:<team>:project:<project>:environment:production`.

The `iam.disableServiceAccountKeyCreation` organization policy should stay
enforced. Nothing here needs a key, and the policy is free protection.

## Not built yet

Group membership is read-only and unused so far — no screen shows which Google
groups an account belongs to.

[Slack](slack.md) now has the unmatched report this sync's shape was written
for. It stops there: Slack Pro has no API for deactivating a member, so the
suspension mirror above has no Slack counterpart, and channel management is
designed but not built.
