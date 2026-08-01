begin;

update public.people
set source = 'manual'
where source = 'sanity';

update public.person_emails
set source = 'manual'
where source = 'sanity';

update public.memberships
set provisioning_method = 'manual'
where provisioning_method = 'sanity_import';

alter table public.people
  drop constraint people_source_check,
  add constraint people_source_check
    check (source in ('manual', 'google')),
  drop column sanity_id;

alter table public.person_emails
  drop constraint person_emails_source_check,
  add constraint person_emails_source_check
    check (source in ('manual', 'google'));

alter table public.memberships
  drop constraint memberships_provisioning_method_check,
  add constraint memberships_provisioning_method_check
    check (provisioning_method in ('domain', 'access_request', 'manual'));

alter table public.organizations
  drop column sanity_id;

alter table public.teams
  drop column sanity_id;

alter table public.team_memberships
  drop column sanity_key;

commit;
