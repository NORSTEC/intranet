# NORSTEC Portal

Internal portal for NORSTEC and member organizations. It manages people,
memberships, teams, roles, alumni access, Google sign-in and connected account
inventories.

The portal is pre-launch. Production prerequisites are tracked in
[Operations](docs/operations.md#launch-checklist).

## Stack

- Next.js App Router, React and TypeScript
- Supabase Auth, Postgres, Storage and Row Level Security
- Tailwind CSS and Material Symbols
- Vercel, Google Workspace, Slack and Resend

## Local setup

Requires Node.js 24+, pnpm and Docker Desktop.

```bash
pnpm install
cp .env.example .env.local
pnpm dev:all
```

Open `http://localhost:3000`. Supabase Studio runs on
`http://localhost:54323`; local email is caught on `http://localhost:54324`.

## Commands

```bash
pnpm dev:all     # local Supabase and Next.js
pnpm check       # typecheck, lint, unit tests and build
pnpm db:reset    # rebuild the local database from every migration
pnpm db:test     # 307 database authorization assertions
pnpm db:stop
```

Use the local database for development. The linked hosted Supabase project
contains personal data; do not run `supabase db push` or inspect hosted data
from a workstation. Migrations are applied by CI after merge to `main`.

## Documentation

- [Architecture](docs/architecture.md)
- [Flow diagrams](docs/flows/README.md)
- [Access and identity](docs/access-and-identity.md)
- [Security](docs/security.md)
- [Privacy and retention](docs/privacy-and-retention.md)
- [Integrations](docs/integrations.md)
- [Operations and launch checklist](docs/operations.md)
- [Contributor notes](AGENTS.md)

## Repository safety

The repository is public. Never commit personal data, credentials, tokens,
exports or environment files. `.env.local` is ignored; `.env.example` contains
local-only values.
