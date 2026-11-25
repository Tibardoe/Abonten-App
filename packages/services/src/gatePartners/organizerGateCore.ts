// What an organizer sees of their event's gate partner link, and recording
// codes as voided in the partner's system (docs/architecture/
// gate-partner-connectors.md §5). Staff set the link up; the organizer only
// reads it. Web: getEventGatePartner / confirmGatePartnerVoids; app:
// /api/mobile/organizer/events/:eventId/gate-partner.

import { logger } from "@abonten/core/logger";
import type { EventGatePartner } from "@abonten/types/gatePartnerType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { tr } from "../i18n/requestLocale";
import {
  isAccountRestricted,
  restrictedAccountMessage,
} from "../security/accountStatus";

type Ok<T> = { status: 200; data: T };
type Fail = { status: number; message: string };

async function ownsEvent(
  svc: ServiceRoleClient,
  accountId: string,
  eventId: string,
): Promise<boolean | null> {
  const { data, error } = await svc
    .from("event")
    .select("organizer_id")
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    logger.error(`organizerGate ownsEvent: ${error.message}`);
    return null;
  }
  return data?.organizer_id === accountId;
}

export async function getEventGatePartnerCore(
  svc: ServiceRoleClient,
  accountId: string,
  eventId: string,
): Promise<Ok<EventGatePartner> | Fail> {
  const owns = await ownsEvent(svc, accountId, eventId);
  if (owns === null) return { status: 500, message: tr("somethingWentWrong") };
  if (!owns) return { status: 404, message: tr("eventNotFound") };

  const { data: link, error } = await svc
    .from("gate_partner_link")
    .select(
      "id, provider, partner_event_id, partner_event_title, status, currency",
    )
    .eq("event_id", eventId)
    .in("status", ["active", "paused"])
    .maybeSingle();
  if (error) {
    logger.error(`getEventGatePartnerCore link: ${error.message}`);
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (!link) return { status: 200, data: { linked: false } };

  const [products, pushes, tickets] = await Promise.all([
    svc
      .from("gate_partner_product")
      .select(
        "ticket_type_id, partner_product_id, partner_product_name, partner_price, ticket_type:ticket_type_id(type)",
      )
      .eq("link_id", link.id),
    svc.from("gate_partner_push").select("status").eq("event_id", eventId),
    svc
      .from("gate_partner_ticket")
      .select("ticket_id, partner_code, state, void_requested_at")
      .eq("event_id", eventId),
  ]);
  if (products.error || pushes.error || tickets.error) {
    logger.error(
      `getEventGatePartnerCore: ${products.error?.message ?? pushes.error?.message ?? tickets.error?.message}`,
    );
    return { status: 500, message: tr("somethingWentWrong") };
  }

  const pushRows = pushes.data ?? [];
  const ticketRows = tickets.data ?? [];
  return {
    status: 200,
    data: {
      linked: true,
      provider: link.provider,
      partnerEventId: link.partner_event_id,
      partnerEventTitle: link.partner_event_title,
      status: link.status as "active" | "paused",
      currency: link.currency,
      products: (products.data ?? []).map((p) => ({
        ticketTypeId: p.ticket_type_id,
        ticketType:
          (p.ticket_type as { type?: string | null } | null)?.type ?? "",
        partnerProductId: p.partner_product_id,
        partnerProductName: p.partner_product_name,
        price: Number(p.partner_price),
      })),
      ticketsWithCodes: ticketRows.filter((t) => t.state === "issued").length,
      salesWaiting: pushRows.filter((p) =>
        ["queued", "sending", "ordered"].includes(p.status),
      ).length,
      salesNeedingStaff: pushRows.filter((p) => p.status === "failed").length,
      toVoid: ticketRows
        .filter((t) => t.state === "to_void")
        .map((t) => ({
          ticketId: t.ticket_id,
          code: t.partner_code,
          requestedAt: t.void_requested_at as string,
        }))
        .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)),
      voided: ticketRows.filter((t) => t.state === "voided").length,
    },
  };
}

/**
 * The organizer voided these codes in their gate system. Only codes of
 * this event that are waiting to be voided move; the rest are ignored.
 */
export async function confirmGatePartnerVoidsCore(
  svc: ServiceRoleClient,
  accountId: string,
  actorUserId: string,
  input: { eventId: string; ticketIds: string[] },
): Promise<Ok<{ voided: number }> | Fail> {
  if (await isAccountRestricted(actorUserId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }
  const owns = await ownsEvent(svc, accountId, input.eventId);
  if (owns === null) return { status: 500, message: tr("somethingWentWrong") };
  if (!owns) return { status: 404, message: tr("eventNotFound") };
  if (input.ticketIds.length === 0) return { status: 200, data: { voided: 0 } };

  const { data, error } = await svc
    .from("gate_partner_ticket")
    .update({
      state: "voided",
      voided_at: new Date().toISOString(),
      voided_by: actorUserId,
      voided_by_kind: "organizer",
      updated_at: new Date().toISOString(),
    })
    .eq("event_id", input.eventId)
    .eq("state", "to_void")
    .in("ticket_id", input.ticketIds)
    .select("ticket_id");
  if (error) {
    logger.error(`confirmGatePartnerVoidsCore: ${error.message}`);
    return { status: 500, message: tr("somethingWentWrong") };
  }
  return { status: 200, data: { voided: (data ?? []).length } };
}
