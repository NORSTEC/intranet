# Portal-administration flows

All flows in this document require a portal administrator with an AAL2 session
unless a branch explicitly says otherwise.

## Suspend or restore portal access

```mermaid
flowchart TD
    A["Portal admin selects Suspend or Restore"] --> B["Lock target person and validate action"]
    B --> C{"Target is deleted, invalid or protected by an admin-role guard?"}
    C -- "Yes" --> X1["Blocked; resolve role/lifecycle issue first"]
    C -- "No" --> D{"Requested portal status already set?"}
    D -- "Yes" --> E["No-op"]
    D -- "No" --> F["Update portal_access_status and audit"]
    F --> G{"Suspending?"}
    G -- "Yes" --> H["Revoke all portal sessions for the person"]
    G -- "No" --> I["Portal access becomes active"]
    H --> J{"Matched NORSTEC Workspace account needs suspension?"}
    I --> K{"Matched Workspace account needs reactivation?"}
    J -- "No" --> L["Finish portal change"]
    K -- "No" --> L
    J -- "Yes" --> M["Call Google Admin API, then record Workspace status"]
    K -- "Yes" --> M
    M --> N{"Google update succeeds?"}
    N -- "Yes" --> L
    N -- "No" --> O["Keep portal decision; report Workspace reconciliation needed"]
```

## Grant or revoke administrator roles

```mermaid
flowchart TD
    A["Administrator selects a role change"] --> B{"Role type"}
    B -- "Portal administrator" --> C{"Actor is another portal admin at AAL2?"}
    C -- "No" --> X1["Blocked"]
    C -- "Yes" --> D{"Grant or revoke?"}
    D -- "Grant" --> E{"Target active, not deleted and has NORSTEC login/address?"}
    E -- "No" --> X2["Blocked"]
    E -- "Yes" --> F["Insert portal_administrators row"]
    D -- "Revoke" --> G{"Target is actor or final portal admin?"}
    G -- "Yes" --> X3["Blocked"]
    G -- "No" --> H["Delete portal_administrators row"]
    B -- "Organization administrator" --> I{"Grant or demote?"}
    I -- "Grant" --> J{"Actor is portal admin at AAL2?"}
    J -- "No" --> X4["Blocked"]
    J -- "Yes" --> K{"Target person and membership are active?"}
    K -- "No" --> X5["Blocked"]
    K -- "Yes" --> L["Set membership role organization_admin"]
    I -- "Demote" --> M{"Actor administers the organization at AAL2?"}
    M -- "No" --> X6["Blocked"]
    M -- "Yes" --> N["Set membership role member"]
    F --> O["Write audit event and refresh authorization views"]
    H --> O
    L --> O
    N --> O
```

## Merge duplicate profiles

The target survives. The source is removed.

```mermaid
flowchart TD
    A["Portal admin selects target, source and optional contact email"] --> B["Validate distinct IDs and lock both people in ID order"]
    B --> C{"Both people exist and are not deleted?"}
    C -- "No" --> X1["Blocked"]
    C -- "Yes" --> D{"Source is actor, portal admin or protected NORSTEC identity?"}
    D -- "Yes" --> X2["Blocked or reverse merge direction"]
    D -- "No" --> E{"Source has an active organization-admin role target does not already hold?"}
    E -- "Yes" --> X3["Blocked: hand over role first"]
    E -- "No" --> F{"Combined accounts violate one-per-domain bucket?"}
    F -- "Yes" --> X4["Blocked: unlink an account first"]
    F -- "No" --> G["Make privacy sticky: target visible only if both were visible"]
    G --> H["Cancel duplicate pending requests"]
    H --> I["Merge memberships and periods without promoting target"]
    I --> J["Merge team rows, profile history and access requests"]
    J --> K["Keep freshest external provider snapshot"]
    K --> L["Move emails and preserve chosen/target primary address"]
    L --> M["Move portal accounts and audit references"]
    M --> N["Target keeps existing identity fields; source fills only safe blanks"]
    N --> O["Delete source person"]
    O --> P{"All person invariants still hold?"}
    P -- "No" --> X5["Rollback entire transaction"]
    P -- "Yes" --> Q["Write person.merged audit event"]
```

## Delete, restore or purge a person

```mermaid
flowchart TD
    A["Person requests deletion or portal admin deletes person"] --> B{"Person still has portal-admin role?"}
    B -- "Yes" --> X1["Blocked: hand over/revoke role first"]
    B -- "No" --> C["Lock person and snapshot deletion audit facts"]
    C --> D["End active memberships and close periods/team roles"]
    D --> E["Cancel pending requests"]
    E --> F["Set deleted_at and portal status suspended"]
    F --> G["Revoke all sessions and mark Workspace snapshot suspended"]
    G --> H["Attempt real Google Workspace suspension"]
    H --> I["Sign out self-deleting user globally"]
    I --> J["Recoverable deleted state for 30 days"]
    J --> K{"Portal admin restores before expiry?"}
    K -- "Yes" --> L["Clear deletion fields and restore previous portal status"]
    L --> M["Attempt Workspace reactivation"]
    M --> N["Person restored; memberships remain ended until explicit reactivation"]
    K -- "No" --> O{"30 days elapsed or admin confirms early purge?"}
    O -- "No" --> J
    O -- "Yes" --> P["Verify exact deleted_at to prevent stale-page purge"]
    P --> Q["Delete Auth users, identities, portal accounts and avatar"]
    Q --> R["Scrub personal values from retained audit details"]
    R --> S["Delete person and cascading personal rows"]
    S --> T["Record irreversible purge event without person reference"]
```

## Select or remove a contact address

```mermaid
flowchart TD
    A["Person or portal admin opens address management"] --> B{"Operation"}
    B -- "Choose contact address" --> C{"Address belongs to target person?"}
    C -- "No" --> X1["Blocked"]
    C -- "Yes" --> D["Lock all addresses and move the single primary flag"]
    D --> E["Audit contact-address change"]
    B -- "Remove address" --> F{"Address still has a linked sign-in account?"}
    F -- "Yes" --> X2["Blocked: unlink login first"]
    F -- "No" --> G{"Organization address removed by ordinary user?"}
    G -- "Yes" --> X3["Blocked: portal admin must release it"]
    G -- "No" --> H{"Would active member lose final address?"}
    H -- "Yes" --> X4["Blocked: member must keep an address"]
    H -- "No" --> I{"Removed address is primary?"}
    I -- "No" --> J["Delete address"]
    I -- "Yes" --> K["Promote another owned address, then delete"]
    J --> L["Audit address removal"]
    K --> L
```
