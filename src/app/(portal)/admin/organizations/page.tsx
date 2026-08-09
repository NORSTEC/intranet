import {
  OrganizationAccessSettings,
  type OrganizationAccess,
} from "@/components/portal/organization-access-settings";
import { requirePortalAdminAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type OrganizationRow = {
  domain_join_policy: string;
  id: number;
  name: string;
};

type DomainRow = {
  domain: string;
  verifiedAt: string | null;
  verificationMethod: "legacy_admin_attestation" | "dns_txt";
};

export default async function OrganizationAccessPage() {
  await requirePortalAdminAccess();

  const supabase = await createClient();
  const organizationsResult = await supabase
    .from("organizations")
    .select("id, name, domain_join_policy")
    .eq("status", "active")
    .order("name");

  if (organizationsResult.error) {
    throw new Error("Could not load organizations");
  }

  const rows = (organizationsResult.data ?? []) as OrganizationRow[];

  // The domain table lives in `private`, so it is read through a function
  // rather than selected. One call per organization, and there are a handful.
  const organizations: OrganizationAccess[] = await Promise.all(
    rows.map(async (row) => {
      const { data, error } = await supabase.rpc("list_organization_domains", {
        p_organization_id: row.id,
      });

      // An empty list is a sentence on this page — "no domain answers for this
      // organization" — and an administrator decides whether to register one
      // from it. A failed read must not be able to say that.
      if (error) {
        throw new Error(`Could not load the domains for ${row.name}`);
      }

      return {
        domains: ((data ?? []) as DomainRow[]).map((domain) => ({
          domain: domain.domain,
          verifiedAt: domain.verifiedAt ?? null,
          verificationMethod: domain.verificationMethod,
        })),
        id: row.id,
        joinPolicy: row.domain_join_policy as OrganizationAccess["joinPolicy"],
        name: row.name,
      };
    }),
  );

  return (
    <>
      <p className="max-w-2xl text-sm opacity-55">
        Which email domains belong to which organization, and what a Google
        account on one of them is worth. The domain proves who somebody is; the
        rule beside it decides whether that is enough to let them in.
      </p>

      <div className="mt-10">
        <OrganizationAccessSettings organizations={organizations} />
      </div>
    </>
  );
}
