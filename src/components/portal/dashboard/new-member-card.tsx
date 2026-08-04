import Link from "next/link";
import { MemberAvatar } from "@/components/portal/member-avatar";
import { formatMonth, type DashboardNewMember } from "@/lib/portal/dashboard";

export function NewMemberCard({ member }: { member: DashboardNewMember }) {
  return (
    <Link
      className="portal-surface portal-card-link group flex flex-col p-4"
      href={`/members/${member.personId}`}
    >
      <span className="flex items-center gap-4">
        <MemberAvatar name={member.name} src={member.avatarUrl} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{member.name}</span>
          {/* A member without a field of study keeps the line's height, so the
              cards in the row stay the same size. */}
          <span className="mt-0.5 block truncate text-sm opacity-55">
            {member.fieldOfStudy ?? "\u00a0"}
          </span>
          <span className="mt-1 block truncate text-xs uppercase tracking-[0.08em] opacity-40">
            Joined {formatMonth(member.joinedOn)}
          </span>
        </span>
      </span>
      <span className="mt-auto flex justify-end pt-4">
        <span
          aria-hidden="true"
          className="material-symbols-outlined transition-transform group-hover:translate-x-1"
        >
          trending_flat
        </span>
      </span>
    </Link>
  );
}
