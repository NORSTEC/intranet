import type { ReactNode } from "react";

/**
 * The one piece of markup every failure page shares.
 *
 * A person who reaches one of these has already lost whatever they were doing,
 * so the page says what happened, offers the way back, and stops. Nothing here
 * reads request state: an error boundary renders on the client after a server
 * component threw, and the reason it threw is exactly the thing not to repeat
 * out loud.
 */
export function FailureNotice({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-6 py-16">
      <h1 className="text-h2">{title}</h1>
      <p className="mt-4 text-sm leading-relaxed opacity-70">{description}</p>
      {action && <div className="mt-8 flex flex-wrap gap-3">{action}</div>}
    </div>
  );
}
