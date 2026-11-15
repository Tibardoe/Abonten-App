import { logger } from "@abonten/core/logger";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  TicketTransferAdminSettings,
  TicketTransferStatus,
} from "@abonten/types/ticketTransferType";
import type { TicketTransferSettingsInput } from "@abonten/validation/ticketTransferSchemas";
import {
  isTicketTransfersKillSwitchOn,
  mapTicketTransferSettings,
  readTicketTransferSettings,
  resetTicketTransferSettingsCache,
} from "../../ticketTransfers/ticketTransferProgram";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// Admin › Ticket transfers (docs/architecture/ticket-transfers.md): the
// programme switches and rules, and the offers people made, so support can
// answer "where did my ticket go?". Staff never move a ticket here; the
// only staff move is support's, after an account takeover, and it is not
// built yet. Every settings change is audited.

type RequestMeta = Record<string, unknown> | undefined;

const denied = <T>(e: unknown): AdminEnvelope<T> =>
  adminError(e) as AdminEnvelope<T>;

export async function getTicketTransferSettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<
  AdminEnvelope<{ settings: TicketTransferAdminSettings; killSwitch: boolean }>
> {
  try {
    assertPermission(ctx, "transfers.view");
  } catch (e) {
    return denied(e);
  }
  const row = await readTicketTransferSettings(supabase, { fresh: true }).catch(
    () => null,
  );
  if (!row) return { status: 500, message: "Couldn't load the settings." };
  return {
    status: 200,
    data: {
      settings: mapTicketTransferSettings(row),
      killSwitch: isTicketTransfersKillSwitchOn(),
    },
  };
}

const COLUMN: Record<keyof TicketTransferSettingsInput["patch"], string> = {
  enabled: "enabled",
  audience: "audience",
  betaUserIds: "beta_user_ids",
  maxMoves: "max_moves",
  acceptHours: "accept_hours",
  textsPerSenderPerDay: "texts_per_sender_per_day",
};

export async function updateTicketTransferSettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: TicketTransferSettingsInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<TicketTransferAdminSettings>> {
  try {
    assertPermission(ctx, "transfers.configure");
  } catch (e) {
    return denied(e);
  }
  const beforeRow = await readTicketTransferSettings(supabase, {
    fresh: true,
  }).catch(() => null);
  if (!beforeRow) {
    return { status: 500, message: "Couldn't load the settings." };
  }
  const before = mapTicketTransferSettings(beforeRow);

  const update: Record<string, unknown> = {};
  const changed: (keyof TicketTransferAdminSettings)[] = [];
  for (const [key, value] of Object.entries(input.patch)) {
    const column = COLUMN[key as keyof typeof COLUMN];
    if (!column || value === undefined) continue;
    if (
      JSON.stringify(before[key as keyof TicketTransferAdminSettings]) ===
      JSON.stringify(value)
    ) {
      continue;
    }
    update[column] = value;
    changed.push(key as keyof TicketTransferAdminSettings);
  }
  if (changed.length === 0) return { status: 400, message: "Nothing changed." };
  update.updated_at = new Date().toISOString();
  update.updated_by = ctx.userId;

  const { data, error } = await supabase
    .from("ticket_transfer_program_setting")
    .update(update as never)
    .eq("id", 1)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("*")
    .maybeSingle();
  if (error) {
    logger.error(`updateTicketTransferSettingsCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't save the settings." };
  }
  if (!data) {
    return {
      status: 409,
      message: "Someone else changed these settings. Reload and try again.",
    };
  }
  resetTicketTransferSettingsCache();
  const after = mapTicketTransferSettings(data);
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "transfers.settings.update",
    targetType: "ticket_transfer_program_setting",
    targetId: "1",
    summary: `Ticket transfer settings changed: ${changed.join(", ")}`,
    reason: input.reason,
    before: Object.fromEntries(changed.map((k) => [k, before[k]])),
    after: Object.fromEntries(changed.map((k) => [k, after[k]])),
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Settings saved.", data: after };
}

export type TicketTransferAdminRow = {
  id: string;
  status: TicketTransferStatus;
  cancelReason: string | null;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  ticketId: string;
  eventId: string;
  eventTitle: string | null;
  from: { id: string; label: string };
  to: { id: string; label: string } | null;
  /** Only the last four digits: staff do not need the whole number here. */
  toPhoneEnding: string | null;
  textSent: boolean;
};

/**
 * The latest offers, newest first, or every offer of one person or one
 * ticket (a ticket id, or a code as printed: support reads it off the
 * holder's screen).
 */
export async function listTicketTransfersAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filter: { userId?: string | null; ticket?: string | null } = {},
): Promise<AdminEnvelope<TicketTransferAdminRow[]>> {
  try {
    assertPermission(ctx, "transfers.view");
  } catch (e) {
    return denied(e);
  }
  let ticketId: string | null = null;
  const ticket = filter.ticket?.trim();
  if (ticket) {
    if (/^[0-9a-f-]{36}$/i.test(ticket)) {
      ticketId = ticket;
    } else {
      // Only code characters reach the filter string.
      const code = ticket.toUpperCase().replace(/[^A-Z0-9-]/g, "");
      if (!code) return { status: 200, data: [] };
      const { data } = await supabase
        .from("ticket_transfer")
        .select("ticket_id")
        .or(`from_code.eq.${code},to_code.eq.${code}`)
        .limit(1)
        .maybeSingle();
      const { data: live } = data
        ? { data: null }
        : await supabase
            .from("ticket")
            .select("id")
            .eq("ticket_code", code)
            .maybeSingle();
      ticketId = data?.ticket_id ?? live?.id ?? null;
      if (!ticketId) return { status: 200, data: [] };
    }
  }

  let query = supabase
    .from("ticket_transfer")
    .select(
      "id, status, cancel_reason, created_at, expires_at, decided_at, ticket_id, event_id, from_user_id, to_user_id, to_phone, text_sent_at, event:event_id(title)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (ticketId) query = query.eq("ticket_id", ticketId);
  if (filter.userId && !/^[0-9a-f-]{36}$/i.test(filter.userId)) {
    return { status: 400, message: "That is not a user id." };
  }
  if (filter.userId) {
    query = query.or(
      `from_user_id.eq.${filter.userId},to_user_id.eq.${filter.userId}`,
    );
  }
  const { data, error } = await query;
  if (error) {
    logger.error(`listTicketTransfersAdminCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't load the transfers." };
  }
  type Row = {
    id: string;
    status: string;
    cancel_reason: string | null;
    created_at: string;
    expires_at: string;
    decided_at: string | null;
    ticket_id: string;
    event_id: string;
    from_user_id: string;
    to_user_id: string | null;
    to_phone: string | null;
    text_sent_at: string | null;
    event: { title: string | null } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const ids = [
    ...new Set(rows.flatMap((r) => [r.from_user_id, r.to_user_id ?? ""])),
  ].filter(Boolean);
  const { data: people } = ids.length
    ? await supabase
        .from("user_info")
        .select("id, username, full_name")
        .in("id", ids)
    : { data: [] };
  const label = (id: string) => {
    const p = (people ?? []).find((u) => u.id === id);
    return p?.username ? `@${p.username}` : (p?.full_name ?? id.slice(0, 8));
  };
  return {
    status: 200,
    data: rows.map((r) => ({
      id: r.id,
      status: r.status as TicketTransferStatus,
      cancelReason: r.cancel_reason,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      decidedAt: r.decided_at,
      ticketId: r.ticket_id,
      eventId: r.event_id,
      eventTitle: r.event?.title ?? null,
      from: { id: r.from_user_id, label: label(r.from_user_id) },
      to: r.to_user_id
        ? { id: r.to_user_id, label: label(r.to_user_id) }
        : null,
      toPhoneEnding: r.to_phone ? r.to_phone.slice(-4) : null,
      textSent: !!r.text_sent_at,
    })),
  };
}
