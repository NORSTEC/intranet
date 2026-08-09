# Access and identity

## Concepts

- A Google account authenticates.
- A portal account links that login to one person.
- A membership grants organization membership.
- `organization_admin` and `portal_administrators` grant management scope.
- A verified MFA session (`aal2`) activates administrator authorization.

No email suffix, profile field or browser flag grants an administrator role.

See [Authentication and account flows](flows/authentication-and-accounts.md)
and [Membership and directory flows](flows/membership-and-directory.md) for
the complete decision paths.

## First sign-in

Only verified Google users are provisioned. The Auth hook checks new accounts,
and an `auth.identities` trigger plus unique index guards Supabase's separate
automatic-link path. A different Google subject on an existing address is
blocked before it can inherit the previous holder's Auth user.

Provisioning then:

1. Reads the stable Google subject from `auth.identities`.
2. Matches an existing portal account, then a safely claimable address.
3. Creates a person only when neither exists.
4. Records the Google login in `portal_accounts`.
5. Evaluates the hosted-domain claim through one domain-join function.

User-editable Auth metadata is sanitized on later updates and is never an
authorization source. The newest signed identity claim is authoritative; if it
no longer contains a hosted domain, the stored domain proof is removed.

## Domains and automatic membership

Automatic membership remains the default. It requires both:

- Google proves the account’s hosted domain; and
- the portal has verified domain ownership through a DNS TXT record.

The email text alone is not proof. Shared providers and institutional domains
such as Gmail and `ntnu.no` are reserved. A verified domain can create a first
`member` membership but never an administrator role.

An existing membership always wins over the domain rule. `ended`, `suspended`
or planned membership is not reactivated by another sign-in. Existing active
membership is idempotent.

## Linking Google accounts

Linking starts from an authenticated profile and uses a hashed, ten-minute
intent. Manual Supabase identity linking is disabled.

A person may hold one login for each verified organization-domain bucket plus
one personal login. Capacity is checked when the second Google account has
proved its identity and domain. Linking cannot absorb a profile that already
contains memberships, requests, history, teams or other non-empty data; it is
routed to administrator duplicate review.

Removing a login never silently removes membership. The last usable login,
the login supporting an active membership and a portal administrator’s last
NORSTEC login are protected.

## Membership lifecycle

| State | Meaning | Domain sign-in |
| --- | --- | --- |
| `planned` | Future relationship | no change |
| `active` | Current member | remains active |
| `suspended` | Temporarily blocked relationship | no change |
| `ended` | Former relationship | requires explicit review/reactivation |

Reactivation starts a new `membership_period` and uses the safe `member` role.
It does not restore a historical administrator role. Alumni access is a
person-level grant and does not create an organization membership.

## Administrator authorization

- Organization administrator: active person, active membership, role
  `organization_admin`, correct organization and AAL2.
- Portal administrator: active person, row in `portal_administrators`, AAL2.
- Portal administrators inherit organization administration for all active
  organizations.

Suspended, deactivated or deleted people receive no administrator permission,
even if a role row remains for history.

## Duplicate merge

Only a portal administrator at AAL2 may merge. The target survives.

A merge is refused when it would:

- delete the acting administrator;
- fold a portal administrator or protected NORSTEC identity into another row;
- transfer an organization-admin role to a target that does not already hold it;
- create two login accounts in the same domain bucket; or
- use a missing/deleted person.

The target keeps its chosen primary email and existing profile values. Privacy
uses the stricter setting. Duplicate pending requests are cancelled before
moving; the freshest external directory snapshot wins without violating
provider identifier uniqueness. The operation is transactional and audited.

## Directory visibility

`people.directory_visible = false` hides the person’s profile, contact address,
memberships, membership periods, teams and profile experience from ordinary
members. It applies to member, team and organization directories.

The person can still see and edit their own data. A correctly scoped
administrator at AAL2 can still manage it. Hiding a profile does not change
membership, login, notifications, retention or audit records.
