update public.organizations
set logo_path = '/images/organizations/usn-horizon.svg',
    updated_at = now()
where slug = 'usn-horizon'
  and logo_path is distinct from '/images/organizations/usn-horizon.svg';
