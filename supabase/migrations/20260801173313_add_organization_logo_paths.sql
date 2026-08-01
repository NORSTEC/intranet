update public.organizations as organization
set logo_path = logo.logo_path,
    updated_at = now()
from (
  values
    ('norstec', '/images/logo.png'),
    ('astro-hvl', '/images/organizations/astro-hvl.png'),
    ('eclipse-nmbu', '/images/organizations/eclipse-nmbu.png'),
    ('ignite-uit', '/images/organizations/ignite-uit.png'),
    ('interstellar-uia', '/images/organizations/interstellar-uia.png'),
    ('orbit-ntnu', '/images/organizations/orbit-ntnu.png'),
    ('polarix-uit', '/images/organizations/polarix-uit.png'),
    ('portal-space', '/images/organizations/portal-space.png'),
    ('propulse-ntnu', '/images/organizations/propulse-ntnu.png'),
    ('uis-aerospace', '/images/organizations/uis-aerospace.png')
) as logo(slug, logo_path)
where organization.slug = logo.slug
  and organization.logo_path is distinct from logo.logo_path;
