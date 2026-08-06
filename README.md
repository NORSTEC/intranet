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

### The easy way: Dev Container

Install [Docker](https://docs.docker.com/get-started/get-docker/) and open this
folder in an editor that speaks the Dev Container spec — it is an open standard,
not a VS Code feature:

- **VS Code** with the Dev Containers extension → *Reopen in Container*
- **WebStorm / IntelliJ** → open `.devcontainer/devcontainer.json` and click the
  gutter icon, or use JetBrains Gateway
- **GitHub Codespaces** → *Code → Create codespace*, no local Docker at all

That is the whole setup. The container brings its own Node, pnpm and Docker,
installs dependencies, and creates your `.env.local` from the example. Then:

```bash
pnpm db:start
pnpm dev
```

Nobody has to install a matching Node version or find out the hard way that
theirs is too old. The container is optional — it is a shortcut, not a
requirement, and the next section works just as well.

### Or install the tools yourself

You need [Node.js 24+](https://nodejs.org), [pnpm](https://pnpm.io) and
[Docker](https://docs.docker.com/get-started/get-docker/) running.

```bash
pnpm install
cp .env.example .env.local
pnpm db:start
pnpm dev
```

`pnpm db:start` boots a complete Supabase stack in Docker — Postgres, Auth,
Storage — applies every migration, and prints the URL and key that
`.env.example` already has as its defaults. Open `http://localhost:3000`.

**Develop against the local database, not the hosted one.** The hosted project
holds real members' names, addresses and sign-in accounts. A mistake there is
not undoable, and the portal is subject to GDPR. If you think you need the
hosted project for something, ask first.

Useful afterwards:

```bash
pnpm db:reset   # throw the local database away and rebuild it from migrations
pnpm db:stop    # shut the stack down
```

The Supabase Studio at `http://localhost:54323` is a browser interface to the
local database. Mail the portal sends locally is caught at
`http://localhost:54324` rather than delivered.

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
   `.github/workflows/security.yml` runs CodeQL and blocks the pull request if
   it adds a dependency with a known high-severity vulnerability.
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

## Repository setup

These are GitHub and Vercel settings, not files, so they have to be turned on
by hand. They are what makes the pipeline above worth having.

**Required, and the reason is not bureaucratic.** Vercel deploys `main` to
production automatically, and that deployment holds an identity that can read
the member database and suspend Google Workspace accounts. Anyone who can push
to `main` can run code as that identity.

- **Settings → Branches → add a rule for `main`:** require a pull request,
  require the `Types, lint and build` and `Migrations and authorization tests`
  checks to pass, block force pushes and deletion. If you are the only
  maintainer, do not require approvals — you would lock yourself out — but
  leave everything else on.
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
