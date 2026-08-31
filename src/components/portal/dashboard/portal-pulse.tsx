import type { PortalPulse as PortalPulseData } from "@/lib/portal/dashboard";

export function PortalPulse({ pulse }: { pulse: PortalPulseData }) {
  const figures: Array<{ label: string; value: string }> = [
    { label: "Active members", value: String(pulse.activeMembers) },
    { label: "Alumni", value: String(pulse.alumni) },
    { label: "Organizations", value: String(pulse.organizations) },
    { label: "Joined in 30 days", value: `+${pulse.joinedLastMonth}` },
  ];

  return (
    <section aria-labelledby="pulse-heading" className="dashboard-rise">
      <h2 className="text-h2" id="pulse-heading">
        Intranet pulse
      </h2>

      <dl className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {figures.map((figure) => (
          <div className="portal-surface flex min-h-44 flex-col justify-between p-6" key={figure.label}>
            <dt className="text-xs uppercase tracking-[0.14em] opacity-50">{figure.label}</dt>
            <dd className="mt-8 font-display text-5xl font-light">{figure.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
