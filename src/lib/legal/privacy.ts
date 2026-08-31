/**
 * The facts the privacy policy states about NORSTEC as an organization, rather
 * than about the intranet as software. Everything else on `/privacy` is written
 * from what the code and the migrations actually do and does not belong here.
 *
 * These are the only parts of the policy that cannot be read out of this
 * repository, which is why they are stated once, here, rather than written into
 * the page: GDPR article 13(1)(a) requires the controller's identity and
 * contact details, and a policy that names neither does not satisfy it.
 */
export const PRIVACY_CONTACT_EMAIL = "intranet@norstec.no";

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
export const PRIVACY_HOSTING_REGION = "Stockholm, Sweden (eu-north-1)";

/**
 * Bumped whenever the policy changes in substance. Article 12 requires
 * material changes to be communicated, and this date is what tells a reader
 * whether what they were shown last time still holds.
 */
export const PRIVACY_LAST_UPDATED = "9 August 2026";
