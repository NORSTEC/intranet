export type MembershipRole = "member" | "organization_admin";

export type PortalMembership = {
  id: number;
  organizationId: number;
  organizationName: string;
  organizationSlug: string;
  role: MembershipRole;
  status: "active" | "ended";
};

export type AdministeredOrganization = {
  organizationId: number;
  organizationName: string;
  organizationSlug: string;
};

export type PortalProfile = {
  personId: number;
  userId: string;
  email: string;
  avatarPath: string | null;
  avatarAlt: string | null;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  fieldOfStudy: string | null;
  studyYear: number | null;
  phoneNumber: string | null;
  linkedinUrl: string | null;
  onboardingStatus: "pending" | "complete";
};

export type PortalAccessState =
  | { status: "unauthenticated" }
  | { status: "error" }
  | {
      status: "inactive";
      reason: "unclaimed" | "suspended" | "deactivated";
    }
  | {
      status: "authenticated";
      profile: PortalProfile;
      membership: PortalMembership | null;
      memberships: PortalMembership[];
      isPortalAdmin: boolean;
      // Portal access granted to an alumnus who belongs to no organization.
      hasAlumniAccess: boolean;
    };
