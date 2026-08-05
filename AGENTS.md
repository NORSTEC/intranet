# Agent notes

Project overview, stack, and setup live in [README.md](README.md). Domain and
architecture docs live in [docs/](docs/). This file is agent-specific notes:
things that aren't obvious from reading the code once.

## Commands

```bash
pnpm lint        # eslint .
pnpm typecheck   # tsc --noEmit
pnpm build
pnpm exec supabase test db --local supabase/tests/database/authorization.test.sql
```

Run lint + typecheck before considering a change done.

## Supabase: local CLI, remote database

`supabase/.temp/project-ref` links this repo to a **hosted** Supabase project,
and `.env.local` points `next dev` at that same hosted project — not the local
Docker instance `supabase status` reports. `npx supabase db push` /
`migration list` talk to that hosted project too. There is effectively no
separate local dev database in normal use; treat the linked project as shared,
real state.

**Migrations are append-only.** Editing the body of an already-applied
migration file does nothing to the deployed database — it only replays on a
fresh `db reset`. If a deployed function/policy needs to change, write a new
timestamped migration that `create or replace`s it. Verify suspected drift
between a migration file and deployed reality with a throwaway debug RPC
using `pg_get_functiondef('schema.fn(args)'::regprocedure)` rather than
assuming the migration file is what's live — this exact drift (a missing `OR
is_portal_admin()` clause in `private.is_organization_admin`, fixed in
`20260803000300_fix_organization_admin_drift.sql`) caused a real bug.

After adding/changing an RPC, add its signature to the `Functions` block in
`src/lib/supabase/database.types.ts` by hand or via
`npx supabase gen types typescript --local`. If regenerating, `diff` before
overwriting — the file is large and hand-maintained edits from other
in-progress work can be present; don't clobber them.

## Auth model

`src/lib/auth/access.ts` is the single source of truth for page-level access:
`requirePortalAccess`, `requireOrganizationAdminAccess`,
`requirePortalAdminAccess`. Portal admins (`portal_administrators` table /
`private.is_portal_admin()`) are meant to implicitly have organization-admin
rights everywhere, including for orgs they hold no personal membership in —
mirrored on the DB side by `private.is_organization_admin` OR-ing against
`is_portal_admin()`. If a write RPC guarded by `is_organization_admin`
unexpectedly 42501s for a known portal admin, suspect drift (see above)
before suspecting the caller.

## Edit-form pattern

Settings/profile-style pages follow one pattern, don't reinvent it:

- List/picker page redirects straight through when the user only has one
  choice (see `administration/members/page.tsx`,
  `administration/organization/page.tsx`).
- Single page, no separate view/edit mode — the settings page *is* the edit
  form. Dirty-tracking form (`onChange` sets dirty, `reset` clears it),
  confirm-before-submit dialog, disabled Save/Revert until dirty. See
  `components/portal/organization-edit-form.tsx` and
  `components/portal/profile-edit-form.tsx`. No Cancel button — Revert plus
  normal navigation is enough.
- Server actions validate input, then call a `security definer` Postgres RPC
  that re-validates and does an optimistic-concurrency update keyed on an
  `expected_updated_at` param matched against the row's `updated_at` (set by
  a `before update` trigger). On mismatch the RPC raises a distinct error
  code the action maps to a `*_conflict` search-param the page renders as a
  `Toast`.

## UI conventions

Four rules that cut across most portal components:

- **Portal management calls them *people*, never *users* or *profiles*.**
  "Manage people", "Deleted people", "Delete this person", "No deleted people
  match these filters". The three words used to be mixed within a single card.
  *Profile* survives in one place only, and means something different there:
  `/profile`, the page where someone edits their own details.

- **Every button carries a Material Symbols icon.** A `portal-button` (or
  `portal-button-danger`) renders
  `<span aria-hidden="true" className="material-symbols-outlined text-[1.1rem]">`
  before its label — including secondary and dismissive buttons. Cancel is
  always `close`; a button in a pending state swaps its icon for
  `progress_activity`. Filter *pills* are not buttons in this sense and keep
  their own leading icon convention (`FilterMenu`'s `icon` prop).
- **People tables mark the signed-in person's own row with `<YouPill />`**
  (`components/portal/you-pill.tsx`) — a beachball-filled `portal-pill` sitting
  next to the name, never a sentence like "This is you". The table component
  takes a `currentPersonId: number` prop and the row data carries a
  `personId`; the server page passes `access.profile.personId`. Applied in
  `portal-people-registry.tsx`, `members-directory.tsx` and
  `member-status-manager.tsx` — any new people-listing table should do the
  same.
- **Search boxes are `type="text"`, never `type="search"`.** A search input
  draws the browser's own clear button — a second, unstyled "×" sitting on top
  of the magnifier icon every portal search box already places at
  `absolute right-3`. Filtering is live, so there is nothing to clear that
  selecting the text does not. Copy the pattern in `members-directory.tsx`:
  a `relative` label, `className="portal-field w-full pr-10"`, a `sr-only`
  span for the label, and the trailing `material-symbols-outlined` magnifier.

## Table structure

Every listing table in the portal is built the same way. `deleted-people-table.tsx`
and `portal-people-registry.tsx` are the two to copy from; a new table that
invents its own shape will look wrong next to them.

- **A controls row above the table**, always:
  `mt-8 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between`,
  with `FilterMenu` pills on the left and **a search box on the right** — every
  table is searchable, there is no such thing as a portal table you cannot
  filter by typing. With no filters, keep the row and use `xl:justify-end`.
- `<table className="w-full min-w-[Nrem] border-collapse">` inside
  `<div className="mt-8 overflow-x-auto">`, with a `<caption className="sr-only">`
  describing what the rows are and what the columns say.
- Headers are `SortableTableHeader` (`sortable-table-header.tsx`), which owns
  `scope="col"`, `aria-sort` and the three-state sort cycle
  (ascending → descending → unsorted). A non-sortable trailing **Actions**
  column is a plain
  `<th className="pb-3 pr-4 text-right font-semibold italic" scope="col">`.
- Rows are `<tr className="border-b border-moody">`; cells are `py-3 pr-5`,
  the first `py-3 pl-4 pr-5` and the last `py-3 pr-4`.
- **No pills inside table cells.** A cell holds plain text — `portal-pill` is
  for filter menus and `YouPill`, not for restating a value the column header
  already names. State that reads as a flag gets a yes/no column
  (`Suspended` → `Yes`/`No`), not a coloured badge.
- Actions live in the last cell as full `portal-button`s inside
  `<div className="flex flex-wrap justify-end gap-3">`, each
  `whitespace-nowrap`. A row carrying action buttons is **not** itself
  clickable — put a navigating button in the Actions cell instead, since
  nesting interactive elements breaks both keyboard and screen-reader use.
- The empty state is a sibling `<p className="mt-8 text-sm opacity-55">` that
  distinguishes "nothing exists" from "nothing matches these filters".

## Menu active state

A menu item stays active for every page under its href, not just the exact
match: `/members/42` keeps `Members` lit, `/admin/people/42` keeps `Portal
management` lit. `isActiveNavigationItem` in
`components/portal/portal-shell.tsx` is the single place this is decided, and
it applies to every item — there is no per-item opt-in, and a new nav item
needs no flag. Two things it relies on: the prefix test appends a slash, so
`/admin` never claims `/administration/...`, and `/` is matched exactly
because every path starts with it. A new route placed under an existing
section therefore needs nothing; a new *section* whose href is a prefix of
another one does, so avoid that.

## Breadcrumbs

`components/portal/portal-shell.tsx`'s `Breadcrumbs()` builds crumbs from URL
segments. `/administration` has no page of its own, so its segment is always
skipped. A page can override or hide a specific crumb via
`PortalBreadcrumbData` (`components/portal/portal-breadcrumb-data.tsx`) —
pass `null` for a segment's href to drop that crumb entirely (used when a
list page redirects through and showing the item name would be redundant).
