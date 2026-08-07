# Operations

How a change gets from a branch to production, and the settings outside this
repository that make that safe. Setup and day-to-day commands are in
[README.md](../README.md).

## How a change reaches production

1. Branch, commit, open a pull request.
2. `.github/workflows/checks.yml` runs two jobs: types, lint, unit tests and
   build; and a fresh database built from every migration with the
   authorization suite run against it. Both must pass.
   `.github/workflows/security.yml` blocks the pull request if it adds a
   dependency with a known high-severity vulnerability. CodeQL runs alongside
   from GitHub's default setup rather than from a workflow file — one analysis
   of the application code, one of the workflow files themselves.
3. Merge to `main`.
4. `.github/workflows/migrate.yml` applies any new migrations to the hosted
   Supabase project.
5. Vercel builds and deploys the application, triggered by the same push.

Steps 4 and 5 race and nothing sequences them. In practice the migration
finishes first — it takes under a minute and a Next.js build does not — but
that is a tendency, not a guarantee. Write migrations an older application can
survive: add before you remove, and drop a column in a later commit than the
one that stopped reading it.

**Migrations are append-only.** Editing a migration that has already been
applied changes nothing in the deployed database; it only replays on a local
`pnpm db:reset`. To change a deployed function or policy, write a new
timestamped migration that `create or replace`s it. See [AGENTS.md](../AGENTS.md)
for the drift this has already caused.

## The two test suites

`pnpm test` covers the **pure rules** — `deriveAccessLevel`,
`derivePersonStatus`, `hasNorstecEmail`. Small functions that decide what a
person *is* from facts already loaded. They have drifted before: an alumnus
granted access without any membership row once read as "No membership" on one
page and "Alumni" on another.

`pnpm db:test` covers **authorization**, and it is the one that matters most.
Authorization here is not application code — it is Row Level Security policies
and `security definer` functions in the database, so a regression is a data
breach rather than a bug. The suite has 162 assertions run against a real
Postgres. Add to it whenever you touch a policy or an RPC. It has already caught
a function that lost three of its `delete` statements in a rewrite and broke
access-request declines in production.

Nothing here mocks Supabase. A mocked database tests the mock.

## There is only one deployed environment

`main` deploys to production. Nothing else deploys at all.

This is the honest shape of the setup rather than a limitation being worked
around. A deployment is worth having when you can open it and use it, and this
application is nothing without a database — every page reads from Supabase. The
only hosted database here is production, holding real members' names, addresses
and sign-in accounts, and pointing unreviewed branch code at it would mean pull
requests writing to the member register. So the Supabase variables are scoped to
Production alone, and a preview would come up with no credentials: green build,
dead on the first click. That is not a deployment anybody wants; it is a URL
that looks broken and costs somebody an hour.

What replaces it is the local stack. `pnpm dev:all` gives every developer a full
portal against a database built from the same migrations, which is a better
review environment than one shared preview would have been.

`vercel.json` says this twice, on purpose:

- **`git.deploymentEnabled`** stops Vercel creating a deployment for any branch
  but `main`. Nothing is queued, so nothing reports back and pull requests carry
  no Vercel row at all. Note the `**` — minimatch's `*` does not cross a slash,
  and every branch here is named `feat/…` or `fix/…`.
- **`ignoreCommand`** is the backstop. If a deployment is started some other way
  — a dashboard redeploy, a `vercel deploy` from a laptop, a branch pattern that
  slips past the rule above — it exits 0 for anything that is not production and
  the build is skipped. **The exit codes read backwards: 0 skips the build, 1
  lets it run.**

Either alone would do the job; together the second one means a mistake in the
first fails safe rather than deploying a branch.

Restoring previews needs a second database for them to point at: either a free
Supabase project — the free plan allows two per organization and this uses one
— or Supabase's branching feature, which creates a throwaway database per pull
request and bills for as long as each lives. Neither is worth it at three
developers, because a single shared preview database has one schema and schema
changes arrive here often enough that half the pull requests would render
against a schema that is not theirs. When that changes, delete `vercel.json` and
add the preview-scoped variables in Vercel.

### Nothing tests the production deployment before merge

It cannot. Deploying to production *is* the merge, and there is no hosted
environment in between. A preview deployment would not have covered it either:
a preview is built without the production variables, so a green Vercel check on
a pull request means "a build with no environment succeeded" — which is exactly
what the required `Types, lint, tests and build` check already proves, with the
same `next build`.

So the three failure modes are covered in three different places:

| What goes wrong | Where you find out |
| --- | --- |
| The code does not build | `Types, lint, tests and build`, before merge |
| The build fails on Vercel | red `Vercel` status on the merge commit. Production is unaffected — it keeps serving the previous deployment |
| The build succeeds and the site is dead | `.github/workflows/smoke.yml`, within a minute of deploying |

That last one is the one worth having. `NEXT_PUBLIC_*` variables are inlined at
build time and `src/lib/supabase/client.ts` reads them with `!`, so removing one
from the Vercel project would leave every check green, the build successful, and
the browser holding `undefined`. The smoke test asks the deployment for a
response as soon as Vercel reports it live, and goes red when there is not one.

Recovery is **Deployments → ⋯ → Promote to Production** on the last good
deployment: seconds, and no rebuild. The database does not roll back with it,
which is the other reason to write migrations an older application survives.

### The three things called "environment"

Vercel, GitHub and Supabase all use the word and mean different things by it.
Most confusion about what is deployed where comes from assuming they line up.

| | What an "environment" is there | What exists here |
| --- | --- | --- |
| **Vercel** | a filter on variables — which ones a given build receives | Production holds all of them. Preview and Development hold none |
| **GitHub** | a box of secrets with rules about which branches may reach it | `Production` holds the two migration secrets and admits only `main`. `Preview` is empty |
| **Supabase** | nothing. One project is one database | one project |

Supabase has no environments at all unless branching is switched on, which is
why there was never anywhere for a preview to point.

Two leftovers appear in the interfaces and mean nothing. GitHub's `Preview`
environment was created by Vercel's bot and holds no secrets and no rules. The
`Supabase Preview` check that reports `skipped` on every pull request is the
branching feature saying it is switched off; skipped checks block nothing, and
the row goes away by disconnecting the GitHub integration in the Supabase
dashboard. Leave `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_ID` where they
are — they belong to `migrate.yml`, which is a different mechanism.

## Repository settings

These are GitHub and Vercel settings rather than files, so they have to be
turned on by hand and nothing in this repository will tell you when they drift.

They are not bureaucratic. Vercel deploys `main` to production automatically,
and that deployment holds an identity that can read the member database and
suspend Google Workspace accounts. Anyone who can push to `main` can run code as
that identity.

### Branch protection

**Settings → Rules → Rulesets → New branch ruleset**, targeting the default
branch, enforcement **Active**, bypass list **empty**.

- Restrict deletions
- Block force pushes
- Require a pull request before merging, with conversation resolution. Zero
  approvals while there is one maintainer — requiring them would lock you out.
  **Raise this to one the day a second person gets write access**, or any one
  of you can ship to production alone.
- Require status checks to pass with branches up to date:
  `Types, lint, tests and build`, `Migrations and authorization tests`,
  `Dependency review`
- Require code scanning results from CodeQL

Use a ruleset rather than the older **Settings → Branches** rule. Both still
work and they layer — when they disagree the stricter wins, and nothing tells
you which one refused your push. Keep one. If a classic rule already exists,
create the ruleset first, confirm on a throwaway pull request that it blocks
what it should, and only then delete the classic rule. The other order leaves
`main` unprotected in between.

CodeQL gets its own rule rather than a place among the status checks because it
does not run on every pull request — a branch that only touches Markdown has
nothing to analyse, and as a required status check that pull request would wait
forever. The code scanning rule knows the difference between "no findings" and
"did not run".

Leave **require signed commits** and **require linear history** off. Signed
commits break merges from the web interface and from anyone without GPG set up,
which is a bad thing to discover during a release.

### Everything else

- **Settings → Advanced Security:** turn on secret scanning and **push
  protection**. Push protection refuses a commit containing something shaped
  like a key before it reaches public history. Free on a public repository, and
  the one mistake it prevents is the expensive one.
- **Settings → Actions → General:** *Fork pull request workflows from outside
  collaborators* must require approval. Without it a stranger can run workflows
  on these runners by opening a pull request.
- **Organization → Settings → Authentication security:** require two-factor
  authentication for every member.
- **Review who has write access**, on GitHub and on the Vercel team. Both are a
  path to production.
- **GitHub Apps:** the Vercel app is what deploys — do not uninstall it. It has
  asked for `Actions: read` and `Workflows: read and write` to support Vercel
  Agent and v0; neither is used here, and workflow write access reaches the
  files that gate the production credentials, so the request is declined by
  doing nothing.

## Secrets for the migration workflow

[Supabase recommends](https://supabase.com/docs/guides/deployment/managing-environments)
deploying migrations from CI rather than from a laptop, and documents it with
three secrets. Only two are used here.

Add them under **Settings → Environments → `production`**, never as repository
secrets. Environment secrets are readable only by a job that names that
environment; repository secrets are readable by every workflow in the repo.

| Secret | Where to find it |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens, signed in as the CI account (see below) |
| `SUPABASE_PROJECT_ID` | The project ref in the Supabase project URL |

On the same environment, set **Deployment branches and tags → Selected branches
→ `main`**. Without it, anyone who can push a branch could add a job that names
`production` and read the token out. With it, GitHub refuses the job before any
secret is handed over.

Give the token an expiry rather than leaving it open-ended. When it lapses the
migration workflow fails with an authentication error and nothing else happens
— production keeps running and the migration waits — so the cost of rotating is
a dashboard visit, and the benefit is that a leak nobody noticed stops working
on its own.

**`SUPABASE_DB_PASSWORD` is deliberately not used.** CLI 2.111 asks the
Management API to mint a temporary database login role and connects with that,
so the access token is the only credential needed. A database password would be
a standing credential granting direct SQL access from anywhere with no Row Level
Security in the way; the access token is revocable from the Supabase dashboard
in one click. If a future CLI starts prompting for a password in CI, add the
secret back rather than working around the prompt.

**Generate the token from a dedicated CI account, not from your own.** A
Supabase access token carries the same privileges as the account that created it
— Supabase's own dialog says it "can be used to control your whole account" —
and a personal one covers every organization that person belongs to, including
their private projects. It also means CI stops working the day they leave, which
in an organization with yearly turnover is a matter of when.

Instead: use the organization's own role account, `web@norstec.no`, the same one
behind the Vercel team. Sign in to Supabase as it, have it invited to the Norstec
organization as a **Developer**, and make the token there. A Developer can change
database content, which is what migrations do, but cannot change project
settings, create or delete projects, rotate API keys, or download backups.
Restricting a role to a single project needs the Team plan; on Free the role
covers the whole organization, so keep unrelated projects out of it.

That account holds both deployment and migration access, which makes two things
load-bearing: **two-factor authentication on it**, and its password living in a
password manager the organization controls rather than in a document or a chat
message.

The token still reaches member data — anything that can run a migration can run
a `select`. What it buys is a much smaller radius for everything else, an audit
trail that says "CI" rather than a person's name, and one revoke button that
breaks nothing else.

Four things stand between that token and a leak, and all four are load-bearing:

1. **Environment scoping**, so only this one job can read it.
2. **The `main`-only deployment branch rule**, so only a merged commit counts.
3. **Commit-pinned actions** in `migrate.yml` — a tag can be moved to point at
   different code, a commit cannot.
4. **Branch protection on `main`**, because anyone who can change that file can
   make it print the token.

GitHub does not pass secrets to workflows triggered from a fork, so a stranger's
pull request cannot reach them regardless. Do not turn on *Settings → Actions →
Send secrets to workflows from pull requests*; it exists, and it would undo that.

Adding a **required reviewer** to the environment means every schema change waits
for a human. Worth turning on once more than one person is committing.
