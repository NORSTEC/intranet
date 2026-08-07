import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LegalShell } from "@/components/legal/legal-shell";
import { LegalTableOfContents } from "@/components/legal/legal-toc";
import {
  PRIVACY_CONTROLLER,
  PRIVACY_HOSTING_REGION,
  PRIVACY_LAST_UPDATED,
} from "@/lib/legal/privacy";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What personal data the NORSTEC portal stores about you, why, for how long, and what you can ask it to do about that.",
};

/**
 * The single list the contents panel and the headings are both built from, so
 * a section cannot be renamed in one place and left stale in the other. The
 * numbers come from the position in this array: legal text gets cited by
 * section, which is the one case where a number in front of a heading carries
 * information rather than decoration.
 */
const sections = [
  { id: "controller", title: "Who is responsible" },
  { id: "data", title: "What the portal stores about you" },
  { id: "purposes", title: "Why we process it, and on what basis" },
  { id: "signing-in", title: "Signing in already creates a profile" },
  { id: "recipients", title: "Who can see your data" },
  { id: "emails", title: "Emails the portal sends you" },
  { id: "processors", title: "Where it is stored, and who else touches it" },
  { id: "retention", title: "How long we keep it" },
  { id: "cookies", title: "Cookies and local storage" },
  { id: "automated", title: "Automated decisions" },
  { id: "rights", title: "Your rights" },
  { id: "complaints", title: "Complaining to Datatilsynet" },
  { id: "changes", title: "Changes to this policy" },
] as const;

type SectionId = (typeof sections)[number]["id"];

function Section({ children, id }: { children: ReactNode; id: SectionId }) {
  const index = sections.findIndex((section) => section.id === id);
  const { title } = sections[index];

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="legal-section mt-16 scroll-mt-8 first:mt-0"
      id={id}
    >
      <h2 className="text-h2" id={`${id}-heading`}>
        <span className="mr-3 opacity-35" aria-hidden="true">
          {index + 1}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Table({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="mt-7 overflow-x-auto">
      {/* The width floor lives in `.legal-table`, not in a `min-w-*` utility:
          the stacked mobile rule has to drop it, and a utility would outrank
          the component layer that does the dropping. */}
      <table className="legal-table w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-moody">
            {headers.map((header) => (
              <th
                className="pb-3 pr-5 text-left font-semibold last:pr-0"
                key={header}
                scope="col"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, rowIndex) => (
            <tr className="border-b border-moody/25" key={rowIndex}>
              {cells.map((cell, cellIndex) => (
                <td
                  className="py-3 pr-5 align-top leading-relaxed last:pr-0"
                  /* Read by `.legal-table td::before` once the table stacks,
                     so a cell still says which column it came from. */
                  data-label={headers[cellIndex]}
                  key={cellIndex}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <LegalShell>
      <div className="lg:flex lg:gap-16 xl:gap-24">
        <div className="min-w-0 flex-1">
          <header>
            <h1 className="flex items-center gap-3 text-h1 sm:gap-4">
              Privacy
              <span
                aria-hidden="true"
                className="page-heading-star inline-block shrink-0"
              />
            </h1>
            <p className="mt-6 max-w-[68ch] text-lg leading-relaxed opacity-70">
              The NORSTEC portal is a membership system. It holds who you are,
              which organization you belong to, and what you are allowed to see.
              This page says what that means in data, and what you can ask us to
              do about it.
            </p>
            {/* 0.6 rather than the portal's usual 0.45 for a `section-label`:
                at 11.5px, 0.45 lands at 3.9:1 against the page background,
                and this label carries content rather than naming a value
                sitting next to it. */}
            <p className="mt-6 section-label opacity-60">
              Last updated {PRIVACY_LAST_UPDATED}
            </p>
          </header>

          <LegalTableOfContents
            className="mt-12 border-t border-moody/20 pt-8 lg:hidden"
            sections={sections}
          />

          <div className="mt-16">
            <Section id="controller">
              <p className="mt-6 leading-relaxed">
                {PRIVACY_CONTROLLER.legalName} is the data controller for the
                portal, and has not appointed a data protection officer.
              </p>
              <dl className="mt-7 grid max-w-[68ch] gap-5 text-sm sm:grid-cols-2">
                <div>
                  <dt className="section-label opacity-60">Organization</dt>
                  <dd className="mt-1.5">
                    {PRIVACY_CONTROLLER.legalName}, org. nr.{" "}
                    {PRIVACY_CONTROLLER.organizationNumber}
                  </dd>
                </div>
                <div>
                  <dt className="section-label opacity-60">Postal address</dt>
                  <dd className="mt-1.5">{PRIVACY_CONTROLLER.postalAddress}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="section-label opacity-60">
                    Privacy enquiries
                  </dt>
                  <dd className="mt-1.5">
                    <a
                      className="legal-link"
                      href={`mailto:${PRIVACY_CONTROLLER.contactEmail}`}
                    >
                      {PRIVACY_CONTROLLER.contactEmail}
                    </a>
                  </dd>
                </div>
              </dl>
            </Section>

            <Section id="data">
              <Table
                caption="Categories of personal data the portal stores, and where each category comes from."
                headers={["Category", "Fields", "Where it comes from"]}
                rows={[
                  [
                    "Identity",
                    "Name, email addresses, and which of them is your primary address",
                    "Your Google account on first sign-in; you or an administrator afterwards",
                  ],
                  [
                    "Sign-in accounts",
                    "The Google accounts linked to your profile, the address each one signs in with, when it was linked, and when it was last used",
                    "Google",
                  ],
                  [
                    "Profile",
                    "Name, phone number, field of study, study year, LinkedIn address, profile picture",
                    "You, on your profile page. All of it optional except your name",
                  ],
                  [
                    "Membership",
                    "Which organizations you belong to, your role in each, whether the membership is active or ended, and the periods it ran for",
                    "Automatic domain matching, an approved access request, or an administrator",
                  ],
                  [
                    "Teams and experience",
                    "Team memberships, the roles you held, and the dates they ran between",
                    "You, and organization administrators",
                  ],
                  [
                    "Access requests",
                    "Which access you asked for, field of study, study year, your message, and the administrator decision",
                    "You, and the administrator who decided",
                  ],
                  [
                    "Audit log",
                    "Administrative actions taken on your account: who did what, when, and to which record",
                    "The portal, as administrators use it",
                  ],
                  [
                    "Workspace directory",
                    "For norstec.no accounts only: the Google account id, its address, and whether it is suspended",
                    "The NORSTEC Google Workspace",
                  ],
                ]}
              />
              <p className="mt-7 leading-relaxed">
                Signing in with Google gives the portal your name and email
                address, and nothing else — not your password, and not your
                mail, files, or calendar. No special categories of data are
                stored, and none are asked for.
              </p>
            </Section>

            <Section id="purposes">
              <p className="mt-6 leading-relaxed">
                Every processing operation needs a legal basis under article 6
                of the GDPR. None of ours is consent.
              </p>
              <Table
                caption="Each purpose the portal processes personal data for, and the legal basis under GDPR article 6 it relies on."
                headers={["Purpose", "Legal basis"]}
                rows={[
                  [
                    "Signing you in, and creating the profile that a later request or membership attaches to",
                    "Article 6(1)(b) — steps taken at your request before entering into an agreement. You asked for access by signing in",
                  ],
                  [
                    "Handling your access request and telling you the outcome",
                    "Article 6(1)(b) — the same pre-agreement step",
                  ],
                  [
                    "Running your membership: roles, teams, the member directory, and deciding what you may see",
                    "Article 6(1)(b) — the membership relationship between you and your organization",
                  ],
                  [
                    "Keeping an audit log of administrative actions",
                    "Article 6(1)(f) — NORSTEC needs to be able to account for decisions taken about its members. The log records the action and the record it touched, not your activity as a member",
                  ],
                  [
                    "Keeping portal access and NORSTEC Google Workspace accounts in step",
                    "Article 6(1)(f) — an account that keeps working after access is withdrawn is a security problem for both of us",
                  ],
                ]}
              />
              <p className="mt-7 leading-relaxed">
                Where we rely on legitimate interest you may object under
                article 21. Write to{" "}
                <a
                  className="legal-link"
                  href={`mailto:${PRIVACY_CONTROLLER.contactEmail}`}
                >
                  {PRIVACY_CONTROLLER.contactEmail}
                </a>{" "}
                and we will weigh your situation against the interest and tell
                you the result.
              </p>
            </Section>

            <Section id="signing-in">
              <p className="mt-6 leading-relaxed">
                Completing Google sign-in creates a portal profile immediately —
                before you request anything, and whether or not access is ever
                granted. It holds the name and email address Google returns, and
                the link to that Google account. It has to: the portal cannot
                hold a pending access request, or tell you its outcome, without
                a record of who is asking.
              </p>
              <p className="mt-5 leading-relaxed">
                If you sign in, never request access, never receive a
                membership, and do not come back, that profile is deleted
                automatically 30 days after your last sign-in. Nobody has to act
                for it to happen. Ask us and we will delete it sooner.
              </p>
            </Section>

            <Section id="recipients">
              <p className="mt-6 leading-relaxed">
                The portal is internal. Nothing in it is public or indexed by
                search engines, and none of it is shared for advertising — the
                portal runs no advertising and no analytics.
              </p>
              <Table
                caption="Who can see your personal data inside the portal, and what each of them can see."
                headers={["Who", "What they can see"]}
                rows={[
                  [
                    "Other members of the portal",
                    "Your name, profile picture, field of study, study year, LinkedIn address, phone number if you entered one, your organization and team memberships, and your primary email address",
                  ],
                  [
                    "Administrators of your organization",
                    "The above, plus your membership history, roles, and any access request you made to that organization — including your message",
                  ],
                  [
                    "Portal administrators (NORSTEC IT)",
                    "The above for every organization, plus the audit log, deleted profiles inside the recovery window, and the Google accounts linked to your profile",
                  ],
                ]}
              />
            </Section>

            <Section id="emails">
              <p className="mt-6 leading-relaxed">
                The portal sends three kinds of email, and only when somebody
                has decided something that changes what you can do here. There is no
                newsletter, no announcement list, and nothing to unsubscribe
                from — turning these off would mean not being told that your
                access changed.
              </p>
              <Table
                caption="The emails the portal sends, what causes each one, and where it is sent."
                headers={["When", "What it says", "Sent to"]}
                rows={[
                  [
                    "Your access request is approved",
                    "That you were let in, and the reason the administrator wrote, if they wrote one",
                    "The address you applied with",
                  ],
                  [
                    "Your access request is declined",
                    "That you were not let in, the reason if there was one, and that no profile has been kept for you",
                    "The address you applied with",
                  ],
                  [
                    "Your last active membership ends",
                    "That you are now an alumnus and keep access. If a norstec.no account is the only way you sign in, it also warns that suspending it locks you out",
                    "A personal address if you have one on file, so that the message does not depend on the account it is warning you about",
                  ],
                ]}
              />
              <p className="mt-7 leading-relaxed">
                Nothing else is emailed. Administrators are not notified about
                you by email, and the portal never mails the member directory or
                anything from your profile to anyone.
              </p>
            </Section>

            <Section id="processors">
              <p className="mt-6 leading-relaxed">
                Four suppliers process personal data on NORSTEC&rsquo;s behalf,
                under data processing agreements, and may not use it for their
                own purposes.
              </p>
              <Table
                caption="Data processors used by the portal, what each one does, and where it stores data."
                headers={["Processor", "What it does", "Where"]}
                rows={[
                  [
                    "Supabase",
                    "Stores the database and profile pictures",
                    PRIVACY_HOSTING_REGION,
                  ],
                  [
                    "Vercel",
                    "Serves the portal and keeps short-lived request logs",
                    "EU region",
                  ],
                  [
                    "Google",
                    "Authenticates you, and for norstec.no accounts provides the Workspace directory",
                    "Google Ireland Limited, with onward transfer to Google LLC",
                  ],
                  [
                    "Resend",
                    "Delivers the few emails the portal sends you",
                    "Sent from Ireland; delivery records kept in the United States for 30 days",
                  ],
                ]}
              />
              <p className="mt-7 leading-relaxed">
                Google transfers data to the United States, under the EU–US Data
                Privacy Framework and the European Commission&rsquo;s standard
                contractual clauses. Ask us for a copy of the safeguards that
                apply. Because you sign in with Google, Google also learns that
                you signed in here, and processes that as its own controller
                under its own privacy policy.
              </p>
              <p className="mt-7 leading-relaxed">
                Resend receives only what an email needs: your name, the address
                it is going to, and what the message says — which may include an
                administrator&rsquo;s written reason for a decision. It receives
                nothing else about you, and the portal sends no newsletters and
                no marketing.
              </p>
              <p className="mt-7 leading-relaxed">
                Choosing Ireland decides where the message is sent from, and
                nothing else: Resend keeps its own record of what it delivered —
                the address, the subject, and the delivery result — in the
                United States for 30 days, under the same standard contractual
                clauses. NORSTEC decides what is sent and why; Resend only
                carries it.
              </p>
            </Section>

            <Section id="retention">
              <Table
                caption="How long each kind of record is kept before it is deleted."
                headers={["Record", "Kept until"]}
                rows={[
                  [
                    "A profile from a sign-in that never led to a request or a membership",
                    "30 days after the last sign-in, then deleted automatically",
                  ],
                  [
                    "A profile whose access request was declined",
                    "Deleted when the decision is made, together with the request and the Google link",
                  ],
                  [
                    "An account you delete yourself, or that an administrator deletes",
                    "Hidden and signed out immediately; erased permanently 30 days later. Within those 30 days it can be restored if you ask",
                  ],
                  [
                    "Membership history for a member who is still in the portal",
                    "For as long as the membership relationship lasts, so that alumni status and past roles stay correct",
                  ],
                  [
                    "Audit log entries",
                    "Kept as the record of what administrators did. When a person is erased, the entries about them lose every reference to them",
                  ],
                  [
                    "An email waiting to be sent to you",
                    "Deleted the moment it is sent. One that cannot be delivered is given up on and deleted after seven days",
                  ],
                ]}
              />
            </Section>

            <Section id="cookies">
              <p className="mt-6 leading-relaxed">
                The portal sets no advertising, tracking, or analytics cookies,
                and loads no third-party scripts that would. What it does set is
                strictly necessary for the portal to work, which under the
                Norwegian Electronic Communications Act needs no consent — and
                is why there is no cookie banner here.
              </p>
              <Table
                caption="Everything the portal stores in your browser, and why."
                headers={["What", "Why", "How long"]}
                rows={[
                  [
                    "Session cookies",
                    "Keep you signed in between page loads. Without them the portal cannot tell that a request is yours",
                    "Until you sign out or the session expires",
                  ],
                  [
                    "theme-preference",
                    "Remembers whether you chose light or dark mode. Stored in your browser only and never sent to the server",
                    "Until you clear your browser storage",
                  ],
                ]}
              />
            </Section>

            <Section id="automated">
              <p className="mt-6 leading-relaxed">
                Signing in with a Google account on an organization&rsquo;s
                approved email domain gives you a membership in that
                organization without anyone reviewing it — the domain acts as
                proof of membership. Every other decision, including approving
                or declining an access request, is made by a person.
              </p>
              <p className="mt-5 leading-relaxed">
                There is no profiling, and no automated decision producing legal
                effects concerning you within the meaning of article 22.
              </p>
            </Section>

            <Section id="rights">
              <p className="mt-6 leading-relaxed">
                Some of these you can exercise in the portal without asking
                anyone; for the rest, write to{" "}
                <a
                  className="legal-link"
                  href={`mailto:${PRIVACY_CONTROLLER.contactEmail}`}
                >
                  {PRIVACY_CONTROLLER.contactEmail}
                </a>
                . We answer within one month, and tell you if we need longer and
                why.
              </p>
              <Table
                caption="Your rights under the GDPR and how to exercise each one."
                headers={["Right", "How"]}
                rows={[
                  [
                    "Access — a copy of what we hold about you",
                    "Most of it is on your profile page. Ask us for the rest",
                  ],
                  [
                    "Rectification — correcting what is wrong",
                    "Edit your profile yourself. Ask an administrator for membership and role data",
                  ],
                  [
                    "Erasure — being deleted",
                    "Delete your account from your own profile settings. It is erased permanently 30 days later",
                  ],
                  [
                    "Restriction — pausing processing while something is disputed",
                    "Ask us",
                  ],
                  [
                    "Portability — your data in a machine-readable form",
                    "Ask us",
                  ],
                  [
                    "Objection — to processing based on legitimate interest",
                    "Ask us, and say what about your situation makes you object",
                  ],
                ]}
              />
              <p className="mt-7 leading-relaxed">
                Providing your data is not a legal obligation but a requirement
                of using the portal: without a name and an email address there
                is no membership record, and nothing for an administrator to
                approve.
              </p>
            </Section>

            <Section id="complaints">
              <p className="mt-6 leading-relaxed">
                Tell us first if you think we are handling your data wrongly —
                it is usually the fastest fix. You do not have to: you may
                complain directly to the Norwegian Data Protection Authority.
              </p>
              <p className="mt-5 leading-relaxed">
                Datatilsynet, Postboks 458 Sentrum, 0105 Oslo.{" "}
                <a
                  className="legal-link"
                  href="https://www.datatilsynet.no"
                  rel="noreferrer"
                  target="_blank"
                >
                  datatilsynet.no
                </a>
              </p>
            </Section>

            <Section id="changes">
              <p className="mt-6 leading-relaxed">
                When this policy changes in substance, the date at the top
                changes with it, and members are told before the change takes
                effect rather than after.
              </p>
            </Section>
          </div>
        </div>

        <aside className="hidden w-56 shrink-0 lg:block xl:w-64">
          <LegalTableOfContents
            className="sticky top-12 max-h-[calc(100vh-6rem)] overflow-y-auto"
            sections={sections}
          />
        </aside>
      </div>
    </LegalShell>
  );
}
