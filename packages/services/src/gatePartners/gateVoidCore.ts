// Partner tickets to void (docs/architecture/gate-partner-connectors.md §4).
//
// The partner cannot be told about a refund by API yet. When a partner
// ticket is cancelled or refunded on Abonten (any path: the buyer, the
// organizer, staff, an event cancellation), the trigger
// ticket_gate_partner_cancelled marks its code "to void". This collects
// them — once per code, grouped by event — and tells the organizer, in the
// app and by email, which codes to void in their own gate system so the
// gate stops admitting them. The organizer (or staff) then records them as
// voided.

import { gatePartnerName } from "@abonten/core/gatePartners/gateLinkRules";
import { logger } from "@abonten/core/logger";
import { teamRoleCan } from "@abonten/core/teams/roles";
import type { TeamRoleCode } from "@abonten/types/teamType";
import { createNotificationCore } from "../notifications/createNotification";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

export type GateVoidEmail = {
  /** People to email: the organizer, or a team's Owners and Managers. */
  recipientIds: string[];
  eventId: string;
  eventTitle: string;
  provider: string;
  codes: string[];
};

export type GateVoidDeps = {
  sendVoidEmail?: (email: GateVoidEmail) => Promise<void>;
};

const svc = () => getSupabaseServiceClient();

/** Who acts for an organizer account on its events (a team: by role). */
export async function organizerRecipients(
  organizerId: string,
): Promise<string[]> {
  const { data: team } = await svc()
    .from("team")
    .select("account_id, status")
    .eq("account_id", organizerId)
    .maybeSingle();
  if (!team) return [organizerId];
  if (team.status !== "active") return [];
  const { data: members } = await svc()
    .from("team_member")
    .select("user_id, role")
    .eq("team_id", organizerId)
    .eq("status", "active");
  return (members ?? [])
    .filter((m) => teamRoleCan(m.role as TeamRoleCode, "events.manage"))
    .map((m) => m.user_id as string);
}

/**
 * Tells organizers about codes newly marked "to void". Returns how many
 * codes were reported. A notice that could not be written is put back for
 * the next run.
 */
export async function notifyGatePartnerVoidsCore(
  deps: GateVoidDeps = {},
): Promise<{ events: number; codes: number }> {
  const { data, error } = await svc().rpc("gate_partner_void_claim", {
    p_limit: 500,
  });
  if (error) {
    logger.error(`notifyGatePartnerVoidsCore claim: ${error.message}`);
    return { events: 0, codes: 0 };
  }
  const rows = data ?? [];
  const byEvent = new Map<string, { ticketIds: string[]; codes: string[] }>();
  for (const row of rows) {
    const group = byEvent.get(row.event_id) ?? { ticketIds: [], codes: [] };
    group.ticketIds.push(row.ticket_id);
    group.codes.push(row.partner_code);
    byEvent.set(row.event_id, group);
  }

  let reported = 0;
  for (const [eventId, group] of byEvent) {
    const ok = await notifyOneEvent(eventId, group.codes, deps);
    if (ok) {
      reported += group.codes.length;
    } else {
      await svc()
        .from("gate_partner_ticket")
        .update({ organizer_notified_at: null })
        .in("ticket_id", group.ticketIds);
    }
  }
  return { events: byEvent.size, codes: reported };
}

async function notifyOneEvent(
  eventId: string,
  codes: string[],
  deps: GateVoidDeps,
): Promise<boolean> {
  const db = svc();
  const [{ data: event }, { data: link }] = await Promise.all([
    db
      .from("event")
      .select("title, organizer_id, flyer_public_id, flyer_version")
      .eq("id", eventId)
      .maybeSingle(),
    db
      .from("gate_partner_link")
      .select("provider")
      .eq("event_id", eventId)
      .maybeSingle(),
  ]);
  if (!event?.organizer_id) {
    logger.error(`gate voids: event ${eventId} has no organizer`);
    return false;
  }
  const provider = link?.provider ?? "hapniin";
  const notice = await createNotificationCore(db, {
    userId: event.organizer_id,
    type: "gate_tickets_to_void",
    notice: {
      id: "gate_tickets_to_void",
      params: {
        title: event.title ?? null,
        count: codes.length,
        partner: gatePartnerName(provider),
        codes: codes.slice(0, 20).join(", "),
      },
    },
    link: `/manage/events/${eventId}`,
    data: { kind: "ticket_sale", eventId },
    imagePublicId: event.flyer_public_id ?? null,
    imageVersion: event.flyer_version ?? null,
  });
  if (notice.status !== 200) {
    logger.error(
      `gate voids: notice for ${eventId} failed (${notice.message})`,
    );
    return false;
  }
  if (deps.sendVoidEmail) {
    try {
      const recipientIds = await organizerRecipients(event.organizer_id);
      if (recipientIds.length > 0) {
        await deps.sendVoidEmail({
          recipientIds,
          eventId,
          eventTitle: event.title ?? "",
          provider,
          codes,
        });
      }
    } catch (error) {
      // The in-app notice went; the organizer's page lists the codes.
      logger.error(`gate voids: email for ${eventId} failed`, error);
    }
  }
  return true;
}
