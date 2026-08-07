# Access decision notification

When an access request is decided, the requester is told by email. Nothing
tells them in the portal, and nothing can: an approval sends them into the
portal itself, and a decline deletes the profile along with the request, so
there is no account left to sign in to and read a message on. See
`supabase/migrations/20260812000000_discard_declined_applicant_again.sql`.

**The email is built.** `src/lib/email/templates.ts` follows the layout and
copy below — heading, the supporting sentence, the `dl` of *Decided* and an
optional *Note from the reviewer*, then the closing line — and the third email
the portal sends, for a membership that has ended, reuses the same shell so all
three read as one voice. See [email.md](email.md) for how they are queued and
sent. This document remains the authority on what they say: change it and the
templates together, or neither.

Two things the built version adds, both because an email is read outside the
portal rather than inside it: a greeting line under the heading, and a decline
that says the profile was deleted. The second is not decoration — it is the
only sentence that explains why signing in will not work.

## What the sender reads

The decision writes one audit event, `access_request_approved` or
`access_request_rejected`, and it carries every value the email needs — on
purpose, because the profile it would otherwise read them from is gone by the
time a decline is sent:

| Field | Source |
| --- | --- |
| Recipient name | `details -> 'applicant' ->> 'name'` |
| Recipient address | `details -> 'applicant' ->> 'email'` |
| Scope | `details ->> 'request_type'`, plus `organization_id` on the event |
| Reviewer's note | `details ->> 'decision_note'` (may be absent) |
| Decided | `audit_events.created_at` |

The request row itself is only readable for an approval. A decline cascades it
away with the profile.

## Declined — layout

This is the reviewed layout, kept verbatim from the portal card it was written
for. The classes are the portal's own and have to become inline styles in an
email, but the structure, order, and wording are the decided ones.

```tsx
<section className="portal-surface mt-8 max-w-4xl p-6 sm:p-8">
  <h2 className="text-h2">Your request was declined</h2>
  <p className="mt-4 max-w-[65ch] leading-relaxed opacity-65">
    {scopeLabel(declinedRequest)} did not approve the request you
    sent on {formatMoment(declinedRequest.created_at)}.
  </p>
  <dl className="mt-7 grid gap-5 text-sm sm:grid-cols-2">
    <div>
      <dt className="section-label opacity-45">Decided</dt>
      <dd className="mt-1.5">
        {formatMoment(declinedRequest.reviewed_at) ?? "—"}
      </dd>
    </div>
    {declinedRequest.decision_note && (
      <div className="sm:col-span-2">
        <dt className="section-label opacity-45">
          Note from the reviewer
        </dt>
        <dd className="mt-1.5 max-w-[60ch] leading-relaxed">
          {declinedRequest.decision_note}
        </dd>
      </div>
    )}
  </dl>
  <p className="mt-5 text-sm opacity-55">
    You can send a new request below.
  </p>
</section>
```

Two things change on the way into an email:

- `scopeLabel` reads the organization name for an organization request and says
  "Alumni access" for an alumni one. In the email it has only the audit event's
  `request_type` and `organization_id` to work from.
- "You can send a new request below" has no form under it. It becomes a link
  back to the request page, where signing in again builds a fresh profile — the
  old one is gone, which is the point.

## Approved — layout

The same shell, so the two decisions read as one voice. The note is optional in
both, and the closing line is the only structural difference: an approval sends
them somewhere.

```tsx
<section className="portal-surface mt-8 max-w-4xl p-6 sm:p-8">
  <h2 className="text-h2">Your request was approved</h2>
  <p className="mt-4 max-w-[65ch] leading-relaxed opacity-65">
    {scopeLabel(request)} approved the request you sent on{" "}
    {formatMoment(request.created_at)}. You can sign in to the portal now.
  </p>
  <dl className="mt-7 grid gap-5 text-sm sm:grid-cols-2">
    <div>
      <dt className="section-label opacity-45">Decided</dt>
      <dd className="mt-1.5">{formatMoment(request.reviewed_at) ?? "—"}</dd>
    </div>
    {request.decision_note && (
      <div className="sm:col-span-2">
        <dt className="section-label opacity-45">Note from the reviewer</dt>
        <dd className="mt-1.5 max-w-[60ch] leading-relaxed">
          {request.decision_note}
        </dd>
      </div>
    )}
  </dl>
  <p className="mt-5 text-sm opacity-55">Open the portal to get started.</p>
</section>
```

## Subject lines

- Approved: `Your Norstec portal request was approved`
- Declined: `Your Norstec portal request was declined`

Neither names the organization in the subject. The requester knows what they
asked for, and the address may be a shared or personal one.
