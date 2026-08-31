import Link from "next/link";
import { FailureNotice } from "@/components/failure-notice";

export default function NotFound() {
  return (
    <FailureNotice
      action={
        <Link className="portal-button" href="/">
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-[1.1rem]"
          >
            home
          </span>
          Go to the intranet
        </Link>
      }
      description="The address does not match anything here. It may have been renamed, or the thing it pointed at may have been removed."
      title="This page does not exist"
    />
  );
}
