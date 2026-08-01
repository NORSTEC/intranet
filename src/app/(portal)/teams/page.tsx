import { PageHeader } from "@/components/portal/page-header";

const teams = [
  ["Propulsion", "Engine development and testing", "16"],
  ["Avionics", "Flight computers and telemetry", "12"],
  ["Structures", "Airframe and mechanical integration", "21"],
  ["Business", "Partnerships and operations", "9"],
];

export default function TeamsPage() {
  return (
    <>
      <PageHeader title="Teams" description="Orbit NTNU" />
      <div className="flex justify-end pb-5">
        <button className="portal-button" type="button"><span className="material-symbols-outlined text-[1.15rem]">add</span>New team</button>
      </div>
      <div className="border-t-2 border-moody">
        {teams.map(([name, description, members]) => (
          <button key={name} type="button" className="group grid w-full items-center gap-2 border-b border-moody/25 py-6 text-left sm:grid-cols-[1fr_1.4fr_auto]">
            <span className="text-xl font-medium">{name}</span>
            <span className="text-sm opacity-55">{description}</span>
            <span className="flex items-center gap-4 text-sm"><span>{members} members</span><span className="material-symbols-outlined transition-transform group-hover:translate-x-1">arrow_right_alt</span></span>
          </button>
        ))}
      </div>
    </>
  );
}
