import Link from "next/link";

export type RecommendedAction = {
  description: string;
  href: string;
  icon: string;
  title: string;
};

export function RecommendedActions({ actions }: { actions: RecommendedAction[] }) {
  if (actions.length === 0) return null;

  return (
    <section aria-labelledby="recommended-heading" className="dashboard-rise">
      <h2 className="text-h2" id="recommended-heading">
        Recommended actions
      </h2>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => (
          <Link
            className="portal-surface portal-card-link group flex min-h-64 flex-col p-5"
            href={action.href}
            key={action.href}
          >
            <span
              aria-hidden="true"
              // Google's own `.material-symbols-outlined` rule is unlayered and
              // therefore beats Tailwind's layered utilities, so the size has to
              // be marked important to apply at all.
              className="material-symbols-outlined text-[5.5rem]! leading-none"
            >
              {action.icon}
            </span>
            <h3 className="mt-7 text-2xl font-medium">{action.title}</h3>
            <p className="mt-3 text-sm opacity-55">{action.description}</p>
            <span className="mt-auto flex items-center justify-end pt-8">
              <span
                aria-hidden="true"
                className="material-symbols-outlined transition-transform group-hover:translate-x-1"
              >
                trending_flat
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
