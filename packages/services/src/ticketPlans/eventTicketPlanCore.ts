import { logger } from "@abonten/core/logger";
import type { EventTicketPlanSetting } from "@abonten/types/ticketPlanType";
import { tr } from "../i18n/requestLocale";
import {
  isAccountRestricted,
  restrictedAccountMessage,
} from "../security/accountStatus";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { resolveTicketPlanAccess } from "./ticketPlanProgram";

// The organizer's side of Pay small small: one switch per event, and what
// plans hold on it right now. Switching it off stops new plans only; plans
// already running keep their seats until they finish or end.

async function ownedEvent(
  userId: string,
  eventId: string,
): Promise<"ok" | "missing" | "error"> {
  const { data, error } = await getSupabaseServiceClient()
    .from("event")
    .select("id")
    .eq("id", eventId)
    .eq("organizer_id", userId)
    .maybeSingle();
  if (error) {
    logger.error(`eventTicketPlan: event read failed (${error.message})`);
    return "error";
  }
  return data ? "ok" : "missing";
}

async function readSetting(
  userId: string,
  eventId: string,
): Promise<EventTicketPlanSetting | null> {
  const service = getSupabaseServiceClient();
  const [{ program }, setting, plans] = await Promise.all([
    resolveTicketPlanAccess(service, userId),
    service
      .from("event_ticket_plan_setting")
      .select("enabled")
      .eq("event_id", eventId)
      .maybeSingle(),
    service
      .from("ticket_plan")
      .select("status, currency, paid_minor, checkout_session_id")
      .eq("event_id", eventId)
      .in("status", ["awaiting_payment", "active", "settling", "completed"]),
  ]);
  if (setting.error || plans.error) {
    logger.error(
      `eventTicketPlan: read failed (${setting.error?.message ?? plans.error?.message})`,
    );
    return null;
  }

  const open = (plans.data ?? []).filter((p) => p.status !== "completed");
  let ticketsHeld = 0;
  if (open.length > 0) {
    const { data: held } = await service
      .from("ticket_checkout")
      .select("quantity")
      .in(
        "checkout_session_id",
        open.map((p) => p.checkout_session_id),
      )
      .eq("status", "on_plan");
    ticketsHeld = (held ?? []).reduce((s, r) => s + Number(r.quantity), 0);
  }
  const paid = new Map<string, number>();
  for (const p of open) {
    paid.set(p.currency, (paid.get(p.currency) ?? 0) + Number(p.paid_minor));
  }

  return {
    available: program.enabled,
    enabled: setting.data?.enabled === true,
    openPlans: open.length,
    ticketsHeld,
    completedPlans: (plans.data ?? []).length - open.length,
    paidTowards: [...paid.entries()].map(([currency, amountMinor]) => ({
      currency,
      amountMinor,
    })),
  };
}

export async function getEventTicketPlanSettingCore(
  userId: string,
  eventId: string,
): Promise<
  | { status: 200; data: EventTicketPlanSetting }
  | { status: 404 | 500; message: string }
> {
  const owned = await ownedEvent(userId, eventId);
  if (owned === "error") {
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (owned === "missing") return { status: 404, message: tr("noEventFound") };
  const setting = await readSetting(userId, eventId);
  if (!setting) return { status: 500, message: tr("somethingWentWrong") };
  return { status: 200, data: setting };
}

export async function setEventTicketPlanSettingCore(
  userId: string,
  input: { eventId: string; enabled: boolean },
): Promise<
  | { status: 200; data: EventTicketPlanSetting; message: string }
  | { status: 403 | 404 | 500; message: string }
> {
  const owned = await ownedEvent(userId, input.eventId);
  if (owned === "error") {
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (owned === "missing") return { status: 404, message: tr("noEventFound") };
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }

  const service = getSupabaseServiceClient();
  if (input.enabled) {
    const { program } = await resolveTicketPlanAccess(service, userId);
    if (!program.enabled) {
      return { status: 403, message: tr("paySmallSmallIsnTAvailableFor") };
    }
  }

  const { error } = await service.from("event_ticket_plan_setting").upsert(
    {
      event_id: input.eventId,
      enabled: input.enabled,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    },
    { onConflict: "event_id" },
  );
  if (error) {
    logger.error(`eventTicketPlan: save failed (${error.message})`);
    return { status: 500, message: tr("somethingWentWrong") };
  }

  const setting = await readSetting(userId, input.eventId);
  if (!setting) return { status: 500, message: tr("somethingWentWrong") };
  return {
    status: 200,
    data: setting,
    message: input.enabled
      ? tr("buyersCanNowPaySmallSmall")
      : setting.openPlans > 0
        ? tr("noNewPlansCanStartRunning")
        : tr("paySmallSmallIsOffForThis"),
  };
}
