# Email

The portal sends three emails. All three follow a decision somebody else made
about a person, which is exactly why they exist: the portal shows all three
in-app, but the third one can take away the account the person would sign in
with, so waiting for them to look is not good enough.

| Trigger | Kind | Addressed to |
| --- | --- | --- |
| An access request is approved | `access_request_approved` | The address the request was made from |
| An access request is declined | `access_request_rejected` | The address the request was made from |
| The last active membership ends | `membership_ended` | A personal address if one is on file |

Nothing else is emailed, and nothing is sent to administrators.

## Why there is a queue

`private.pending_notifications` is written inside the same transaction as the
decision, by the `security definer` function that makes it. Two things follow
from that, and neither is available to a server action sending mail itself:

- **A decision that rolls back sends nothing.** There is no window where
  somebody has been told they are in and the database disagrees.
- **"Became an alumnus" is knowable at all.** It is not a column —
  `derivePersonStatus` derives it from how many active memberships remain — so
  the transition exists only inside `set_organization_membership_status`,
  between the update and the commit. Counting afterwards from the action races
  with anything else touching that person.

The declined case needs the queue for a third reason.
`private.discard_declined_applicant` erases the applicant in the same
transaction that queues their rejection email, so the row copies the name and
address onto itself and `person_id` is `on delete set null`. The email outlives
the profile it is about, because by the time it goes out there is no profile
left to read it from.

## How it drains

`drainNotifications` runs in `after()` at the end of the two server actions that
cause a decision. It claims, renders, sends, and settles each row.

The portal holds no privileged Supabase key — every write goes through a
`security definer` function as the signed-in person — so the drain runs as that
person too. `public.claim_pending_notifications` therefore hands over only rows
that person caused, plus anything stranded if they are a portal administrator.

**That administrator case is the only retry there is.** A send that fails keeps
its error in `last_error`, releases its claim, and waits for the next portal
administrator to make any decision at all. `attempts` gives up after five, and
`private.discard_stale_notifications` deletes anything older than seven days
each night.

This is a deliberate trade rather than an oversight. A background worker would
need a key that can read every member's name and address, standing, unattended,
in an environment variable. A late email is the cheaper failure.

A row that is sent is **deleted**, not marked. Keeping it would mean keeping a
record that we emailed this address about a declined application, for a person
whose profile has just been erased. The audit log already records the decision.

## Sending

Resend, over HTTPS, from `noreply@portal.norstec.no`. No SDK — one POST to one
endpoint does not need one. See `src/lib/email/transport.ts`.

**Outside production, nothing is sent.** `RESEND_API_KEY` exists only in the
production environment; without it `sendEmail` logs to the console and reports
success. The queue drains, the code path runs, and nobody is written to. Do not
put a real key in `.env.local` — the local database is seeded from migrations,
but a developer pointed at anything else would mail real members.

| Variable | Where | Required |
| --- | --- | --- |
| `RESEND_API_KEY` | Vercel, Production only | Yes, to send anything |
| `PORTAL_EMAIL_FROM` | Vercel | No — defaults to `NORSTEC Portal <noreply@portal.norstec.no>` |
| `PORTAL_EMAIL_REPLY_TO` | Vercel | No, but set it: a declined applicant will reply |
| `PORTAL_SITE_URL` | Vercel | No — falls back to `VERCEL_PROJECT_PRODUCTION_URL` |

The API key should be created with **Sending access** and restricted to the
sending domain, so that it can neither read what was sent nor manage the
account.

## Templates

`src/lib/email/templates.tsx`, as JSX rendered with `renderToStaticMarkup`.

That is a safety decision, not a stylistic one. Every message interpolates
something a person typed — a full name, an organization name, an
administrator's decision note. JSX escapes those; string concatenation would
not, and a rewrite to template literals would look tidier and be wrong.
`templates.test.tsx` asserts the escaping for that reason.

Both an HTML and a plain-text part are built. A message with no text
alternative is a spam signal.

There is no dark-mode variant on purpose. Email clients invert mail themselves
and disagree about how, so a design that survives only one of the two outcomes
is worse than a plain one that survives both.

## Adding a fourth email

1. Add the kind to the check constraint on `private.pending_notifications` in a
   new migration.
2. Add it to `NotificationKind` and the `templates` record in
   `templates.tsx` — the constraint and the union are two lists that have to
   agree, and `drainNotifications` skips rather than settles a row it has no
   template for, so a mismatch strands rows rather than losing them.
3. Queue it with `private.enqueue_notification` from the function that makes
   the decision, never from the server action.
4. Make sure the action that reaches that function calls `drainNotifications`
   in `after()`.
5. Add it to the table in the `emails` section of `src/app/privacy/page.tsx`.
   The policy claims the portal sends three emails and names all three; a
   fourth one that is not listed there makes that page untrue.
