# Slack

Norstec's Slack workspace is the other half of what
[Google Workspace](google-workspace.md) does. The portal reads the member list,
links each Slack account to the person who owns it, and reports the ones nobody
owns. It creates nothing, deactivates nothing, and — for now — touches no
channel.

## Read-only, on purpose, twice over

Two independent reasons point the same way, and it is worth keeping both in
mind, because only one of them will go away.

**Slack Pro has no API for deactivating a member.** `admin.users.*` and SCIM
are Business+ and Enterprise Grid features. So the mirror the Workspace side
maintains — suspend the portal account, suspend the Google account — has no
Slack counterpart to write. A button here could only have recorded something
the portal had not done, and the row would then claim a person was deactivated
while they kept posting. `private.soft_delete_person_row` is deliberately left
alone for the same reason: it suspends `provider = 'google_workspace'` rows
because the caller really does suspend the Google account.

**The portal is not in production yet.** Until it is, the Slack app holds read
scopes only, so no mistake in this code can reach the workspace people rely on
every day. Channel management is designed below and deliberately not built.

The second reason expires. The first does not, unless the plan changes.

## What the portal stores

The same `public.external_accounts` inventory the Workspace directory uses, with
`provider = 'slack'`. Everything that table needed for a nullable `person_id`,
an unmatched report and a `last_synced_at` was added when Google shipped;
`sync_slack_directory` adds a function and no schema.

`external_id` is Slack's user id — `U…` — because a display name or an address
can change and the id cannot.

Two things differ from the Google sync:

- **An account with no address is imported, not skipped.** Slack holds members
  it has no email for: guests invited by phone, accounts older than whatever
  rule the workspace has now. One of those belonging to nobody in the portal is
  exactly the row the report exists to surface. Workspace guarantees an
  address, so the Google sync can require one.
- **`deleted` means deactivated.** Slack keeps the account and everything it
  ever wrote; it is the nearest thing Slack has to a suspended Workspace
  account, and it is recorded as `status = 'suspended'` so one report can read
  both providers. An account that stops appearing in `users.list` has been
  removed from the workspace outright, and its row goes with it.

  The screen deliberately does not repeat the stored word. "Suspended" already
  means *portal access* in this codebase, and the two are unrelated — a
  deactivated Slack account says nothing about whether somebody can sign in
  here, and the portal cannot change the Slack one at all. The column is headed
  **Account status** and reads Active or Deactivated, which is what Slack's own
  member admin calls it.

  The sibling column is **Account type**: Owner, Workspace admin,
  Multi-channel guest, Single-channel guest, Member. Same reasoning — those are
  Slack's words, so an administrator with both screens open is reading one
  vocabulary. The single departure is Workspace admin, because Slack's plain
  "Admin" already means two other things here. Both columns filter and sort,
  and account type sorts by rank rather than alphabetically so owners and
  admins group together instead of scattering into the middle.

Bots, app users and Slackbot are filtered out in the client rather than stored.
They never match anybody, and leaving them in would fill the unmatched table —
whose whole value is that everything in it deserves a look — with rows nobody
can act on.

Three facts Google has no equivalent for live in `provider_details`, a jsonb
column rather than three typed ones: the `@handle`, whether somebody is a
single- or multi-channel guest, and whether they administer the workspace.
`external_accounts` is a shared inventory, and `is_guest` would be a column
meaningless for every Google row in it — the sort of thing that accumulates
until nobody can tell which columns apply to what.

The column is replaced rather than merged on each sync, so somebody who stops
being a guest, or loses the admin role, loses the key instead of keeping a
stale one.

Guest type is kept apart from a single "guest" flag because the two have
different costs: single-channel guests are free on Pro, multi-channel guests
take a paid seat like a full member. Alumni are the obvious future population
of both.

## Matching

By address, against every address the portal knows for a person, the same way
Google matches. One person can hold two addresses the portal knows and the
table allows only one linked row per person per provider, so the second account
is imported unlinked and appears in the report rather than aborting the sync.

Somebody whose Slack address is their personal one, and who has never added it
to their portal profile, lands in "Not in the portal". That is not a bug in the
matching — it is the portal correctly saying it cannot prove those two accounts
are the same person.

## Authentication

No credential exists in this repository or in the environment. Vercel signs a
short-lived OIDC token for the deployment, Vercel Connect exchanges it for a
Slack token, and the Slack OAuth grant lives with Vercel. This is the same
shape the Google integration uses, for the same reason: a static bot token
would sit in `process.env` for every dependency in the tree to read, would be
copied to every laptop that ran `vercel env pull`, and would never be rotated.

The exchange is one `POST` to `api.vercel.com`, so it is written out in
`src/lib/slack/directory.ts` rather than pulling in `@vercel/connect`. Unlike
Google's STS flow there is no signing, no refresh protocol and no credential
file to get wrong.

`SLACK_CONNECT_CONNECTOR` names the connector. It is the only Slack setting,
and its absence is what `isSlackConfigured()` reports so the portal hides the
sync button instead of failing on it.

### One thing to verify before channel writes

The Google trust is pinned to a single Vercel subject —
`owner:<team>:project:<project>:environment:production` — so a preview
deployment of a branch reaches nothing. Whether a Vercel Connect connector
draws the same line between production and preview has not been established
here. While the scopes are read-only it costs little either way. Before any
scope that can change a channel is added, confirm it, because a preview
deployment that can remove people from channels is a worse credential than the
static token this design avoided.

## What Slack cannot tell the portal

The one field this report most wants is **last activity**, and `users.list`
does not carry it. Slack exposes it through `admin.analytics.getFile` and
SCIM, both Business+ and Enterprise Grid. So the Google guidance — open the
account and look at the last sign-in before treating it as abandoned — has no
equivalent here, and "Not in the portal" cannot be narrowed to "and dormant".

Also unavailable or deliberately skipped: `has_2fa` needs an admin token rather
than a bot token; profile photos are Slack CDN URLs that would have to be
allow-listed in the image config for a picture the portal already has a better
version of; time zone and status text change too often to be worth storing.

## Slack app scopes

Bot token, read-only:

- `users:read` — the member list
- `users:read.email` — the addresses the matching runs on
- `team:read` — the workspace subdomain, for profile links

Adding a scope means reinstalling the app to the workspace. Slack answers a
missing one with `missing_scope`, which the portal translates into that
instruction.

## Syncing

`sync_slack_directory` takes the whole member list as one JSON snapshot and
applies it in one transaction, for the same reason the Workspace sync does:
row-by-row updates leave the table half-written whenever a request fails
midway.

**Administrator-triggered, not scheduled.** A cron job has no signed-in user,
so it would need a privileged Supabase key kept on the server, and this portal
holds none — every database call goes through row level security with the
caller's own token.

`users.list` is a Tier 2 method. The client pages at 200 and follows the cursor
to the end rather than silently truncating the picture the portal then presents
as complete; a 429 is retried once, using Slack's own `Retry-After`.

## Channels — designed, not built

The product intent is that role follows channel: everyone with an active
membership belongs in some channels, alumni belong in others, and losing a
membership means losing the member channels.

Decisions already made:

- **A member who becomes alumni loses the member channels.** So removal is part
  of the feature, not an optional extra.
- **Private channels require the bot to be invited to each one by hand.** A
  one-time job per channel, accepted.
- **Nothing runs against the real workspace first.** Test channels, then the
  real ones.

What Slack Pro allows, and what it costs:

| Operation | Method | Scope | Works on Pro |
| --- | --- | --- | --- |
| Read channels | `conversations.list` | `channels:read`, `groups:read` | Yes |
| Read members | `conversations.members` | same | Yes |
| Add | `conversations.invite` | `channels:write.invites`, `groups:write.invites` | Yes |
| Remove | `conversations.kick` | `channels:manage`, `groups:write` | **Verify** |

`conversations.kick` is the one to test before designing around it: Slack has
restricted bot tokens from removing users from public channels. If that holds,
removal needs a user token from an administrator — a worse credential than
anything else here — and the honest answer may be that the portal reports who
should be removed and a human does it.

`#general` cannot be managed. Everyone is a member and nobody can be removed.
Do not model it as a governed channel.

The table this needs does not exist yet. It keys on channel id, not name,
because names change and Slack keeps the id — the same reasoning that makes
`external_id` the key on `external_accounts`:

```
slack_channel_rules
  channel_id       -- C0123..., the key
  channel_name     -- display only, refreshed by the sync
  applies_to       -- 'member' | 'alumni' | 'team'
  team_id          -- when applies_to = 'team'
  enforce_removal  -- default false
```

Alumni is derived from ended memberships rather than stored on the person, so
the rule is a query, not a column.

Two constraints from the security model apply the moment this becomes a write:
the reconciliation must be idempotent and retryable, and a failed Slack request
must not corrupt membership state. `conversations.invite` is Tier 3 — roughly
50 calls a minute — so a full reconciliation of a growing workspace can outrun
a function timeout. Write it to take a batch and be safe to call again, which
is also what makes the durable queue in
[architecture.md](architecture.md) unnecessary until it isn't.
