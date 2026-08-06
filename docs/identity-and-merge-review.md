# Identity, linking and merge review

A review of how Google account linking, profile merging, domain provisioning
and the Workspace directory interact, the holes that review found, and the
decisions taken to close them.

This document is a working reference for that work. When every migration below
has landed, its decisions and invariants belong in
[membership-lifecycle.md](membership-lifecycle.md) and this file goes away.

## The model as it stands

Three tables carry identity, and they are deliberately not the same thing.

| Table | What one row means | Limit |
| --- | --- | --- |
| `portal_accounts` | A Google account that can sign in to this profile | Two per person |
| `person_emails` | An address the portal knows the person by; globally unique | None |
| `memberships` | Authorization in one organization | One per person and organization |

Linking is a small merge rather than an identity attachment. The second Google
account signs in as its own Auth user, `private.provision_portal_user` creates a
fresh person for it, and `public.complete_portal_account_link` folds that person
into the initiator's — but only after proving it is empty. Everything the guard
list in `20260803030000_harden_account_linking.sql` rejects is a way that empty
check could have been false.

## Decisions

1. **The primary address is a contact address, not an identity.** Authorization
   rests entirely on `memberships` and `portal_accounts`, so nothing is granted
   or withdrawn by changing which address is primary. It is therefore safe for
   the person to set it themselves, and a portal administrator to set it for
   them. Every surface that shows an address shows the primary one, with no
   `email_type` preference anywhere.
2. **Linking an approved organization account still creates the missing
   membership.** It stays automatic, and it must never collide with alumni
   state in either direction.
3. **Unlinking a sign-in account keeps the address on the profile.** The address
   is a fact about the person; only the ability to sign in with it is removed.
   Deleting an address is an explicit portal-administrator action.
4. **The portal-administrator role reports, and blocks, but never revokes
   itself.** Portal management lists administrators without an active Norstec
   account, and `unlink_own_portal_account` refuses to remove an
   administrator's last norstec.no account. Continuous enforcement inside
   `is_portal_admin()` was rejected: it makes the Workspace sync a single point
   that can lock every administrator out at once, with no way back in.

## Invariants

The rules below are what "no dead states" means concretely. Each one names
where it is enforced today and what is missing. They are the acceptance
criteria for the migrations in the next section.

| # | Invariant | Today |
| --- | --- | --- |
| I1 | A person with at least one address has exactly one primary | A partial unique index prevents two. Nothing prevents zero. Held by construction so far, but decision 1 adds new writers |
| I2 | A person with an active membership has at least one address | `private.prevent_last_member_email_removal` |
| I3 | A person has at most two sign-in accounts | Checked in three RPCs, guaranteed by none |
| I4 | Every `portal_accounts.account_email` is an address on the same person | Not enforced. A Workspace rename onto an address another person holds breaks it (finding 7) |
| I5 | An active domain-provisioned membership has a linked account on that organization's domain | `membership_requires_account`, but only for `provisioning_method = 'domain'`, and approval overwrites that column |
| I6 | A portal administrator holds a norstec.no address or account | Checked when the role is granted, never again |
| I7 | An address the portal knows identifies at most one human over time | Not enforced. Matching is by address alone, so a recycled Workspace address inherits the previous holder's profile |

## Findings

Ordered by severity. File references are to the migration that currently
defines the behaviour, not necessarily where it was introduced.

1. **A merge can silently change the surviving person's contact address.**
   With no `p_primary_email`, `merge_people` picks the oldest `created_at`
   across both address sets (`20260814000000:322-331`). The admin action never
   passes that parameter, and its comment claims the opposite
   (`admin/actions.ts:499`). An imported duplicate's older, possibly dead
   address wins over the address the person actually uses.
2. **A Workspace rename leaves the old address behind, permanently claimed.**
   The trigger fires on `update of email`, inserts the new address as a second
   row, and leaves the old one — still primary, so still the address the
   directory shows. Nothing ever releases it, so if the Admin console reassigns
   that address to a new person, their first sign-in matches the old profile.
   That is account takeover with nobody doing anything wrong (I7).
3. **A merge blocked at three sign-in accounts cannot be unblocked.**
   `merge_people` rejects a combined count above two, and the only unlink RPC is
   `auth.uid()`-scoped. An administrator has no way to resolve it, and a
   duplicate nobody can sign in to is stuck forever.
4. **Nobody can set a primary address at all.** The only writer is the
   `merge_people` parameter the UI never sends. An alumnus whose organization
   address is dead has no way to be reachable in the directory.
5. **Three different rules decide which address is displayed.** `/members`
   (`members/page.tsx:137`) and the team roster
   (`teams/[teamSlug]/page.tsx:128`) prefer an organization address over the
   primary one; the member detail view and `/profile` use the primary only. The
   same person shows two addresses depending on the page, and setting a
   personal address primary would not change the directory.
6. **An ended member who still holds the organization account can mint a fresh
   active membership.** Unlink the account (allowed — the membership is ended),
   sign in with it again, choose "Create new profile". Domain provisioning is
   scoped to a person, not to an address, so the ended membership on the old
   profile does not block it. Decision 3 closes this.
7. **`portal_accounts.account_email` can name an address belonging to somebody
   else.** The trigger writes the column unconditionally while the address
   insert is `on conflict do nothing`. The Workspace sync then attributes the
   account to the wrong person (I4).
8. **Approving an access request overwrites `provisioning_method`.**
   `20260803020100:243` sets it to `access_request` on an existing row, so a
   membership that began as a domain grant escapes `membership_requires_account`
   and the organization account can then be unlinked with the membership still
   active (I5).
9. **The portal-administrator role outlives the identity it requires.** The
   norstec.no check runs only at grant time (`20260806000000:704`), and
   `is_portal_admin()` reads the table alone (I6).
10. **Linking an organization account creates a membership no organization
    administrator is told about.** The audit event exists but `audit_events` is
    portal-admin only, and the members list does not say how a membership
    arose. A borrowed or shared account is a working membership ticket.
11. **A person cannot see every address attached to them.** `/profile` derives
    its list from `portal_accounts`, so addresses from an import or a merge are
    invisible to their owner while `person_emails_authorized_read` exposes
    every `organization`-typed address to all members.
12. **A pending alumni request survives a membership arriving by linking.** It
    stays in the portal-admin queue and can still be approved, granting alumni
    access to an active member.
13. **`/profile` re-derives person status inline** (`profile/page.tsx:108`)
    instead of calling `derivePersonStatus`, which is the drift that function's
    comment was written to prevent. It says `Pending` where the rest of the
    portal says `No membership`.
14. Smaller: unlinking does not revoke the removed account's session; the
    `ProfileRow` type in `access.ts` omits `deactivated`, which
    `set_person_portal_access` can set.

What is already closed, and should stay closed: `sync_linked_google_identities`
was dropped, so a browser-side `auth.linkIdentity` call can no longer be cashed
in for a membership.

## Migrations

Append-only, one theme each. Order is by risk, not by number.

- **M1 `fix_merge_primary_email`** — when no primary is given, the target keeps
  the address it already had; the oldest-address fallback applies only when the
  target had none. Closes finding 1, establishes I1 in `merge_people`.
- **M2 `stable_google_identity`** — store Google's `sub` as
  `portal_accounts.provider_id`. The provisioning trigger *moves* the existing
  address row on a rename instead of adding a second one, and refuses to write
  `account_email` to an address held by another person. The Workspace sync
  matches on `external_id` first and falls back to the address. Closes findings
  2 and 7, establishes I4 and I7.
- **M3 `manage_person_emails`** — `set_own_primary_email`,
  `set_person_primary_email` and `remove_person_email` (portal admin, refusing
  an address a live sign-in account rests on). A constraint trigger enforces
  I1. Closes findings 4 and 11.
- **M4 `admin_unlink_portal_account`** — a portal administrator can unlink on
  someone's behalf, same guards, audited, sessions revoked. Unlinking keeps the
  address (decision 3). Closes findings 3, 6 and 14.
- **M5 `membership_proof_guards`** — stop overwriting `provisioning_method` on
  an existing row; widen `membership_requires_account` to any membership in an
  organization with a domain match; add the portal-admin norstec.no unlink
  guard from decision 4. Closes findings 8 and 9, establishes I5 and I6.
- **M6 `merge_invariants`** — post-conditions inside `merge_people` (I1, I3,
  I5), cancel pending alumni requests when a membership arrives, revoke moved
  accounts' sessions. Closes finding 12.
- **M7 `contact_email_visibility`** — narrow `person_emails_authorized_read` to
  the primary address for ordinary members, now that primary means contact
  address. Completes finding 11.

## Application changes

- One address rule everywhere: primary, no `email_type` preference. Remove the
  organization-first fallback in `/members` and the team roster.
- `Email` becomes `Contact email` in the member profile view, the directory
  column header, and the person page.
- `/profile` lists every address with its type, marks the contact address, and
  lets the person change it. Active members whose contact address is an
  organization address get the sign-in-risk warning that already exists for
  accounts.
- The person page gains address management and per-account unlink.
- The merge dialog previews the result — memberships that move, addresses,
  which one becomes the contact address, chosen explicitly — and warns when the
  duplicate carries an active membership the surviving profile does not have.
- The members list shows how a membership arose, so one created by linking is
  visible to an organization administrator (finding 10).
- Portal management lists administrators without an active Norstec account
  (decision 4).
- `/profile` reads `derivePersonStatus` (finding 13).

## Tests

Each finding gets a pgTAP case that fails before its migration. The scenarios
worth naming, because they are the ones that were reasoned about rather than
observed:

- Merge preserves the target's contact address; merge with an explicit primary
  honours it; merge of two profiles holding three accounts is refused and an
  administrator can then unlink one and retry.
- A Workspace rename keeps one address row, keeps the contact address current,
  and a recycled address does not match the previous holder.
- Linking never reactivates an ended membership, in either direction, and
  cancels a pending alumni request.
- An ended member who unlinks and signs in again lands on their own profile,
  not a new one.
- An organization account cannot be unlinked while any membership in that
  organization is active, whatever its `provisioning_method`.
- A portal administrator cannot unlink their last norstec.no account.
- `discard_abandoned_visitors` still never touches anyone holding alumni
  access.
