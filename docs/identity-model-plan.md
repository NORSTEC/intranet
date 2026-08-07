# Identity model: multi-organization plan

A plan for making domain-based membership work for more than one organization,
and for making linking and unlinking behave the way the rest of the industry
makes them behave. Nothing here is implemented yet.

Written after tracing a bug report that turned out not to be a bug: a member
unlinked a Google account, signed in with it again and landed back on the same
profile. That is the documented behaviour — the address stays on the profile so
an ended member cannot unlink their way to a fresh one — but it is behaviour no
other identity system has, and the reason it exists is a rule that is itself not
standard: a matching email domain grants an active membership on the spot.

## The three rules this plan is built on

**1. Tenancy is proved by the `hd` claim, not by the email suffix.** Google puts
`hd` (hosted domain) in the ID token only when the account belongs to that
Workspace domain. A consumer Google account can carry a work address — Google's
own "conflicting accounts" case — and it keeps carrying it after the Workspace
account is deleted. `private.provision_portal_user` currently matches on
`split_part(email, '@', 2)`, which cannot tell the two apart.

**2. One place decides membership, and both doors call it.** Today the domain
rule is implemented twice: in `private.provision_portal_user` on sign-in, and in
`public.complete_portal_account_link` when an account is linked. Any guard added
to one is a bypass through the other.

**3. Directory-owned identity is not user-managed.** An organization address
belongs to the organization, the way SCIM-provisioned attributes are read-only
for the user in Okta and Entra. A personal address belongs to the person, the
way GitHub lets anyone add and remove their own. The portal currently treats
both the same, which is why it needs the address-retention rule to stay safe.

With rule 1 and rule 2 in place, membership no longer rests on an email row
surviving forever, and the retention rule stops being load-bearing.

## Backend changes

Each numbered item is one migration, in this order. They are independently
shippable; the unlink simplification at the end is the only one that depends on
all the others.

### B1. Record the hosted domain

`portal_accounts.hosted_domain text`, written by `provision_portal_user` from
`raw_user_meta_data ->> 'hd'`, falling back to the `auth.identities` row the same
way `provider_id` already does.

**Verified against GoTrue v2.194.0**, the version the local stack runs
(`public.ecr.aws/supabase/gotrue:v2.194.0`):

- `googleProvider.GetUserData` takes the ID token path whenever Google returns
  an `id_token`, which it does for the `email` and `profile` scopes the provider
  requests.
- That path runs `ParseIDToken` → `parseGoogleIDToken`, which sets
  `data.Metadata.CustomClaims = map[string]any{"hd": claims.HostedDomain}` when
  the claim is present.
- `Claims.CustomClaims` carries the json tag `custom_claims`.

So the column path is:

```sql
new.raw_user_meta_data -> 'custom_claims' ->> 'hd'
```

Two caveats that belong in the implementation rather than in a comment:

- **The legacy path drops it.** If Google returns no ID token, `GetUserData`
  falls back to the userinfo endpoint and builds `Claims` without the hosted
  domain — the struct parses `hd` there and then never uses it. GoTrue logs
  `Using Google OAuth2 user info endpoint, an ID token was not returned by
  Google` when that happens. An absent `hd` must therefore mean *not proven*,
  never *proven personal*: no organization, no membership, and the person goes
  to `/access` like anyone else. Fail closed.
- **Confirm the hosted version.** The local stack is not what production runs.
  One norstec.no user in Supabase Dashboard → Authentication → Users → Raw user
  meta data settles it without touching the database by hand. If `custom_claims`
  is missing there while the local stack has it, the hosted GoTrue is older and
  B1 waits for the upgrade.

### B2. Organization domains become data, not a seed

`private.organization_domains` is written by a migration today, so adding
orbitntnu.com means shipping code. It gains:

- `verified_at timestamptz`, `verification_token text` — unused at first, but the
  column exists so DNS TXT verification can be added without a rewrite when a
  domain nobody at Norstec controls has to be registered.
- `public.add_organization_domain(p_organization_id, p_domain)` and
  `public.remove_organization_domain(...)`, portal admin only, audited.

Slack, Notion and Vercel all require DNS proof before a domain grants anything.
Skipping it now is a deliberate trade: the only domains being added are ones
Norstec's own administrators can vouch for in person.

Two guards belong on `add_organization_domain`, because registering a domain is
the single most destructive operation in this plan:

- **Refuse public mailbox providers** from a blocklist — gmail.com, outlook.com,
  hotmail.com, icloud.com, proton.me and the rest. Registering gmail.com would
  turn every personal address in the portal into an organization address at
  once: locked against self-removal, and under `auto`, a membership for
  everybody holding one.
- **Report before it applies.** The RPC returns how many existing
  `person_emails` rows the domain would capture and how many memberships an
  `auto` policy would create, and the UI shows that count in the confirmation
  step. A domain that captures 200 addresses is either exactly right or a typo,
  and the number is what tells them apart.

### B3. Join policy per organization

`organizations.domain_join_policy text not null default 'request'`, check
constraint `in ('auto', 'request', 'off')`.

- `auto` — a verified domain match grants an active membership.
- `request` — the person is sent to `/access` with the organization preselected.
- `off` — the domain proves identity only.

Norstec is set to `auto` in the same migration, which preserves today's
behaviour. Orbit and Ignite start at `request`.

### B4. One membership decision

`private.apply_domain_join(p_person_id, p_account_email, p_hosted_domain)`,
called by both `provision_portal_user` and `complete_portal_account_link`. It is
the only code that inserts a membership with `provisioning_method = 'domain'`.

Order of checks:

1. Resolve the organization from `hosted_domain` against
   `organization_domains`. No `hd` means no organization, whatever the address
   says.
2. Organization is `active`, policy is `auto`. Otherwise return "request".
3. The person holds no `ended` membership in that organization. If they do,
   return "request" — this is the rule SCIM would enforce by not listing them,
   and it is what makes B7 safe.
4. The person is not suspended or deleted.
5. Insert the membership, `on conflict do nothing`.

It returns what happened, so the callers can route: portal, or `/access` with
the organization preselected.

An `ended` membership that is re-approved reactivates the existing row rather
than inserting a second one — `memberships` is unique per person and
organization, and the approval RPC already has to handle this.

### B4a. The decision runs on every sign-in, not only on the first

`provision_portal_user` is a trigger on `auth.users`, and it fires on insert and
on changes to the email, its confirmation or the app metadata. An ordinary repeat
sign-in changes none of those, so the trigger does not run — the migration that
introduced `release_unlinked_account` says so explicitly.

That is fine while the domain rule is a fact about the account, and wrong the
moment it becomes a policy that can change. Orbit switching from `request` to
`auto`, a domain being registered after its members already have profiles, or an
organization being reactivated would all reach nobody until each person happened
to change their email address.

So `apply_domain_join` is called from `src/app/auth/callback/route.ts` on every
sign-in, in addition to the trigger call that covers first provisioning. It is
idempotent — `on conflict do nothing` on an existing membership — and it is the
same function, so there is still one decision.

This also gives the callback what it needs to route: portal, or `/access` with
the organization preselected.

### B5. Account cap keyed on domain

`too_many_linked_google_identities` and the matching check in `merge_people` use
a flat count of two. That number was chosen when one domain existed. Replace it
with: **at most one account per organization domain, plus at most one personal
account.** Someone active in Norstec and Orbit needs three, and today the third
is refused.

Enforced in one function, called from the linking RPC, the merge RPC and the
provisioning trigger.

### B6. Address claiming respects the domain

`provision_portal_user` matches an address to a profile so that an imported
profile can be claimed on first sign-in. For an address on a registered
organization domain, that match now also requires the presenting account's `hd`
to be that domain. Without it, a consumer account carrying an Orbit address
inherits an imported Orbit profile — name, history and all — without ever having
been in the Workspace.

Addresses outside every registered domain keep matching as they do today.

### B7. Unlink returns to standard behaviour

Once B4 exists, an address on a profile grants nothing by itself, so it no
longer has to be immortal.

- `unlink_own_portal_account` gains `p_remove_email boolean`. When true, the
  address goes with the account, and the next sign-in with that Google account
  lands on a new profile — the Auth0 and Firebase behaviour.
- Refused for addresses on a registered organization domain. Those are
  directory-owned; a portal administrator removes them. This is rule 3.
- `assert_can_unlink_account` keeps the active-membership guard unchanged.
- `remove_person_email` stays as it is for administrators.

### B8. Pending requests do not survive an auto-join — already done

Nothing to build. `20260818050000_membership_cancels_pending_requests.sql` put
`private.cancel_requests_answered_by_membership` on `memberships` rather than in
the functions that create one, precisely so a fourth caller could not forget it.
`apply_domain_join` is that fourth caller, and it inherits the behaviour by
inserting a membership row like everything else.

Keep the AR4 test anyway. It is the assertion that the inheritance actually
holds once the decision moves.

### B9. A portal administrator cannot lose their last Norstec address

`set_portal_administrator` requires a norstec.no address before granting the
role, and `hasNorstecEmail` gates the button. Nothing checks the other
direction: `remove_person_email` and the unlink RPCs can take away the last
norstec.no address of somebody who holds the role, leaving an administrator the
requirement says should not exist.

`private.assert_can_unlink_account` and `remove_person_email` both refuse when
the person holds the role and the address is their last one on the domain.
Portal management already lists administrators without a Norstec account, so the
surfacing exists — this closes the way in.

## UI changes

### `/access` — request page

`src/app/access/page.tsx`, `src/components/portal/access-request-form.tsx`.

Preselect the organization when the person arrived with a verified domain
account, and say why they are here rather than inside: *"Your Orbit account is
recognised, but joining Orbit needs approval"* for `request`, and *"You were a
member of Orbit before, so an administrator has to approve you again"* for the
ended-membership case. A returning member who meets an empty form assumes the
portal has forgotten them.

The alumni and organization choice is unchanged. `request_access` already
accepts both and neither depends on the domain.

### `/onboarding/account` — "I already have an account"

`src/app/onboarding/account/page.tsx`.

The link itself is unchanged, but its outcome no longer always includes a
membership. After linking, route on what `apply_domain_join` returned: the portal
when a membership was granted, `/access` when it was not. Today the flow assumes
the domain match settled it.

### `/profile` — sign-in accounts

`src/components/portal/login-accounts-settings.tsx`.

- Personal accounts: one button, "Remove account and address", with copy that
  says what actually happens — the account stops signing in, the address leaves
  the profile, and signing in with it again starts a new profile. This is the
  action people already believe "unlink" performs.
- Organization accounts: no removal button. A line pointing at
  `PRIVACY_CONTACT_EMAIL` instead — *"Need this address moved to another profile
  or removed? Contact portal@norstec.no."*
- Show which is which, and for Norstec accounts the directory status from
  `external_accounts` so a suspended Workspace account is visible as such.

### Administration — person page

`src/components/portal/person-admin-actions.tsx`.

Replace the "Sign-in accounts" card with one card listing **addresses**, each
row showing whether a Google account signs in with it. Two actions per row:
"Remove sign-in" and "Remove address", the second disabled with a reason until
the first is done — the order `remove_person_email` enforces through
`email_has_sign_in_account`, made visible instead of arriving as an error.

`public.remove_person_email` and `public.set_person_primary_email` already exist,
with guards and audit, and nothing calls them. Two server actions beside
`unlinkPortalAccount` in `src/app/(portal)/admin/actions.ts` finish them.

### Administration — organization page

`src/components/portal/organization-edit-form.tsx`.

The join policy as three radio options, in plain language rather than the enum
values, and the domain list with add and remove. Removing a domain does not touch
existing memberships; say so next to the button.

## Edge cases

Every flow that can attach, move or remove an identity, walked through. Each row
is a pgTAP case in `supabase/tests/database/authorization.test.sql` unless it
says otherwise. Rows marked **accepted** are known behaviour nobody is going to
change, written down so the next person does not rediscover them as bugs.

### Sign-in and provisioning

| # | Situation | Expected |
|---|---|---|
| SI1 | New person, verified org account, policy `auto`, no history | Active membership, straight to the portal |
| SI2 | Same, policy `request` | Person created, no membership, `/access` with the organization preselected |
| SI3 | Same, policy `off` | Person created, address recorded as an organization address, no membership, no preselection |
| SI4 | Ex-member, membership `ended`, Workspace account still live | No membership whatever the policy. `/access`, preselected, returning-member wording |
| SI5 | SI4, then approved | The existing `ended` row reactivates. No second row |
| SI6 | Verified org account, membership already `active` | Nothing happens. Idempotent |
| SI7 | Personal account, no match anywhere | New person, `/access`, free choice of organization or alumni |
| SI8 | Personal account matching an imported profile with no `provider_id` | Claims the profile, `unclaimed` becomes `active`, `provider_id` recorded. Unchanged |
| SI9 | Verified org account matching an imported org profile | Claims it, then `apply_domain_join` runs. This is the ordinary new-employee path once a directory import exists |
| SI10 | Consumer Google account carrying an org address, no `hd` | Treated as personal. No membership under any policy, and B6 refuses the address match — it cannot claim SI9's imported profile |
| SI11 | SI10 where the address is on no profile yet | New person, address recorded as personal. When the real Workspace user later signs in, the existing reuse guard gives them their own profile and audits `auth.account_email_reused`. Both profiles then exist and an administrator has to sort them out — surfaced, not prevented |
| SI12 | Recycled org address, new Workspace account, different `provider_id` | New person, `auth.account_email_reused`. Unchanged |
| SI13 | Workspace rename inside one domain | The address row moves, `provider_id` proves it is the same account. Unchanged |
| SI14 | Workspace move across domains, Orbit to Norstec | The address row moves, then `apply_domain_join` runs for the new domain. The Orbit membership is untouched and left for an administrator to end |
| SI15 | Rename onto an address another profile already holds | No row moves. `auth.account_email_conflict` audited, both sides named. Unchanged |
| SI16 | `hd` present for a domain nobody registered | Personal in every respect. No organization, no membership |
| SI17 | `hd` present, domain registered, organization `status` not active | No membership. The address is still recorded |
| SI18 | Workspace secondary domain — `hd` is the user's own domain, not the primary | Only works if that domain is registered too. Register every domain a Workspace serves, or those members look personal |
| SI19 | Suspended or deleted person signs in | `sign_in_block_reason`, no membership work at all. Unchanged |
| SI20 | Soft-deleted person's org address still matches on sign-in | They land back on the deleted profile and are blocked with `deleted`. Deliberate — a soft delete has to survive a re-sign-in |

### Repeat sign-in and re-evaluation

| # | Situation | Expected |
|---|---|---|
| RS1 | Policy flips `request` to `auto` while members already have profiles | The callback re-evaluates on next sign-in and grants (B4a). Without B4a the trigger never fires again and nobody notices for months |
| RS2 | A domain is registered after its people already signed in with personal-looking accounts | Same as RS1 — they have to sign in with an account carrying the right `hd` before anything changes |
| RS3 | Policy flips `auto` to `request` | Existing memberships stay. Only new joins are gated |
| RS4 | Membership ended while a session is live | `getPortalAccess` resolves per request, so the next page load drops them out. No token revocation needed |
| RS5 | Re-evaluation runs on a person who is suspended | `apply_domain_join` refuses on status before touching memberships |

### Linking

| # | Situation | Expected |
|---|---|---|
| LK1 | `add_account`: personal account onto an existing profile | Allowed, no membership consequences |
| LK2 | `add_account`: org account onto a profile already active in that organization | Allowed. `apply_domain_join` leaves the membership alone — `provisioning_method` stays `request` if that is how they really got in |
| LK3 | `add_account`: org account onto a profile with an `ended` membership there | Linked, no membership, sent to `/access`. This is the bypass the shared function closes |
| LK4 | `use_existing`: new org account, existing alumni profile | Link succeeds, then policy decides. The alumni grant is untouched, and both can coexist |
| LK5 | `use_existing` where the destination profile is suspended | Refused, `target_portal_access_required`. Unchanged |
| LK6 | Source profile carries any data — membership, request, experience, admin role, alumni grant | Refused, `source_profile_has_data`. Unchanged, and it is what keeps linking from being a merge |
| LK7 | Destination already at the account cap | Refused, `too_many_portal_accounts`, with the cap now per domain (B5) |
| LK8 | Second account on the same organization domain, an alias account | Refused by B5 |
| LK9 | The source account's address is already on the destination profile | The `person_emails` move hits the unique index on `email`. Needs an explicit check and a real error, not a constraint violation |
| LK10 | Link token reused | Refused. The intent row is deleted on success, so it is single-use already |
| LK11 | Link token expired | Refused, `link_intent_expired`. Unchanged |
| LK12 | The initiating account is unlinked or deleted before the flow completes | `portal_account_not_found`. Should end the flow with a readable message rather than a merge error |
| LK13 | Two link flows for the same destination in parallel | The `for update` on the destination `people` row serialises them; the second hits the cap check |
| LK14 | Linking an org account for organization A onto a profile that is a member of B | Allowed. Memberships are per organization and do not interact |

### Unlinking

| # | Situation | Expected |
|---|---|---|
| UL1 | Self-unlink of a personal account, address removed with it | Allowed. Next sign-in with that Google account starts a new profile |
| UL2 | Self-unlink of an organization account | Refused. Directory-owned, administrators only |
| UL3 | Self-unlink of the last account | Refused, `last_portal_account`. Unchanged |
| UL4 | Self-unlink of an account backing an active domain-provisioned membership | Refused, `membership_requires_account`. Unchanged |
| UL5 | Self-unlink while a portal administrator, removing their last norstec.no address | Refused (B9) |
| UL6 | Administrator unlinks an org account and leaves the address | Allowed. The address stays, so the person is still recognised. Removing it is the deliberate second step |
| UL7 | UL6, then the same Google account signs in again | It re-links to the same profile — the address and `provider_id` still name it. Membership is policy-gated, so this is now harmless where it used to be the whole reason for the retention rule |
| UL8 | Administrator unlinks the last account of a duplicate so it can be merged | Allowed. This is what the admin unlink exists for |

### Merge

| # | Situation | Expected |
|---|---|---|
| MG1 | Target holds a Norstec account, source an Orbit account | Allowed if the merged person stays within the cap. A Norstec account is never the folded-in side |
| MG2 | Combined accounts exceed the cap | Refused. An administrator unlinks one first |
| MG3 | Both sides hold a membership in the same organization, one `active`, one `ended` | The active one survives. A merge never resurrects an ended membership |
| MG4 | Both sides are members of the same organization with different roles | The higher role survives |
| MG5 | Source holds an alumni grant | Carried over — `least()` of the two timestamps, so the earlier grant wins. Existing behaviour, worth a test |
| MG6 | Both sides are portal administrators | Refused. Unchanged |
| MG7 | Source holds a pending access request | It has to move with the person or be withdrawn. Leaving it pointing at a deleted profile is how an approver ends up acting on nobody |
| MG8 | Source holds an `external_accounts` row from the directory | Moves with the person. Existing behaviour |
| MG9 | The merged person would hold two addresses on the same organization domain | Allowed as data — the directory sync already reports the second one as unmatched rather than failing |

### Access requests

| # | Situation | Expected |
|---|---|---|
| AR1 | Request for an organization the person is already an active member of | Refused. Nothing should reach an approver that approval cannot change |
| AR2 | Alumni request when alumni access is already granted | Refused. Unchanged |
| AR3 | Alumni request while holding an active membership | Allowed. Alumni access is about what survives the membership, so it is not a contradiction |
| AR4 | Auto-join happens while a request for that organization is pending | The request is withdrawn in the same transaction, audited (B8) |
| AR5 | Request approved for a person whose `ended` membership exists | Reactivates the row. Same as SI5 |
| AR6 | Request declined, then a new request for the same organization | Allowed. A decline is not a ban — that is what suspension is for |
| AR7 | Request pending when the person is suspended or deleted | The decline and cleanup paths already handle it, and the `security definer` rewrite that broke this once is why the suite covers it |

### Directory sync

| # | Situation | Expected |
|---|---|---|
| DS1 | Account matched by `provider_id` | Linked to the right person. The stable path |
| DS2 | Account matched only by address, where that address carries a different `provider_id` | Mis-attributed until the new employee signs in. **Accepted** — judged not worth fixing, since address recycling does not happen in practice at Norstec. The one-line guard is in the migration comments if it ever does |
| DS3 | Account suspended in the directory while the membership is active | Recorded, membership untouched, surfaced to administrators. Automatic ending is open question 2 |
| DS4 | Account disappears from the directory entirely | The `external_accounts` row is deleted by the sync. The membership and the portal account are untouched |
| DS5 | One person holds two accounts on the same domain | The second is imported unlinked and appears in the unmatched report. Unchanged |
| DS6 | Orbit and Ignite | No sync at all. Their identity comes from `hd` and their authorization from approval, which is why `request` is the default policy |

### Person lifecycle

| # | Situation | Expected |
|---|---|---|
| PL1 | Suspend a person with active memberships | Sign-in blocked, memberships untouched, and re-evaluation refuses on status (RS5) |
| PL2 | Soft delete, then the same account signs in | Blocked with `deleted`. See SI20 |
| PL3 | Restore | Everything comes back, including the addresses that made the match work |
| PL4 | Purge | Addresses go. The next sign-in with that Google account is a genuinely new person, which is the point |
| PL5 | Self-service account deletion | Follows the same lifecycle. Worth re-testing once addresses become removable, because the deletion flow assumed they were not |
| PL6 | Administrator removes an address that is somebody's last norstec.no while they hold the portal admin role | Refused (B9) |
| PL7 | Administrator removes an address that still has a sign-in account | Refused, `email_has_sign_in_account`. The UI shows this as a disabled button with a reason instead of an error |
| PL8 | Administrator removes the last address of an active member | Refused, `member_must_keep_email`. Unchanged |

### Domains and policy

| # | Situation | Expected |
|---|---|---|
| DP1 | Register a domain already registered to another organization | Refused by the unique constraint, with a message naming the other organization |
| DP2 | Register a public mailbox provider — gmail.com, outlook.com | Refused by the blocklist (B2). Without it, one typo converts every personal address in the portal into a locked organization address, and under `auto` grants everybody a membership |
| DP3 | Register a domain that captures many existing addresses | Allowed, but the confirmation step shows how many addresses and how many memberships it would produce before anything happens |
| DP4 | Remove a domain while memberships provisioned by it are active | Memberships stay. The addresses become personal again, and therefore self-removable — say so at the point of removal |
| DP5 | Organization deactivated while its domain is registered | No new memberships (SI17). Existing ones are an administrator's problem, not the trigger's |
| DP6 | Policy set to `auto` on an organization with many existing non-member profiles | They join as they sign in, one at a time, through B4a. Nothing happens in bulk — worth saying out loud, because an administrator flipping the switch will expect either everything at once or nothing |

### Concurrency and the awkward remainder

| # | Situation | Expected |
|---|---|---|
| CR1 | The same person signs in with two org accounts before linking either | Two profiles. Unavoidable, and what merge is for. **Accepted** |
| CR2 | Two sessions, two tabs, one linking flow | Serialised by the `for update` on the destination profile (LK13) |
| CR3 | Gmail dot and plus variants of the same mailbox | Treated as different addresses, so the same person can hold both. Google normalises them; the portal does not. **Accepted**, but it is how a duplicate profile gets created without anybody making a mistake |
| CR4 | Shared or role account (`post@orbitntnu.com`) linked to a person | Not prevented. The Directory API reports role accounts, but not for organizations the portal cannot see. Open question 3 |
| CR5 | An address the portal has never seen presented by a `hd`-verified account for a domain with `auto` | Membership on first sign-in with no human in the loop. That is the intended design of `auto`, and the reason `request` is the default for organizations whose Workspace the portal cannot check |

Three of these are UI tests rather than database tests: the `/access` copy for
SI2 and SI4, the profile page showing no removal button for an organization
account (UL2), and the domain confirmation step showing the affected count
(DP3).

## Tests

- pgTAP, in the existing authorization suite: every row above that is not marked
  otherwise. The suite already covers unlink, merge and access requests, so most
  of these extend existing sections rather than starting new ones.
- vitest: the pure part of the policy resolution — given a hosted domain, a
  policy and a membership history, what should happen — so the table above is
  readable as a test file and not only as SQL.
- `pnpm db:test` after every migration in this plan. The suite has caught a
  `security definer` function losing statements in a rewrite before.

## Open questions

1. ~~**Does `hd` reach `raw_user_meta_data`?**~~ Answered from the GoTrue
   v2.194.0 source: yes, under `custom_claims`, on the ID token path. See B1.
   What remains is confirming the hosted version behaves the same, which is one
   look in the dashboard.
2. **Should directory suspension end a membership?** Standard SCIM practice says
   deprovisioning flows from the directory. `set_workspace_account_suspended`
   already records the state. Ending memberships automatically is a large,
   irreversible-feeling action; flagging it for an administrator is the safer
   first version, with automation as an opt-in per organization later.
3. **Shared and role accounts.** Nothing stops `post@orbitntnu.com` from being
   linked to a person, and the Directory API reports whether an account is a
   role account. Worth refusing at link time once Orbit's directory is
   reachable — which it is not today.
4. **Orbit and Ignite directory sync.** `sync_workspace_directory` is hardcoded
   to `private.norstec_organization_id()`. Making it per-organization needs each
   organization to grant API access to their own Workspace. Real work, and not
   worth starting before an organization asks for it. Until then those two
   organizations have identity through `hd` and authorization through approval,
   which is the whole point of the policy default being `request`.

## Order of work

1. ~~Verify `hd`~~ — done. Confirmed on a production account:
   `custom_claims.hd = "norstec.no"`.
2. ~~B1, B2, B3~~ — done, in `20260819010000_record_hosted_domain.sql`,
   `20260819010100_organization_domain_administration.sql` and
   `20260819010200_organization_join_policy.sql`. No behaviour change: nothing
   reads the new columns yet, and Norstec is seeded to `auto`, which is exactly
   what the domain rule does today. 23 pgTAP cases added, suite at 219.
3. ~~B4 and B4a~~ — done, in `20260819010300_domain_join_decision.sql`.
   `private.apply_domain_join` is the only code that inserts a domain
   membership; the provisioning trigger and `complete_portal_account_link` both
   call it, and `public.apply_own_domain_join` is what the sign-in callback
   asks on every sign-in. Suite at 232.

   Two things this changed that are worth knowing before the next step. The
   membership now rests on the `hd` claim, so a Workspace account that reaches
   the portal through GoTrue's legacy userinfo path joins nothing until it
   presents the claim — the pgTAP fixtures had to grow `custom_claims` for the
   same reason. And `/auth/callback` now sends an unapproved organization
   account to `/access?organization=<slug>&returning=true`, which the request
   page does not read yet; it is inert until step 5.
4. ~~B5, B6, B9~~ — done, in `20260819010400_account_capacity_per_domain.sql`,
   `20260819010500_address_claim_requires_proof.sql` and
   `20260819010600_portal_admin_keeps_norstec_identity.sql`. Suite at 240.

   B6 turned out to change more than the SI10 row predicted. An unproven
   account presenting an organization address no longer claims the imported
   profile, so it becomes a *new* person — and a new person on an organization
   address goes through onboarding, which means the join decision returns
   `onboarding` rather than `unproven`. The refusal is audited as
   `auth.address_claim_unproven`, which is the row an administrator needs to
   tell a conflicting account from a genuine one.
5. UI: `/access` preselection, onboarding routing, the administration cards for
   addresses, domains and policy.
6. B7 and the profile page last, once no membership depends on an address
   surviving.

Steps 2 and 3 are worth landing separately even though they feel like one
change. After step 2 the portal behaves identically and the data is in place;
after step 3 the decision has moved. If something is wrong, that boundary is
where it will be visible.
