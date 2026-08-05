"use server";

import { requirePortalAdminAccess } from "@/lib/auth/access";
import {
  loadAuditLogEntry,
  type AuditLogEntryDetail,
} from "@/lib/portal/person-audit";

/**
 * One event's full detail, fetched when its row is opened rather than for
 * every row up front: the extra facts need lookups of their own, and a log of
 * hundreds of rows would pay for all of them to show one.
 */
export async function fetchAuditLogEntry(
  eventId: number,
): Promise<AuditLogEntryDetail | null> {
  await requirePortalAdminAccess();

  if (!Number.isSafeInteger(eventId) || eventId <= 0) return null;

  return loadAuditLogEntry(eventId);
}
