# Contributor notes

Read [README.md](README.md) first. Domain rules are in [docs](docs/).

## Required checks

```bash
pnpm check       # types, lint, unit tests, build
pnpm db:test     # 307 authorization assertions; local Supabase required
```

Run `db:test` after changing a migration, RLS policy or RPC.

## Database

- Develop against local Supabase. Never run hosted `db push` or migration
  commands manually; `.github/workflows/migrate.yml` owns production changes.
- Migrations are append-only after deployment. Change deployed behavior in a
  new timestamped migration.
- Authorization belongs in RLS and database functions, not UI filtering.
- Use `security definer`, `search_path = ''`, short timeouts, explicit grants
  and database-side validation for mutation RPCs.
- Update `src/lib/supabase/database.types.ts` when an RPC or column changes.
- Update the matching [flow diagram](docs/flows/README.md) when a route, RPC,
  authorization decision or lifecycle transition changes.
- Page-level access goes through `src/lib/auth/access.ts`. Portal and
  organization administrators require AAL2/MFA.

## Identity and personal data

- Never authorize from `raw_user_meta_data`; users can edit it. Stable Google
  identity comes from `auth.identities.provider_id`.
- Authentication, person, email, membership and administrator role are
  separate records. Do not infer one from another outside the documented flow.
- Profile writes go through `save_own_profile_v6`; direct table writes are
  intentionally revoked.
- Queue email inside the database transaction that makes the decision. Add a
  notification kind to the database constraint, TypeScript union, template and
  privacy inventory together.

## UI

- Management calls records “people”; “profile” means the signed-in person’s
  own page.
- Every `portal-button` has a Material Symbols icon. Pending actions use
  `progress_activity`; cancel uses `close`.
- Edit pages use one dirty-tracked form, optimistic concurrency and a distinct
  conflict toast. Copy the existing organization/profile form pattern.
- People tables use `SortableTableHeader`, an Actions column, search and
  filters. Do not make rows clickable when they contain buttons.
- Search inputs use `type="text"`; the portal supplies its own search icon.
- Mark the signed-in person with `YouPill` in every people table.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
