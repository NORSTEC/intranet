import Link from "next/link";
import { MemberAvatar } from "@/components/portal/member-avatar";
import { formatMonth, type DashboardNewMember } from "@/lib/portal/dashboard";

export function NewMemberCard({ member }: { member: DashboardNewMember }) {
  return (
    <Link
      className="portal-surface portal-card-link group flex items-center gap-4 p-4"
      href={`/members/${member.personId}`}
    >
      <MemberAvatar name={member.name} src={member.avatarUrl} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{member.name}</span>
        {/* A member without a field of study keeps the line's height, so the
            cards in the row stay the same size. */}
        <span className="mt-0.5 block truncate text-sm opacity-55">
          {member.fieldOfStudy ?? "\u00a0"}
        </span>
        {/* The arrow shares the joined line rather than sitting on a row of its
            own, which is what keeps these cards as short as their content. */}
        <span className="mt-1 flex items-center justify-between gap-3">
          <span className="truncate text-xs uppercase tracking-[0.08em] opacity-40">
            Joined {formatMonth(member.joinedOn)}
          </span>
          <span
            aria-hidden="true"
            className="material-symbols-outlined shrink-0 transition-transform group-hover:translate-x-1"
          >
            trending_flat
          </span>
        </span>
      </span>
    </Link>
  );
}
