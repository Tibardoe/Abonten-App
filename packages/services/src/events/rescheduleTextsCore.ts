// Text messages when an event moves or is postponed
// (docs/architecture/event-reschedule.md §1, decision RS3).
//
// After a move, rescheduleEventCore queues one row per person its notice
// went to who has a verified phone (event_reschedule_queue_texts). The web
// and app transports start a short dispatch right after the response, and
// the reschedule-texts pg_cron job (POST /api/jobs/reschedule-texts)
// finishes the rest: each row is claimed with a row lock, so nobody is
// texted twice. A number is texted only in a market whose text rail is
// Hubtel; the text is in the person's language, short, and links to their
// tickets. A text the provider refused or did not answer is not tried
// again (it may have gone out; the notice, push and email reached the
// person anyway). RESCHEDULE_TEXTS_KILL_SWITCH=true stops it (queued texts
// are skipped, not kept for later).

import { formatDateTime } from "@abonten/core/i18n/format";
import { logger } from "@abonten/core/logger";
import { trFor } from "../i18n/requestLocale";
import { canTextNumber } from "../safety/safetyPeople";
import { sendHubtelSms } from "../sms/hubtelSms";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import {
  type RescheduleEmailBatch,
  rescheduleEmailBatchCore,
} from "./eventRescheduleCore";
import { isRescheduleTextsKillSwitchOn } from "./rescheduleTextsQueue";

/** Texts one move may send (a cost guard: Hubtel charges per text). */
export const MAX_TEXTS_PER_MOVE = 1000;
/**
 * A text whose sender died mid-way is claimed again; after this many claims
 * it is given up (it may have gone out).
 */
const MAX_ATTEMPTS = 3;
const BATCH = 50;

function clip(text: string, max: number): string {
  const s = text.trim().replace(/\s+/g, " ");
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

function e164(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? `+${digits}` : null;
}

/** The words of one text, in the reader's language; one SMS when it can. */
export function rescheduleTextContent(
  batch: Pick<
    RescheduleEmailBatch,
    | "kind"
    | "oneDate"
    | "title"
    | "startsAt"
    | "timezone"
    | "venue"
    | "dateChanged"
  >,
  locale: string,
  link: string,
): string {
  const t = trFor(locale);
  const title = clip(batch.title, 40);
  const venue = batch.venue ? clip(batch.venue, 40) : "";
  const when = batch.startsAt
    ? formatDateTime(batch.startsAt, locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: batch.timezone,
      })
    : "";
  if (batch.kind === "postpone") {
    return t("rescheduleSmsPostponed", { title, link });
  }
  if (batch.oneDate) return t("rescheduleSmsOneDate", { title, when, link });
  if (venue && batch.dateChanged) {
    return t("rescheduleSmsDateVenue", { title, when, venue, link });
  }
  if (venue) return t("rescheduleSmsVenue", { title, venue, link });
  return t("rescheduleSmsDate", { title, when, link });
}

type TextRow = {
  id: number;
  reschedule_id: string;
  user_id: string;
  attempts: number;
};

export type RescheduleTextsResult = {
  sent: number;
  failed: number;
  skipped: number;
};

/**
 * Sends the texts that are due, until the time budget runs out. Safe to
 * run twice at once: rows are claimed with row locks.
 */
export async function dispatchRescheduleTextsCore(
  options: { budgetMs?: number } = {},
): Promise<RescheduleTextsResult> {
  const svc = getSupabaseServiceClient();
  const result: RescheduleTextsResult = { sent: 0, failed: 0, skipped: 0 };
  const deadline = Date.now() + (options.budgetMs ?? 45_000);
  const base = (
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://abontenhub.com"
  ).replace(/\/+$/, "");
  const link = new URL("/manage/my-events", base).toString();
  const batches = new Map<string, RescheduleEmailBatch | null>();
  const sentPerMove = new Map<string, number>();

  const finish = async (
    row: TextRow,
    status: "sent" | "failed" | "skipped",
    detail: string | null,
    providerRef: string | null = null,
  ) => {
    await svc
      .from("event_reschedule_text")
      .update({
        status,
        detail: detail ? detail.slice(0, 300) : null,
        provider_ref: providerRef,
        claimed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (status === "sent") result.sent += 1;
    else if (status === "failed") result.failed += 1;
    else if (status === "skipped") result.skipped += 1;
  };

  while (Date.now() < deadline) {
    const { data, error } = await svc.rpc("event_reschedule_claim_texts", {
      p_limit: BATCH,
    });
    if (error) {
      logger.error(`reschedule texts: claim failed (${error.message})`);
      break;
    }
    const rows = (data ?? []) as TextRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (isRescheduleTextsKillSwitchOn()) {
        await finish(row, "skipped", "kill_switch");
        continue;
      }
      if (!batches.has(row.reschedule_id)) {
        batches.set(
          row.reschedule_id,
          await rescheduleEmailBatchCore(row.reschedule_id),
        );
        const { count } = await svc
          .from("event_reschedule_text")
          .select("id", { count: "exact", head: true })
          .eq("reschedule_id", row.reschedule_id)
          .eq("status", "sent");
        sentPerMove.set(row.reschedule_id, count ?? 0);
      }
      const batch = batches.get(row.reschedule_id) ?? null;
      if (!batch || row.attempts > MAX_ATTEMPTS) {
        await finish(row, "failed", batch ? "gave_up" : "no_move");
        continue;
      }
      if ((sentPerMove.get(row.reschedule_id) ?? 0) >= MAX_TEXTS_PER_MOVE) {
        await finish(row, "skipped", "cap_reached");
        continue;
      }

      const [{ data: auth }, { data: info }] = await Promise.all([
        svc.auth.admin.getUserById(row.user_id),
        svc
          .from("user_info")
          .select("locale, status_id")
          .eq("id", row.user_id)
          .maybeSingle(),
      ]);
      const user = auth?.user ?? null;
      const phone = user?.phone_confirmed_at ? e164(user.phone) : null;
      if (!phone || info?.status_id !== 1) {
        await finish(row, "skipped", "no_phone");
        continue;
      }
      if (!(await canTextNumber(phone))) {
        await finish(row, "skipped", "not_text_market");
        continue;
      }

      const sent = await sendHubtelSms({
        toE164: phone,
        content: rescheduleTextContent(batch, info?.locale ?? "en", link),
        clientReference: `rs-${row.id}`,
      });
      if (sent.ok) {
        sentPerMove.set(
          row.reschedule_id,
          (sentPerMove.get(row.reschedule_id) ?? 0) + 1,
        );
        await finish(row, "sent", null, sent.messageId ?? null);
      } else if (sent.reason === "not_configured") {
        await finish(row, "skipped", "not_configured");
      } else {
        // Not tried again: an unanswered request may still have gone out,
        // and a refused number stays refused. The notice, push and email
        // reached the person anyway.
        await finish(row, "failed", `${sent.reason}: ${sent.detail}`);
      }
    }
  }
  if (result.sent + result.failed > 0) {
    logger.info(
      `reschedule texts: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`,
    );
  }
  return result;
}
