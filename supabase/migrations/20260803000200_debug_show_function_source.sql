begin;

create or replace function public.debug_show_function_source(p_function_signature text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.pg_get_functiondef(p_function_signature::regprocedure);
$$;

revoke all on function public.debug_show_function_source(text) from public, anon;
grant execute on function public.debug_show_function_source(text) to authenticated;

commit;
