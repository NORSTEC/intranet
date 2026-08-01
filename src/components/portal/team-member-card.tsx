import Image from "next/image";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function LinkedInGlyph() {
  return (
    <svg aria-hidden="true" className="size-7" fill="none" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M6.4 9.2h2.2V18H6.4V9.2Zm1.1-3.7a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Zm3.1 3.7h2.1v1.1c.4-.7 1.2-1.3 2.4-1.3 2.1 0 2.7 1.4 2.7 3.4V18h-2.2v-5.1c0-1.1-.2-2-1.3-2s-1.4.8-1.4 1.9V18h-2.3V9.2Z"
      />
    </svg>
  );
}

export function TeamMemberCard({
  avatarUrl,
  linkedinUrl,
  name,
  roleTitle,
}: {
  avatarUrl?: string;
  linkedinUrl: string | null;
  name: string;
  roleTitle: string | null;
}) {
  return (
    <article className="group w-full">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-moody-static">
        {avatarUrl ? (
          <Image
            alt={name}
            className="object-cover transition duration-700 ease-out group-hover:scale-[1.04]"
            fill
            sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 90vw"
            src={avatarUrl}
            unoptimized
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-4xl font-medium text-egg-static">
            {initials(name)}
          </span>
        )}
        {roleTitle && (
          <span className="absolute left-3 top-3 rounded-full bg-moody-static px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-egg-static">
            {roleTitle}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 py-2">
        <h3 className="font-medium uppercase leading-tight">{name}</h3>
        {linkedinUrl && (
          <div className="flex items-center gap-3">
            <a
              aria-label={`${name} on LinkedIn`}
              className="portal-social-button"
              href={linkedinUrl}
              rel="noreferrer"
              target="_blank"
            >
              <LinkedInGlyph />
            </a>
          </div>
        )}
      </div>
    </article>
  );
}
