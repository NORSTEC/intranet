import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { isNotificationKind, renderNotification } from "@/lib/email/templates";
import { sendEmail, siteUrl } from "@/lib/email/transport";

/**
 * Drains the notification queue that the decision RPCs write to.
 *
 * The portal holds no privileged Supabase key — every write goes through a
 * `security definer` function as the signed-in person — so this runs as that
 * person too, and `claim_pending_notifications` only hands over rows they
 * caused, plus anything left stranded if they are a portal administrator.
 * That second case is the only retry there is: a send that fails is picked up
 * the next time any portal administrator makes a decision. It is not a worker,
 * and pretending otherwise would mean holding a key that can read every
 * member's address, which is a worse trade than a late email.
 *
 * Nothing here throws. It is called from `after()`, where a rejection would
 * be logged and dropped anyway, and where the decision itself has already
 * been committed and shown to the administrator. An email that cannot be
 * sent must not make a successful approval look failed.
 */
export async function drainNotifications(
  supabase: SupabaseClient<Database>,
): Promise<void> {
  const { data, error } = await supabase.rpc("claim_pending_notifications", {
    p_limit: 20,
  });

  if (error) {
    console.error("[email] could not claim queued notifications", error.message);
    return;
  }

  const site = siteUrl();

  for (const notification of data ?? []) {
    if (!isNotificationKind(notification.kind)) {
      // The check constraint on the table and the union in `templates.tsx`
      // are two lists that have to agree. If they ever stop agreeing, leave
      // the row alone rather than settling it — an unsent row is visible in
      // the queue, a wrongly deleted one is gone.
      console.error(`[email] no template for notification kind ${notification.kind}`);
      continue;
    }

    let failure: string | null = null;

    try {
      const message = renderNotification(notification.kind, {
        payload: (notification.payload ?? {}) as Record<string, unknown>,
        recipientName: notification.recipient_name,
        siteUrl: site,
      });

      await sendEmail({
        html: message.html,
        subject: message.subject,
        text: message.text,
        to: notification.recipient_email,
      });
    } catch (cause) {
      failure = cause instanceof Error ? cause.message : "The email could not be sent.";
      console.error(
        `[email] failed to send ${notification.kind} notification`,
        failure,
      );
    }

    const { error: settleError } = await supabase.rpc("settle_notification", {
      p_error: failure,
      p_id: notification.id,
    });

    if (settleError) {
      // The row keeps its claim and its attempt count, so the five-minute
      // claim timeout releases it rather than it being sent twice in a row.
      console.error("[email] could not settle notification", settleError.message);
    }
  }
}
