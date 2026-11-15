import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  TicketTransferAdminSettings,
  TicketTransferAudience,
  TicketTransferProgram,
} from "@abonten/types/ticketTransferType";
import { ticketPlanAudienceIncludes } from "../ticketPlans/ticketPlanProgram";

// Programme switches for sending tickets (decision X43). Same shape as Pay
// small small and Safety: one settings row plus a deploy-level kill switch
// that wins over it, with the audience resolved here against the user id
// the transport already proved.
//
// What each switch stops:
//   * `enabled` off, or a person outside the audience: no NEW offer. Offers
//     already made can still be accepted, declined or cancelled: switching
//     the programme off must never strand a ticket between two people.
//   * TICKET_TRANSFERS_KILL_SWITCH (an emergency stop for a fault in the
//     transfer itself): no new offer and no accepting either. Open offers
//     can still be declined or cancelled, and the job still expires them,
//     so every ticket ends up with someone.

export type TicketTransferSettingRow =
  Database["public"]["Tables"]["ticket_transfer_program_setting"]["Row"];

const SETTINGS_TTL_MS = 15_000;
let cached: { row: TicketTransferSettingRow | null; at: number } | null = null;

const DEFAULTS = { maxMoves: 3, acceptHours: 48, textsPerSenderPerDay: 20 };

export function isTicketTransfersKillSwitchOn(): boolean {
  return process.env.TICKET_TRANSFERS_KILL_SWITCH === "true";
}

/** Test hook: forget the cached settings row. */
export function resetTicketTransferSettingsCache(): void {
  cached = null;
}

export async function readTicketTransferSettings(
  supabase: ServiceRoleClient,
  options: { fresh?: boolean } = {},
): Promise<TicketTransferSettingRow | null> {
  if (!options.fresh && cached && Date.now() - cached.at < SETTINGS_TTL_MS) {
    return cached.row;
  }
  const { data, error } = await supabase
    .from("ticket_transfer_program_setting")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    logger.error(`readTicketTransferSettings failed: ${error.message}`);
    return null;
  }
  cached = { row: data ?? null, at: Date.now() };
  return data ?? null;
}

async function isStaff(
  supabase: ServiceRoleClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("admin_user")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.status === "active";
}

export type TicketTransferAccess = {
  program: TicketTransferProgram;
  settings: TicketTransferSettingRow | null;
  textsPerSenderPerDay: number;
};

export async function resolveTicketTransferAccess(
  supabase: ServiceRoleClient,
  userId: string | null,
): Promise<TicketTransferAccess> {
  const row = isTicketTransfersKillSwitchOn()
    ? null
    : await readTicketTransferSettings(supabase);
  const rules = {
    maxMoves: row?.max_moves ?? DEFAULTS.maxMoves,
    acceptHours: row?.accept_hours ?? DEFAULTS.acceptHours,
  };
  const textsPerSenderPerDay =
    row?.texts_per_sender_per_day ?? DEFAULTS.textsPerSenderPerDay;
  if (!row || !row.enabled) {
    return {
      program: { enabled: false, ...rules },
      settings: row,
      textsPerSenderPerDay,
    };
  }
  const enabled = await ticketPlanAudienceIncludes(
    row.audience,
    row.beta_user_ids ?? [],
    userId,
    (id) => isStaff(supabase, id),
  );
  return {
    program: { enabled, ...rules },
    settings: row,
    textsPerSenderPerDay,
  };
}

export function mapTicketTransferSettings(
  row: TicketTransferSettingRow,
): TicketTransferAdminSettings {
  return {
    enabled: row.enabled,
    audience: row.audience as TicketTransferAudience,
    betaUserIds: row.beta_user_ids ?? [],
    maxMoves: row.max_moves,
    acceptHours: row.accept_hours,
    textsPerSenderPerDay: row.texts_per_sender_per_day,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}
