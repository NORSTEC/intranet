# Integration and notification flows

## Synchronize Google Workspace

The portal reads the complete directory before changing its database snapshot.

```mermaid
flowchart TD
    A["Portal admin at AAL2 selects Sync Workspace"] --> B{"Production federation configured?"}
    B -- "No" --> X1["Stop without database changes"]
    B -- "Yes" --> C["Exchange Vercel OIDC identity through Google STS"]
    C --> D["Impersonate scoped service account"]
    D --> E["Read all Workspace user pages"]
    E --> F{"Any API or parsing failure?"}
    F -- "Yes" --> X2["Stop; keep previous complete snapshot"]
    F -- "No" --> G["Send one complete JSON snapshot to database RPC"]
    G --> H["Match each account against every known person email"]
    H --> I{"More than one Workspace account matches one person?"}
    I -- "Yes" --> J["Link first deterministic match; keep others unmatched"]
    I -- "No" --> K["Keep matched person or unmatched null"]
    J --> L["Upsert status, immutable external ID and provider details"]
    K --> L
    L --> M["Remove snapshot rows no longer present in Google"]
    M --> N["Audit matched, unmatched and removed counts"]
    N --> O["Show reconciliation report"]
```

## Suspend or reactivate a Workspace account

This is the portal's only external account write.

```mermaid
flowchart TD
    A["Portal lifecycle action requires Workspace change"] --> B{"Matched Workspace external ID exists?"}
    B -- "No" --> X1["Report reconciliation needed"]
    B -- "Yes" --> C{"Snapshot says Google super administrator?"}
    C -- "Yes" --> X2["Blocked: change in Google Admin console"]
    C -- "No" --> D["Exchange deployment identity for Google access"]
    D --> E["PATCH suspended=true or false in Google"]
    E --> F{"Google accepts update?"}
    F -- "No" --> X3["Keep portal decision and report external failure"]
    F -- "Yes" --> G["Update external_accounts status"]
    G --> H["Write Workspace audit event"]
    H --> I["Next full sync confirms external state"]
```

## Synchronize Slack

Slack integration is read-only.

```mermaid
flowchart TD
    A["Portal admin at AAL2 selects Sync Slack"] --> B{"Vercel Connect connector configured?"}
    B -- "No" --> X1["Stop without database changes"]
    B -- "Yes" --> C["Exchange Vercel OIDC identity for short-lived Slack token"]
    C --> D["Read paginated users.list results"]
    D --> E{"HTTP 429 rate limit?"}
    E -- "Yes" --> F{"Already retried this request?"}
    F -- "No" --> F2["Wait Retry-After up to 30 seconds"]
    F2 --> D
    F -- "Yes" --> X2
    E -- "No" --> G{"API or payload failure?"}
    G -- "Yes" --> X2["Stop; keep previous complete snapshot"]
    G -- "No" --> H["Exclude bots, apps and Slackbot"]
    H --> I["Match people by email; keep missing-email users unmatched"]
    I --> J["Upsert active/deactivated status and Slack account details"]
    J --> K["Remove rows no longer present in Slack"]
    K --> L["Audit matched, unmatched and removed counts"]
    L --> M["Show read-only reconciliation report"]
    M --> N["Administrator performs any deactivation directly in Slack"]
```

## Decision-email outbox

Approval, rejection and final-membership-ending decisions use the same queue.

```mermaid
flowchart TD
    A["Authorized decision RPC starts transaction"] --> B["Apply access or membership state change"]
    B --> C["Choose recipient and copy minimal payload"]
    C --> D["Insert private pending notification"]
    D --> E{"Transaction commits?"}
    E -- "No" --> X1["Rollback decision and notification"]
    E -- "Yes" --> F["Return success to administrator immediately"]
    F --> G["after-response drain claims up to 20 authorized rows"]
    G --> H["Increment attempts and lock claim for five minutes"]
    H --> I{"Known template kind?"}
    I -- "No" --> X2["Leave row for investigation"]
    I -- "Yes" --> J["Render escaped HTML and plain text"]
    J --> K{"Resend configured?"}
    K -- "No" --> L["Log subject only outside recipient-bearing production logs"]
    K -- "Yes" --> M["Send with 10-second timeout"]
    L --> N["Settle as delivered"]
    M --> O{"Send succeeds?"}
    O -- "Yes" --> N
    O -- "No" --> P["Release claim and store short error"]
    N --> Q["Delete queue row immediately"]
    P --> R{"Attempts below five and row younger than seven days?"}
    R -- "Yes" --> S["Next causing admin or portal admin may retry"]
    S --> G
    R -- "No" --> T["Nightly retention job discards stale row"]
```
