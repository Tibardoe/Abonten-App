import { logger } from "@abonten/core/logger";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// Expo push receipts. A send returns a ticket per message; whether Apple or
// Google actually took it is only in the receipt, which Expo makes available
// about 15 minutes later and keeps for roughly a day. sendPushToUser records
// each accepted ticket in push_receipt; this reads the due ones (called by
// POST /api/notifications/deliver, which the every-minute pg_cron job wakes
// when a receipt is due -- migration 20260915100200), deletes device tokens
// that are no longer registered, logs every other provider error, and
// checks again later for tickets whose receipt isn't ready yet.

const EXPO_RECEIPTS_ENDPOINT = "https://exp.host/--/api/v2/push/getReceipts";
/** Expo accepts up to 1,000 ids per request; its own SDK sends 300. */
const CHUNK = 300;
const BATCH = 1500;
const RECHECK_MS = 15 * 60_000;
const RETRY_MS = 5 * 60_000;

type Receipt = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

export type PushReceiptSummary = {
  checked: number;
  ok: number;
  errors: number;
  tokensRemoved: number;
  notReady: number;
};

type PendingRow = { ticket_id: string; token: string };

/** Records the tickets Expo accepted so their receipts can be read later. */
export async function recordPushTickets(
  rows: { ticketId: string; token: string }[],
  service: ServiceRoleClient = getSupabaseServiceClient(),
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await service.from("push_receipt").upsert(
    rows.map((r) => ({ ticket_id: r.ticketId, token: r.token })),
    { onConflict: "ticket_id", ignoreDuplicates: true },
  );
  if (error) {
    // Losing a receipt only delays pruning a dead token; never fail a send.
    logger.error(`push_receipt insert failed: ${error.message}`);
  }
}

async function fetchReceipts(
  ids: string[],
  fetchImpl: typeof fetch,
): Promise<Record<string, Receipt> | null> {
  try {
    const res = await fetchImpl(EXPO_RECEIPTS_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      logger.error(`Push receipts: Expo responded ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { data?: Record<string, Receipt> };
    return json.data ?? {};
  } catch (e) {
    logger.error(`Push receipts: request failed: ${e}`);
    return null;
  }
}

export async function pollPushReceiptsCore(
  options: {
    service?: ServiceRoleClient;
    fetchImpl?: typeof fetch;
    now?: () => number;
  } = {},
): Promise<{ status: 200 | 500; data?: PushReceiptSummary }> {
  const service = options.service ?? getSupabaseServiceClient();
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;

  const { data, error } = await service
    .from("push_receipt")
    .select("ticket_id, token")
    .lte("check_after", new Date(now()).toISOString())
    .order("check_after", { ascending: true })
    .limit(BATCH);
  if (error) {
    logger.error(`push_receipt read failed: ${error.message}`);
    return { status: 500 };
  }
  const pending = (data ?? []) as PendingRow[];
  const summary: PushReceiptSummary = {
    checked: pending.length,
    ok: 0,
    errors: 0,
    tokensRemoved: 0,
    notReady: 0,
  };
  if (pending.length === 0) return { status: 200, data: summary };

  for (let i = 0; i < pending.length; i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK);
    const receipts = await fetchReceipts(
      chunk.map((r) => r.ticket_id),
      fetchImpl,
    );
    // Expo unreachable: try this batch again in a few minutes, not on every
    // tick (a due receipt is what makes the minute job call this route).
    if (!receipts) {
      await service
        .from("push_receipt")
        .update({ check_after: new Date(now() + RETRY_MS).toISOString() })
        .in(
          "ticket_id",
          chunk.map((r) => r.ticket_id),
        );
      continue;
    }

    const done: string[] = [];
    const notReady: string[] = [];
    const deadTokens = new Set<string>();
    for (const row of chunk) {
      const receipt = receipts[row.ticket_id];
      if (!receipt) {
        notReady.push(row.ticket_id);
        continue;
      }
      done.push(row.ticket_id);
      if (receipt.status === "ok") {
        summary.ok += 1;
        continue;
      }
      summary.errors += 1;
      const code = receipt.details?.error ?? "unknown";
      if (code === "DeviceNotRegistered") {
        deadTokens.add(row.token);
      } else {
        // MessageTooBig, MessageRateExceeded, MismatchSenderId and
        // InvalidCredentials need a person, not a retry.
        logger.error(
          `Push receipt error ${code}: ${receipt.message ?? "no message"}`,
        );
      }
    }

    if (deadTokens.size > 0) {
      const { error: delError, count } = await service
        .from("device_token")
        .delete({ count: "exact" })
        .in("token", [...deadTokens]);
      if (delError) {
        logger.error(`device_token prune failed: ${delError.message}`);
      } else {
        summary.tokensRemoved += count ?? 0;
      }
    }
    if (done.length > 0) {
      const { error: doneError } = await service
        .from("push_receipt")
        .delete()
        .in("ticket_id", done);
      if (doneError) {
        logger.error(`push_receipt delete failed: ${doneError.message}`);
      }
    }
    if (notReady.length > 0) {
      summary.notReady += notReady.length;
      // Rows older than a day are dropped by run_notification_delivery.
      const { error: laterError } = await service
        .from("push_receipt")
        .update({ check_after: new Date(now() + RECHECK_MS).toISOString() })
        .in("ticket_id", notReady);
      if (laterError) {
        logger.error(`push_receipt reschedule failed: ${laterError.message}`);
      }
    }
  }

  return { status: 200, data: summary };
}
