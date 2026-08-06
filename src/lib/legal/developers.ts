/**
 * The people who built the portal, shown by the footer's Developers dialog.
 *
 * The address is the key the profile is looked up by, not just something to
 * display: `person_emails.email` is unique and stored lowercase, where a
 * display name is neither. It is repeated here rather than only read from the
 * database because the footer is on the login page too, and a visitor who
 * cannot reach `/members` should still be able to get hold of somebody.
 */
export type PortalDeveloper = {
  email: string;
  name: string;
  role: string;
};

export type ResolvedDeveloper = PortalDeveloper & {
  avatarUrl?: string;
  personId?: number;
};

export const PORTAL_DEVELOPERS: PortalDeveloper[] = [
  {
    email: "eirik.engen.kvam@norstec.no",
    name: "Eirik Engen Kvam",
    role: "Portal developer",
  },
  {
    email: "august.middelkoop@norstec.no",
    name: "August Solli Middelkoop",
    role: "Portal developer",
  },
];
