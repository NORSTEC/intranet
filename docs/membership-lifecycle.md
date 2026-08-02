# Membership lifecycle

This document is the source of truth for membership, alumni, portal access, and
offboarding behavior. Product copy and authorization tests must follow these
rules.

## Concepts

- A **person** is the long-lived Norstec profile.
- An **organization membership** belongs to exactly one person and one
  organization. Its current state is `active` or `ended` in the member-facing
  product.
- A **membership period** preserves every separate active interval. Reactivation
  starts a new period instead of rewriting old history.
- **Alumni** is a derived person-level label: no active organization memberships
  and at least one ended organization membership.
- **Portal access** is separate from membership. Alumni keep ordinary portal
  access until they choose `Leave portal` or a portal administrator suspends it.

## Derived person status

```mermaid
flowchart TD
    A["Evaluate organization memberships"] --> B{"Any active membership?"}
    B -- Yes --> C["Active"]
    B -- No --> D{"Any ended membership?"}
    D -- Yes --> E["Alumni"]
    D -- No --> F{"Pending access request?"}
    F -- Yes --> G["Applicant"]
    F -- No --> H["No membership"]
```

The `Active` and `Alumni` labels above do not replace account status. A person
can be an alumnus while portal access is enabled, suspended, or deactivated.

## Ending an organization membership

```mermaid
flowchart TD
    A["Organization admin selects End membership"] --> B{"Last active organization admin?"}
    B -- Yes --> C["Block and require another admin"]
    B -- No --> D["End only the selected organization membership"]
    D --> E["Close its open membership period"]
    E --> F["End open team roles in that organization"]
    F --> G["Remove active organization-admin authority"]
    G --> H{"Any other active organization membership?"}
    H -- Yes --> I["Person remains Active"]
    H -- No --> J["Person is now Alumni"]
    J --> K{"Personal email registered?"}
    K -- Yes --> L["Portal sign-in can continue through the linked personal identity"]
    K -- No --> M["Show sign-in-risk warning; never block offboarding"]
```

Ending a membership must never depend on the person having a personal email.
No notification email is sent while the portal is in its test phase. A future
notification should be advisory and must not become a database precondition.

## Reactivation

```mermaid
flowchart TD
    A["Organization admin selects Reactivate"] --> B{"Ended membership exists?"}
    B -- No --> C["Reject invalid transition"]
    B -- Yes --> D{"Person has at least one registered email?"}
    D -- No --> E["Block until an email is registered"]
    D -- Yes --> F["Set selected membership active"]
    F --> G["Reset current role to member"]
    G --> H["Start a new membership period"]
    H --> I["Do not reopen old team roles"]
    I --> J["Person is Active"]
```

Reactivation affects only the selected organization. Former admin permissions
and team roles are historical and require explicit new assignments.

## Domain account behavior

```mermaid
flowchart TD
    A["Verified Google sign-in"] --> B{"Known portal account or registered email?"}
    B -- Yes --> C["Link to existing person"]
    B -- No --> D["Create person and portal account"]
    C --> E{"Membership already exists for matched domain organization?"}
    D --> E
    E -- No --> F["Create first active domain membership"]
    E -- Yes --> G["Keep existing membership state unchanged"]
    G --> H["Never reactivate an ended membership during sign-in"]
```

Organization lifecycle is controlled by administrators, not by later changes
to an authentication identity or email domain.

## Linking another Google account

```mermaid
flowchart TD
    A["Signed-in person opens Sign-in accounts"] --> B["Select Link Google account"]
    B --> C["Google verifies ownership of the additional account"]
    C --> D{"Email already belongs to another portal profile?"}
    D -- Yes --> E["Stop and require portal-admin duplicate review"]
    D -- No --> F["Attach Google identity to the same Auth user and person"]
    F --> G{"Approved organization domain?"}
    G -- No --> H["Register as personal sign-in; create no membership"]
    G -- Yes --> I{"Organization membership already exists?"}
    I -- No --> J["Create first active membership for that organization"]
    I -- Yes --> K["Keep existing membership state unchanged"]
```

Both active members and alumni may link a personal Google account. Linking it
while the organization account still works is the recommended offboarding
preparation. A personal account is authentication only and never grants an
organization membership.

An unknown account must not be matched by name or email similarity. The sign-in
page tells existing users to sign in with an already linked account first and
then link the new account from their profile. Duplicate people that already
exist require a separate portal-admin repair workflow.

For every deployed Supabase environment, manual identity linking and the
`/auth/link-callback` redirect must be enabled. During the test phase, the
`identity linked` and `identity unlinked` security notification templates must
remain disabled so the flow sends no email.

## Leaving the portal

```mermaid
flowchart TD
    A["Person selects Leave portal"] --> B{"Any active organization membership?"}
    B -- Yes --> C["Block: organization membership must be ended first"]
    B -- No --> D{"Portal administrator?"}
    D -- Yes --> E["Block until portal-admin responsibility is transferred"]
    D -- No --> F["Set portal access to deactivated"]
    F --> G["Sign out all refresh-token sessions"]
    G --> H["Keep membership periods and required audit history"]
```

`Leave portal` is not GDPR erasure. Re-enabling a deactivated account requires a
controlled administrator process. Full erasure is a separate portal-admin
workflow that must handle Auth identities, Storage objects, personal profile
data, legal retention, and audit anonymization together.

## Edge-case decisions

| Edge case | Required behavior |
| --- | --- |
| Person belongs to several organizations | Ending one membership leaves the others active. |
| Last active membership ends | Person becomes Alumni and retains portal access. |
| Ended organization membership is reactivated | Only that organization is activated; a new period starts. |
| Former organization admin is reactivated | Role is `member`; admin must be assigned again. |
| Open team roles exist | They end on the membership end date and never reopen automatically. |
| Only organization email exists | Ending is allowed; UI warns about future sign-in risk. |
| Active member links a personal Google account | Allow it as a backup sign-in; create no membership. |
| Person links a second approved organization account | Keep one person and create only the missing organization membership. |
| Linked domain membership already ended | Keep it ended; identity linking never reactivates it. |
| Linked email belongs to another profile | Block linking and require controlled duplicate review. |
| Existing user arrives with an unknown account | Instruct them to sign in with an existing account and link it from Profile. |
| Alumni wants a future membership | No alumni application flow in the current release. |
| Domain user signs in after being ended | Sign-in must not reactivate the membership. |
| Last active organization admin is ended | Block until another active organization admin exists. |
| Portal administrator manages an organization | Portal-admin authority remains system-wide and separate. |
| Organization is archived | Active memberships require an explicit bulk transition plan; never silently delete history. |
| Repeated or concurrent status action | Lock the membership row and make identical transitions idempotent. |
| Ordinary admin selects Delete | Hard deletion is unavailable; use End membership. |
| Person wants to leave the portal | Deactivate portal access after all active memberships have ended. |
| Person requests GDPR erasure | Use a separate global workflow; never treat membership deletion as erasure. |
