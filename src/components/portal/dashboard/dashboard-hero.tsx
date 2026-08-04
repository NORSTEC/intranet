import { MemberAvatar } from "@/components/portal/member-avatar";

export function DashboardHero({
  avatarUrl,
  greetingName,
  name,
  subtitle,
}: {
  avatarUrl: string | undefined;
  greetingName: string;
  name: string;
  subtitle: string;
}) {
  return (
    <section
      aria-label="Your portal membership"
      className="dashboard-hero dashboard-rise portal-surface-strong px-6 py-9 sm:px-10 sm:py-12"
    >
      <span aria-hidden="true" className="dashboard-hero-star" />

      <div className="relative flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between sm:gap-12">
        <div className="min-w-0">
          <h1 className="text-h1">Hi, {greetingName}</h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-egg/70">{subtitle}</p>
        </div>

        <div className="shrink-0">
          <MemberAvatar name={name} size="hero" src={avatarUrl} />
        </div>
      </div>
    </section>
  );
}
