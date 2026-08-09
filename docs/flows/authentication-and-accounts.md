# Authentication and account flows

## Sign-in and destination

Covers `/login`, `/auth/callback`, `private.before_user_created`, the
`auth.identities` guards and `apply_own_domain_join`.

```mermaid
flowchart TD
    A["User selects Sign in with Google"] --> B["Google OAuth"]
    B --> C{"OAuth completed with a code?"}
    C -- "No" --> X1["/login?error=oauth_callback"]
    C -- "Yes" --> D{"Stable Google subject is safe?"}
    D -- "Different subject already owns email" --> X2["Reject sign-in and preserve existing account"]
    D -- "Safe" --> E["Exchange code for Supabase session"]
    E --> F{"Portal account exists?"}
    F -- "No" --> X3["/login?error=authorization"]
    F -- "Yes" --> G{"Person is active and not deleted?"}
    G -- "No" --> H["Revoke session and sign out"]
    H --> X4["/login?error=deleted or suspended"]
    G -- "Yes" --> I{"Organization account onboarding pending?"}
    I -- "Yes" --> J["/onboarding/account"]
    I -- "No" --> K["Run trusted domain-join decision"]
    K --> L{"Active/ended membership or alumni access exists?"}
    L -- "Yes" --> M["Portal home / "]
    L -- "No" --> N{"Domain decision says request?"}
    N -- "Yes" --> O["/access with organization preselected"]
    N -- "No" --> P["/access"]
```

## First Google identity and profile provisioning

Provisioning runs inside the database when Supabase creates or updates a Google
user.

```mermaid
flowchart TD
    A["Verified Google user arrives"] --> B{"Provider is Google and email is verified?"}
    B -- "No" --> X1["Do not create a portal account"]
    B -- "Yes" --> C["Read subject and hosted-domain claim"]
    C --> D{"Existing portal account for this Auth user?"}
    D -- "Yes" --> E["Synchronize email, subject, domain and last seen"]
    D -- "No" --> F{"Email already exists in person_emails?"}
    F -- "No" --> G["Create a new person and primary email"]
    F -- "Yes" --> H{"Stored subject conflicts?"}
    H -- "Yes" --> X2["Block recycled-address takeover"]
    H -- "No" --> I{"Existing address is organization-owned?"}
    I -- "No" --> J["Attach login to existing person"]
    I -- "Yes" --> I2{"Matching hosted domain is proven?"}
    I2 -- "No" --> X3["Do not claim another person's organization address"]
    I2 -- "Yes" --> J
    G --> K["Create portal_accounts row"]
    J --> K
    K --> L{"Hosted organization account?"}
    L -- "Yes" --> M["onboarding_status = pending"]
    L -- "No" --> N["onboarding_status = complete"]
    E --> O["Identity trigger keeps trusted copy synchronized"]
    M --> O
    N --> O
```

## First organization-account onboarding

```mermaid
flowchart TD
    A["Pending organization account opens /onboarding/account"] --> B{"Use an existing profile?"}
    B -- "Yes" --> C["Start account-link flow"]
    C --> D{"Link checks pass?"}
    D -- "No" --> X1["Show linking error or route to admin merge"]
    D -- "Yes" --> E["Move login to existing person and remove empty duplicate"]
    B -- "No, create profile" --> F["Mark onboarding complete"]
    E --> G["Run domain-join decision"]
    F --> G
    G --> H{"Decision outcome"}
    H -- "joined or already member" --> I["Portal home / "]
    H -- "request or previous membership" --> J["/access with organization preselected"]
    H -- "unproven or no organization" --> K["/access"]
```

## Link another Google account

This flow never replaces the browser's existing portal session.

```mermaid
flowchart TD
    A["Signed-in user selects Add account or Use existing profile"] --> B["Create random 10-minute link intent"]
    B --> C{"Caller state valid for selected mode?"}
    C -- "No" --> X1["Stop with start error"]
    C -- "Yes" --> D["Store only SHA-256 token hash in database"]
    D --> E["Start Google OAuth in isolated server client"]
    E --> F["Store raw token and PKCE verifier in path-scoped HttpOnly cookies"]
    F --> G{"Callback contains code and matching token?"}
    G -- "No" --> X2["Expire cookies and show OAuth error"]
    G -- "Yes" --> H["Exchange code in server memory"]
    H --> I{"Intent unexpired and both account states valid?"}
    I -- "No" --> X3["Expire cookies and show link error"]
    I -- "Yes" --> J{"Same Auth account?"}
    J -- "Yes" --> X4["Reject same account"]
    J -- "No" --> K{"Profile that would be discarded contains memberships, requests, teams or history?"}
    K -- "Yes" --> X5["Require portal-admin merge"]
    K -- "No" --> L{"Another login already occupies this domain bucket?"}
    L -- "Yes" --> X6["Reject capacity conflict"]
    L -- "No" --> M["Attach second Auth user to surviving person"]
    M --> N["Transfer safe email and identity data"]
    N --> O["Delete empty duplicate person"]
    O --> P["Run domain-join decision"]
    P --> Q["Expire link cookies"]
    Q --> R["/profile?accountLinked=true"]
```

## Unlink a Google account

```mermaid
flowchart TD
    A["User or portal admin selects a linked account"] --> B["RPC locks person and account"]
    B --> C{"Account belongs to allowed person?"}
    C -- "No" --> X1["Blocked"]
    C -- "Yes" --> D{"Is it the last sign-in account?"}
    D -- "Yes" --> X2["Blocked: keep one account"]
    D -- "No" --> E{"Portal admin would lose last NORSTEC login?"}
    E -- "Yes" --> X3["Blocked: hand over role first"]
    E -- "No" --> F{"Active membership depends on this domain account?"}
    F -- "Yes" --> X4["Blocked: end membership first"]
    F -- "No" --> G{"Also remove its email?"}
    G -- "No" --> J["Release portal account and Auth identity"]
    G -- "Yes" --> H{"Organization address or last member address?"}
    H -- "Yes, ordinary user" --> X5["Blocked or require portal admin"]
    H -- "No" --> I["Remove or replace primary email safely"]
    I --> J
    J --> K["Revoke sessions for removed Auth user"]
    K --> L{"Removed account is current browser session?"}
    L -- "Yes" --> M["Sign out and redirect to /login"]
    L -- "No" --> N["Refresh /profile"]
```

## Administrator MFA elevation

```mermaid
flowchart TD
    A["User opens an administration route"] --> B{"Active portal or organization-admin role?"}
    B -- "No" --> X1["Redirect to portal home"]
    B -- "Yes" --> C{"JWT assurance level is AAL2?"}
    C -- "Yes" --> D["Allow scoped administration"]
    C -- "No" --> E["/profile/security?mfa=required"]
    E --> F{"Verified TOTP factor exists?"}
    F -- "No" --> G["Enroll factor and show QR/secret"]
    G --> H["Verify six-digit code"]
    F -- "Yes" --> H
    H --> I{"Supabase accepts challenge?"}
    I -- "No" --> E
    I -- "Yes" --> J["Session becomes AAL2"]
    J --> D
    D --> K{"User removes factor?"}
    K -- "No" --> D
    K -- "Yes" --> L["Unenroll factor and refresh token immediately"]
    L --> M{"Refresh succeeds?"}
    M -- "Yes" --> N["Session returns to AAL1; admin actions lock"]
    M -- "No" --> O["Local sign-out and /login"]
```
