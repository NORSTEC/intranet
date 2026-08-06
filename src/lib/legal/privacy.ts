/**
 * The facts the privacy policy states about NORSTEC as an organization, rather
 * than about the portal as software. Everything else on `/privacy` is written
 * from what the code and the migrations actually do and does not belong here.
 *
 * The placeholders below are the only parts of the policy that cannot be read
 * out of this repository. They must be filled in before the portal is opened
 * to members: GDPR article 13(1)(a) requires the controller's identity and
 * contact details, and a policy that names neither does not satisfy it.
 */
export const PRIVACY_CONTACT_EMAIL = "portal@norstec.no";

export const PRIVACY_CONTROLLER = {
  legalName: "NORSTEC",
  /** Organisasjonsnummer from Brønnøysundregistrene. */
  organizationNumber: "933031152",
  postalAddress: "Sem Sælands vei 1, 7034 TRONDHEIM",
  contactEmail: PRIVACY_CONTACT_EMAIL,
} as const;

/**
 * Where the database and its backups physically live. Article 13(1)(f) only
 * requires this to be stated when data leaves the EU/EEA, but naming the
 * region is the cheapest way to make that question answerable.
 */
export const PRIVACY_HOSTING_REGION =
  "[Supabase project region — fill in before launch]";

/**
 * Bumped whenever the policy changes in substance. Article 12 requires
 * material changes to be communicated, and this date is what tells a reader
 * whether what they were shown last time still holds.
 */
export const PRIVACY_LAST_UPDATED = "6 August 2026";
