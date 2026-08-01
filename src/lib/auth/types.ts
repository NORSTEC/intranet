export type PortalRole = "member" | "organization_admin" | "norstec_admin";

export type PortalMembership = {
  id: number;
  organizationId: number;
  organizationName: string;
  organizationSlug: string;
  role: PortalRole;
};

export type PortalProfile = {
  personId: number;
  userId: string;
  email: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  fieldOfStudy: string | null;
  studyYear: number | null;
};

export type PortalAccessState =
  | { status: "unauthenticated" }
  | { status: "error" }
  | {
      status: "authenticated";
      profile: PortalProfile;
      membership: PortalMembership | null;
      memberships: PortalMembership[];
    };
