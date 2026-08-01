# Norstec Portal

Norstec Portal is an internal membership system for Norstec and its member
organizations. It will manage member profiles, organizations, teams, roles,
alumni transitions, and access to connected services such as Slack.

> **Status:** Authentication foundation and frontend prototype. Google OAuth is
> connected through Supabase, while portal pages still use synthetic data.
> Database authorization, memberships, and access requests are not connected yet.

## Stack

The current frontend uses:

- Next.js App Router, React, and TypeScript
- Tailwind CSS and Material Symbols
- The shared Norstec visual identity and light/dark theme behavior
- Supabase Auth with server-side session cookies
- pnpm

PostgreSQL schema migrations, database-enforced authorization, automated tests,
and deployment to NTNU OpenStack are planned but not implemented.

## Repository approach

Start with one full-stack Next.js application rather than separate frontend and
backend projects. Browser-safe code and server-only code will still be kept in
separate directories. A separate worker or API can be introduced later if a
demonstrated need arises.

## Documentation

- [Product scope](docs/product-scope.md)
- [Proposed architecture](docs/architecture.md)
- [Security model](docs/security-model.md)

## Development

Install dependencies and start the local development server:

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The current prototype includes:

- `/` — dashboard
- `/login` — Google-only sign-in concept
- `/access` — membership request
- `/profile` — member profile
- `/teams` — team directory
- `/organization` — organization administration
- `/admin` — Norstec administration

Before submitting changes, run:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Never commit real member data, credentials, tokens, or production environment
files to this repository.

## Access

This is a private Norstec repository. Licensing and contribution rules must be
defined before sharing the project outside the organization.
