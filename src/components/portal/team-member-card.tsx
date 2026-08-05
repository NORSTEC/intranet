import Image from "next/image";
import Link from "next/link";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function LinkedInGlyph({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={compact ? "h-5 w-5" : "h-7 w-7 md:h-8 md:w-8"}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="currentColor"
        d="M6.4 9.2H8.6V18H6.4V9.2ZM7.5 5.5C8.2 5.5 8.8 6.1 8.8 6.8C8.8 7.5 8.2 8.1 7.5 8.1C6.8 8.1 6.2 7.5 6.2 6.8C6.2 6.1 6.8 5.5 7.5 5.5Z"
      />
      <path
        fill="currentColor"
        d="M10.6 9.2H12.7V10.3C13.1 9.6 13.9 9 15.1 9C17.2 9 17.8 10.4 17.8 12.4V18H15.6V12.9C15.6 11.8 15.4 10.9 14.3 10.9C13.2 10.9 12.9 11.7 12.9 12.8V18H10.6V9.2Z"
      />
    </svg>
  );
}

export function TeamMemberCard({
  avatarUrl,
  badges,
  compact = false,
  email,
  href,
  linkedinUrl,
  name,
  phoneNumber,
  roleTitle,
}: {
  avatarUrl?: string;
  badges?: string[];
  compact?: boolean;
  email?: string;
  href: string;
  linkedinUrl: string | null;
  name: string;
  phoneNumber: string | null;
  roleTitle: string | null;
}) {
  const imageBadges = badges ?? (roleTitle ? [roleTitle] : []);
  const contacts = [
    email
      ? { href: `mailto:${email}`, icon: "mail", label: `Email ${name}` }
      : null,
    phoneNumber
      ? {
          href: `tel:${phoneNumber.replace(/[^+\d]/g, "")}`,
          icon: "call",
          label: `Call ${name}`,
        }
      : null,
    linkedinUrl
      ? {
          href: linkedinUrl,
          icon: "linkedin",
          label: `${name} on LinkedIn`,
        }
      : null,
  ].filter(Boolean) as Array<{ href: string; icon: string; label: string }>;

  return (
    <article
      className={`portal-surface portal-card-link flex w-full flex-col ${compact ? "rounded-[1.5rem] p-3" : "p-5"}`}
    >
      <Link aria-label={`View ${name}`} className="group block" href={href}>
        <div
          className={`relative aspect-[4/5] w-full overflow-hidden bg-moody-static ${compact ? "rounded-xl" : "rounded-2xl"}`}
        >
          {avatarUrl ? (
            <Image
              alt={name}
              className="object-cover"
              fill
              sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 90vw"
              src={avatarUrl}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-4xl font-medium text-egg-static">
              {initials(name)}
            </span>
          )}
          {imageBadges.length > 0 && (
            <span
              className={`absolute flex flex-wrap gap-1.5 ${compact ? "left-2 right-2 top-2" : "left-3 right-3 top-3"}`}
            >
              {imageBadges.map((badge) => (
                <span
                  className={`portal-pill portal-pill-filled max-w-full truncate ${compact ? "min-h-6 px-2 py-1 text-[0.58rem]" : ""}`}
                  key={badge}
                >
                  {badge}
                </span>
              ))}
            </span>
          )}
        </div>

        <span
          className={`flex items-center justify-between ${compact ? "mt-3 gap-2" : "mt-5 gap-4"}`}
        >
          <span
            className={`${compact ? "truncate text-base" : "text-xl"} min-w-0 font-medium leading-tight`}
            title={compact ? name : undefined}
          >
            {name}
          </span>
          <span
            className={`material-symbols-outlined shrink-0 transition-transform group-hover:translate-x-1 ${compact ? "text-[1.1rem]" : ""}`}
          >
            trending_flat
          </span>
        </span>
      </Link>

      {contacts.length > 0 && (
        <div
          className={`mt-auto flex flex-wrap ${compact ? "gap-1.5 pt-3" : "gap-2 pt-5"}`}
        >
          {contacts.map((contact) => (
            <a
              aria-label={contact.label}
              className={`portal-contact-button ${compact ? "size-8" : ""}`}
              href={contact.href}
              key={contact.icon}
              rel={contact.icon === "linkedin" ? "noreferrer" : undefined}
              target={contact.icon === "linkedin" ? "_blank" : undefined}
            >
              {contact.icon === "linkedin" ? (
                <LinkedInGlyph compact={compact} />
              ) : (
                <span
                  className={`icon icon-400 icon-filled ${compact ? "text-[1.1rem]" : "icon-20"}`}
                >
                  {contact.icon}
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </article>
  );
}
