# Norstec Portal

Norstec Portal is an internal membership system for Norstec and its member
organizations. It will manage member profiles, organizations, teams, roles,
alumni transitions, and access to connected services such as Slack.

> **Status:** Planning. The application has not been scaffolded yet. Development
> must use synthetic data until the privacy and access-control design has been
> reviewed.

## Proposed stack

The stack is not final. The current proposal is:

- Next.js App Router, React, and TypeScript
- Tailwind CSS and shadcn/ui
- Zod for input validation
- Google-only authentication
- PostgreSQL with database-enforced access control
- pnpm, Vitest, and Playwright
- Docker on NTNU OpenStack

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

The application is not initialized yet. Setup commands and required environment
variables will be documented after the architecture and data model have been
approved.

Never commit real member data, credentials, tokens, or production environment
files to this repository.

## Access

This is a private Norstec repository. Licensing and contribution rules must be
defined before sharing the project outside the organization.
