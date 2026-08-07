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

Install [Node.js 24+](https://nodejs.org), [pnpm](https://pnpm.io) and
[Docker Desktop](https://docs.docker.com/get-started/get-docker/), and make sure
Docker Desktop is running.

```bash
pnpm install
cp .env.example .env.local
pnpm dev:all
```

Open `http://localhost:3000`. That is the whole setup, and it works the same in
any editor.

## Commands

```bash
pnpm dev:all    # start the database, then the application
pnpm dev        # application only, when the database is already up

pnpm db:start   # local Supabase stack in Docker
pnpm db:reset   # throw the local database away and rebuild it from migrations
pnpm db:stop    # shut the stack down

pnpm check      # typecheck, lint, unit tests and build
pnpm db:test    # the authorization suite, needs the local stack running
```

Run `pnpm check` and `pnpm db:test` before you push. Both are enforced in CI, so
running them first only saves you a round trip.

`http://localhost:54323` is Supabase Studio, a browser interface to the local
database. Mail the portal sends locally is caught at `http://localhost:54324`
rather than delivered.

**Develop against the local database, not the hosted one.** The hosted project
holds real members' names, addresses and sign-in accounts. A mistake there is
not undoable, and the portal is subject to GDPR. If you think you need the
hosted project for something, ask first.

## What Docker is for

Docker Desktop has to be running, but you never open it. `pnpm db:start` uses
it and nothing else does.

Supabase is not one program — it is Postgres, an auth service, a REST layer, a
gateway, storage and a mail catcher, which all have to be versions that match.
Docker ships each as a prebuilt image so everyone gets the same database as CI.
**Your application does not run in Docker:** `pnpm dev` is an ordinary Node
process talking to `localhost:54321`.

Give Docker Desktop at least **8 GB of memory** under *Settings → Resources*.

| What you see | What it means |
| --- | --- |
| `Cannot connect to the Docker daemon` | Docker Desktop is not running |
| `db:start` hangs on health checks | not enough memory |
| `port 54322 already in use` | run `pnpm db:stop`, or another Supabase project is up |

`.devcontainer/devcontainer.json` describes the same setup as a container, if
your editor supports the Dev Container spec. It is optional and nothing depends
on it.

## Documentation

- [Operations](docs/operations.md) — how a change reaches production, and the
  GitHub, Vercel and Supabase settings behind it
- [Agent and contributor notes](AGENTS.md) — conventions that are not obvious
  from reading the code once
- [Product scope](docs/product-scope.md)
- [Architecture](docs/architecture.md)
- [Security model](docs/security-model.md)
- [Membership lifecycle and edge cases](docs/membership-lifecycle.md)
- [Google Workspace integration](docs/google-workspace.md)
- [Slack integration](docs/slack.md)
- [Email](docs/email.md) — the three emails the portal sends, and why they are
  queued in the database rather than sent from the server action

## Access

This repository is public. Never commit real member data, credentials, tokens,
or environment files. `.env.local` is git-ignored; `.env.example` is the file
that gets committed, and it holds no real values.
