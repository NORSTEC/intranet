# Norstec Portal

Norstec Portal is an internal membership system for Norstec and its member
organizations. It manages member profiles, organizations, teams, roles, alumni
transitions, and access to connected services.

> **Status:** Google authentication, membership provisioning, access requests,
> role checks, database migrations, Row Level Security, and Google Workspace
> directory reconciliation are implemented. Several portal feature pages still
> contain prototype data. Slack is read-only so far — the portal reports which
> Slack accounts belong to nobody, and manages no channels.

## Stack

- Next.js App Router, React, TypeScript
- Tailwind CSS and Material Symbols
- Supabase Auth with server-side session cookies
- Supabase Postgres with versioned migrations and Row Level Security
- pnpm, and Docker for the local database
- Hosted on Vercel

## Getting started

You need three things installed: [Node.js 24+](https://nodejs.org),
[pnpm](https://pnpm.io), and [Docker Desktop](https://docs.docker.com/get-started/get-docker/).

```bash
pnpm install
cp .env.example .env.local
pnpm dev:all
```

Open `http://localhost:3000`. That is all of it — it works the same in any
editor.

`pnpm dev:all` is `pnpm db:start` followed by `pnpm dev`, which is what you
want the first time and every morning after. Run them separately when you want
the database up without the application — before `pnpm db:test`, say.

```bash
pnpm db:reset   # throw the local database away and rebuild it from migrations
pnpm db:stop    # shut the stack down
```

The Supabase Studio at `http://localhost:54323` is a browser interface to the
local database. Mail the portal sends locally is caught at
`http://localhost:54324` rather than delivered.

**Develop against the local database, not the hosted one.** The hosted project
holds real members' names, addresses and sign-in accounts. A mistake there is
not undoable, and the portal is subject to GDPR. If you think you need the
hosted project for something, ask first. Pull requests build nothing that could
reach it — see [There is only one deployed environment](#there-is-only-one-deployed-environment).

### What Docker is doing here, and what it is not

Docker Desktop has to be running, but you never open it. `pnpm db:start` uses
it and nothing else does.

Supabase is not one program. It is Postgres, an auth service, a REST layer, a
gateway, storage, a mail catcher and a few more — around ten of them, which
have to be the versions that match each other. Installing that by hand, on
three laptops, and keeping it in step with CI, is not a thing that stays
working. Docker ships each one as a prebuilt image, and `pnpm db:start`
launches the set. You, the person next to you, and GitHub Actions end up with
the same database down to the patch version.

**Your application does not run in Docker.** `pnpm dev` is an ordinary Node
process on your own machine, talking to `localhost:54321`, which is where the
containers are listening. Nothing you write goes into a container, and no
Docker knowledge is required to work here.

The first `pnpm db:start` takes a few minutes while images download; after that
it is about twenty seconds. Give Docker Desktop **at least 8 GB of memory**
under *Settings → Resources*. Below that the stack starts and then dies partway
through migrations, which looks convincingly like a broken migration.

Three failures account for nearly all of them:

| What you see | What it means |
| --- | --- |
| `Cannot connect to the Docker daemon` | Docker Desktop is not running |
| `db:start` hangs on health checks | not enough memory, see above |
| `port 54322 already in use` | run `pnpm db:stop`, or another Supabase project is up |

### Optional: Dev Container

`.devcontainer/devcontainer.json` describes the same setup as a container, so
your editor can build it instead of you installing Node and pnpm yourself. It
is a convenience and nothing depends on it — the instructions above are the
supported path, and skipping this section costs you nothing.

It needs an editor that implements the Dev Container spec: VS Code with the Dev
Containers extension, Cursor, JetBrains IDEs from 2023.2, or GitHub Codespaces,
which needs no local Docker at all. Editors that do not implement it — Zed,
Neovim, Sublime — use the instructions above.

## Before you push

```bash
pnpm check      # typecheck, lint, unit tests and build
pnpm db:test    # the authorization suite, needs the local stack running
```

Both are enforced in CI, so running them first only saves you a round trip.

There are two kinds of test here, and the split is deliberate.

`pnpm test` covers the **pure rules** — `deriveAccessLevel`,
`derivePersonStatus`, `hasNorstecEmail`. Small functions that decide what a
person *is* from facts already loaded. They are worth testing because they have
drifted before: an alumnus granted access without any membership row once read
as "No membership" on one page and "Alumni" on another.

`pnpm db:test` covers **authorization**, and it is the one that matters most.
Authorization in this portal is not application code — it is Row Level Security
policies and `security definer` functions in the database. A regression there is
a data breach rather than a bug, so the suite has 162 assertions covering who
may read and write what, run against a real Postgres. Add to it whenever you
touch a policy or an RPC. It has already caught a function that lost three of
its `delete` statements in a rewrite and broke access-request declines in
production.

Nothing here mocks Supabase. A mocked database tests the mock.

## How a change reaches production

1. Branch, commit, open a pull request.
2. `.github/workflows/checks.yml` runs two jobs: types/lint/tests/build, and a
   fresh database built from every migration with the authorization suite run
   against it. Both must pass.
   `.github/workflows/security.yml` blocks the pull request if it adds a
   dependency with a known high-severity vulnerability. CodeQL runs alongside
   it from GitHub's default setup rather than from a workflow file — one
   analysis of the application code, one of the workflow files themselves.
3. Merge to `main`.
4. `.github/workflows/migrate.yml` applies any new migrations to the hosted
   Supabase project.
5. Vercel builds and deploys the application on its own, triggered by the same
   push.

Steps 4 and 5 race — nothing sequences them. In practice the migration finishes
first, but write migrations so an older application survives them anyway: add
before you remove, and drop a column in a later commit than the one that
stopped reading it.

**Migrations are append-only.** Editing a migration that has already been
applied changes nothing in the deployed database; it only replays on a local
`pnpm db:reset`. To change a deployed function or policy, write a new
timestamped migration that `create or replace`s it. See
[AGENTS.md](AGENTS.md) for the details and for the drift this has caused
before.

### There is only one deployed environment

`vercel.json` stops Vercel building anything that is not production. Every
other deployment it would make — one per pull request — is skipped before the
build starts.

This is not a limitation being worked around; it is the honest shape of the
setup. A preview deployment is worth having when it can be clicked through, and
that needs a database. The only hosted database here is production, which holds
real members' names, addresses and sign-in accounts. Pointing pull requests at
it would mean unreviewed code writing to the member register, so the Supabase
variables are scoped to Production alone and previews have no credentials at
all. What that produced was a preview URL that always built green and always
died on the first click — a thing that looks broken and costs somebody an hour
before they work out it was never meant to work.

So there is nothing to click, and nothing pretending otherwise. What replaces
it is the local stack: `pnpm dev:all` gives every developer a full portal
against a database built from the same migrations, which is a better review
environment than a shared preview would have been anyway.

The path to changing this is a second Supabase project for previews to point at
— either a free one in its own organization, or Supabase's branching feature,
which creates a throwaway database per pull request and is billed for as long
as each one lives. Neither is needed at three developers. When one of them is,
delete `vercel.json` and add the preview-scoped variables in Vercel.

The `Supabase Preview` check that appears on every pull request and reports
`skipped` is the branching feature reporting that it is switched off. Skipped
checks block nothing. To be rid of the row, disconnect the GitHub integration
under **Project Settings → Integrations** in the Supabase dashboard — but leave
`SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_ID` alone. Those belong to
`migrate.yml`, which is a different mechanism and still the one that migrates
production.

## Repository setup

These are GitHub and Vercel settings, not files, so they have to be turned on
by hand. They are what makes the pipeline above worth having.

**Required, and the reason is not bureaucratic.** Vercel deploys `main` to
production automatically, and that deployment holds an identity that can read
the member database and suspend Google Workspace accounts. Anyone who can push
to `main` can run code as that identity.

- **Settings → Rules → Rulesets → New branch ruleset**, targeting the default
  branch, with the enforcement status set to **Active** and the bypass list left
  **empty**. Turn on: restrict deletions, block force pushes, require a pull
  request (with conversation resolution, and zero approvals while there is one
  maintainer — requiring them would lock you out), require the status checks
  `Types, lint, tests and build`, `Migrations and authorization tests` and
  `Dependency review` to pass with branches up to date, and require code
  scanning results from CodeQL.

  Use a ruleset rather than the older **Settings → Branches** rule. Both are
  still offered and both still work, but they layer — when the two disagree the
  stricter wins, and nothing tells you which one refused your push. Keep one.
  If a classic rule already exists, create the ruleset first, confirm on a
  throwaway pull request that it blocks what it should, and only then delete the
  classic rule. The other order leaves `main` unprotected in between, and `main`
  deploys straight to production.

  CodeQL gets its own rule rather than being listed among the status checks
  because it does not run on every pull request — a branch that only touches
  Markdown has nothing to analyse. As a required status check that pull request
  would wait forever; the code scanning rule understands the difference between
  "no findings" and "did not run".

  Leave **require signed commits** and **require linear history** off. Signed
  commits break merges from the web interface and from anyone without GPG set
  up, which is a bad thing to discover during a release.
- **Organization → Settings → Authentication security:** require two-factor
  authentication for every member.
- **Review who has write access**, on GitHub and on the Vercel team. Both are
  a path to production.
- **Settings → Code security:** turn on secret scanning and **push
  protection**. Push protection refuses a commit that contains something
  shaped like a key, before it reaches the public history. Free, and the one
  mistake it prevents is the expensive one.

### Secrets for the migration workflow

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

Give the token an expiry rather than leaving it open-ended. When it lapses the
migration workflow fails with an authentication error and nothing else happens
— production keeps running, the migration simply waits — so the cost of
rotating is a dashboard visit, and the benefit is that a leak nobody noticed
stops working on its own.

**`SUPABASE_DB_PASSWORD` is deliberately not used.** CLI 2.111 asks the
Management API to mint a temporary database login role and connects with that,
so the access token is the only credential needed. A database password would be
a standing credential granting direct SQL access from anywhere, with no Row
Level Security in the way; the access token is revocable from the Supabase
dashboard in one click. If a future CLI starts prompting for a password in CI,
add the secret back rather than working around the prompt.

**Generate the token from a dedicated CI account, not from your own.** A
Supabase access token carries the same privileges as the account that created
it — Supabase's own dialog says it "can be used to control your whole account"
— and a personal one covers every organization that person belongs to,
including their private projects. It also means CI stops working the day they
leave, which in an organization with yearly turnover is a matter of when.

Instead: use the organization's own role account, `web@norstec.no` — the same
one behind the Vercel team. Sign in to Supabase as it, have it invited to the
Norstec organization as a **Developer**, and make the token there. A Developer
can change database content, which is what migrations do, but cannot change
project settings, create or delete projects, rotate API keys, or download
backups. (Restricting a role to a single project needs the Team plan; on Free
the role covers the whole organization, so keep unrelated projects out of it.)

That account now holds both deployment and migration access, which makes two
things load-bearing: **two-factor authentication on it**, and its password
living in a password manager the organization controls rather than in a
document or a chat message.

That token still reaches member data — anything that can run a migration can
run a `select`. What it buys is a much smaller radius for everything else, an
audit trail that says "CI" rather than a person's name, and one revoke button
that breaks nothing else.

On the same environment, set **Deployment branches and tags → Selected
branches → `main`**. Without it, anyone who can push a branch could add a job
that names `production` and read the token out. With it, GitHub refuses the job
before any secret is handed over.

Four things stand between that token and a leak, and they are load-bearing:

1. **Environment scoping**, so only this one job can read it.
2. **The `main`-only deployment branch rule**, so only a merged commit counts.
3. **Commit-pinned actions** in `migrate.yml` — a tag can be moved to point at
   different code, a commit cannot.
4. **Branch protection on `main`**, because anyone who can change that file can
   make it print the password.

GitHub does not pass secrets to workflows triggered from a fork, so a stranger's
pull request cannot reach them regardless. Do not turn on *Settings → Actions →
Send secrets to workflows from pull requests*; it exists, and it would undo
that.

Adding a **required reviewer** to the environment means every schema change
waits for a human. Worth turning on once more than one person is committing.

## Documentation

- [Agent and contributor notes](AGENTS.md) — conventions that are not obvious
  from reading the code once
- [Product scope](docs/product-scope.md)
- [Architecture](docs/architecture.md)
- [Security model](docs/security-model.md)
- [Membership lifecycle and edge cases](docs/membership-lifecycle.md)
- [Google Workspace integration](docs/google-workspace.md)
- [Slack integration](docs/slack.md)

## Access

This repository is public. Never commit real member data, credentials, tokens,
or environment files. `.env.local` is git-ignored; `.env.example` is the file
that gets committed, and it holds no real values.
