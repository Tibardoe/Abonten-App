import { logger } from "@abonten/core/logger";
import { phoneCountry } from "@abonten/core/phone";
import { trFor } from "../i18n/requestLocale";
import { getMarket } from "../markets/marketConfig";
import { createNotificationCore } from "../notifications/createNotification";
import { sendHubtelSms } from "../sms/hubtelSms";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// The notices of an offer. Each is a registry notice
// (@abonten/core/notifications/notices, `ticket_transfer_*`) worded for the
// recipient. Best-effort: a notice that fails never undoes a move. The
// "nobody accepted in time" notice is written by the database job
// (ticket_transfer_expire_due) in the same shape.

type Context = {
  transferId: string;
  ticketId: string;
  eventId: string;
  fromUserId: string;
  toUserId: string | null;
  toPhone: string | null;
  expiresAt: string;
  title: string;
  flyerPublicId: string | null;
  flyerVersion: string | null;
  fromName: string;
  toName: string;
};

async function loadContext(transferId: string): Promise<Context | null> {
  const svc = getSupabaseServiceClient();
  const { data, error } = await svc
    .from("ticket_transfer")
    .select(
      "id, ticket_id, event_id, from_user_id, to_user_id, to_phone, expires_at, event:event_id(title, flyer_public_id, flyer_version)",
    )
    .eq("id", transferId)
    .maybeSingle();
  if (error || !data) {
    if (error) logger.error(`ticketTransferNotices: ${error.message}`);
    return null;
  }
  const event = data.event as unknown as {
    title: string | null;
    flyer_public_id: string | null;
    flyer_version: string | null;
  } | null;
  const ids = [data.from_user_id, data.to_user_id].filter(
    (id): id is string => !!id,
  );
  const { data: users } = await svc
    .from("user_info")
    .select("id, full_name, username")
    .in("id", ids);
  const name = (id: string | null) => {
    const u = (users ?? []).find((row) => row.id === id);
    return u?.full_name?.trim() || u?.username || "";
  };
  return {
    transferId: data.id,
    ticketId: data.ticket_id,
    eventId: data.event_id,
    fromUserId: data.from_user_id,
    toUserId: data.to_user_id,
    toPhone: data.to_phone,
    expiresAt: data.expires_at,
    title: event?.title ?? "",
    flyerPublicId: event?.flyer_public_id ?? null,
    flyerVersion: event?.flyer_version ?? null,
    fromName: name(data.from_user_id),
    toName: name(data.to_user_id),
  };
}

async function send(
  ctx: Context,
  userId: string,
  id: string,
  actor: string,
): Promise<void> {
  await createNotificationCore(getSupabaseServiceClient(), {
    userId,
    type: id,
    notice: { id, params: { actor, title: ctx.title } },
    link: "/manage/my-events",
    data: {
      kind: "ticket_transfer",
      transferId: ctx.transferId,
      ticketId: ctx.ticketId,
      eventId: ctx.eventId,
    },
    imagePublicId: ctx.flyerPublicId,
    imageVersion: ctx.flyerVersion,
  }).catch((error) =>
    logger.error(
      `ticketTransferNotices: ${id} for ${ctx.transferId} failed (${error})`,
    ),
  );
}

/** To the receiver: a ticket is waiting for them. */
export async function noticeTransferReceived(transferId: string) {
  const ctx = await loadContext(transferId);
  if (!ctx?.toUserId) return;
  await send(ctx, ctx.toUserId, "ticket_transfer_received", ctx.fromName);
}

/** To the sender: the receiver took it. */
export async function noticeTransferAccepted(transferId: string) {
  const ctx = await loadContext(transferId);
  if (!ctx) return;
  await send(ctx, ctx.fromUserId, "ticket_transfer_accepted", ctx.toName);
}

/** To the sender: the receiver said no, so the ticket is still theirs. */
export async function noticeTransferDeclined(transferId: string) {
  const ctx = await loadContext(transferId);
  if (!ctx) return;
  await send(ctx, ctx.fromUserId, "ticket_transfer_declined", ctx.toName);
}

/** To the receiver: the sender took the offer back. */
export async function noticeTransferCancelled(transferId: string) {
  const ctx = await loadContext(transferId);
  if (!ctx?.toUserId) return;
  await send(ctx, ctx.toUserId, "ticket_transfer_cancelled", ctx.fromName);
}

/**
 * A text to a number with no account yet, in its market's language. The
 * link opens the website's tickets page, where the offer waits for an
 * account whose verified number is this one. Returns whether the text was
 * accepted by the provider.
 */
export async function textTransferInvite(transferId: string): Promise<boolean> {
  const ctx = await loadContext(transferId);
  if (!ctx?.toPhone) return false;
  const country = phoneCountry(ctx.toPhone);
  const market = country ? await getMarket(country).catch(() => null) : null;
  const t = trFor(market?.defaultLocale ?? "en");
  const base = (
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://abontenhub.com"
  ).replace(/\/+$/, "");
  const hours = Math.max(
    1,
    Math.round((new Date(ctx.expiresAt).getTime() - Date.now()) / 3_600_000),
  );
  // The tickets page, where the offer waits for the account whose verified
  // number this is.
  const link = new URL("/manage/my-events", base).toString();
  const sent = await sendHubtelSms({
    toE164: ctx.toPhone,
    content: t("ticketTransferSmsInvite", {
      sender: ctx.fromName,
      event: ctx.title,
      hours,
      link,
    }),
    clientReference: `tt-${ctx.transferId}`,
  });
  if (!sent.ok) {
    logger.warn(`textTransferInvite: not sent (${sent.detail})`);
    return false;
  }
  return true;
}
