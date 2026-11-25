// Registering Abonten sales with a gate partner (docs/architecture/
// gate-partner-connectors.md §3).
//
// A confirmed payment for a linked event queues one push per checkout line
// (trigger ticket_checkout_gate_partner_queue, same transaction as the
// payment). The sender here:
//
//   1. claims due pushes with row locks (gate_partner_push_claim);
//   2. the first time, fixes which tickets the order covers (the live ones;
//      a line refunded before it was sent is not sent at all) and registers
//      the sale with the partner, with an Idempotency-Key derived from the
//      checkout line, so a retry after a timeout or a crash replays the
//      partner's first answer instead of a second order;
//   3. reads the order back for each attendee's ticket code, makes a QR of
//      each code (the partner's scanner reads the plain code), and stores
//      them on the tickets in one transaction (gate_partner_store_codes).
//
// It runs right after issuance (never blocking the buyer: the transport
// calls it after the response) and every minute from the gate-partners job,
// which retries with backoff. A request is never sent faster than the
// partner allows (gate_partner_rate_take). A definite refusal (sold out,
// unknown product) stops the push for staff; repeated failures open an
// incident. Nothing here moves money.

import {
  GATE_PUSH_ALERT_AFTER,
  gatePushBackoffMs,
  splitBuyerName,
} from "@abonten/core/gatePartners/gateLinkRules";
import { logger } from "@abonten/core/logger";
import {
  GATE_INCIDENT_TITLE,
  gateStaffText,
} from "../admin/gatePartners/gatePushStaffText";
import { createNotificationCore } from "../notifications/createNotification";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { generatePartnerQRCodeDataURL } from "../tickets/generateTicketCode";
import { saveEventQrCodeToCloudinary } from "../tickets/saveEventQrCodeToCloudinary";
import type { GatePartnerAdapter, GatePartnerError } from "./adapter";
import {
  type GateLinkRow,
  type GatePushRow,
  gateApiKeyFor,
  gatePartnerAdapter,
  isGatePartnersKillSwitchOn,
} from "./gatePartnerConfig";

export type GatePushDeps = {
  /** The partner's API (tests pass one built on a mock server). */
  adapterFor?: (provider: string) => GatePartnerAdapter;
  /** A QR image of the plain partner code. Default: Cloudinary. */
  makeQr?: (
    code: string,
    provider: string,
  ) => Promise<{ publicId: string; version: string } | null>;
  /**
   * The buyer's codes arrived after their receipt went out: email them
   * (the transport owns email). The in-app notice is written here.
   */
  onCodesReady?: (input: {
    userId: string;
    eventId: string;
    ticketIds: string[];
  }) => Promise<void>;
  env?: Record<string, string | undefined>;
};

export type GateDispatchResult = {
  claimed: number;
  done: number;
  deferred: number;
  failed: number;
  cancelled: number;
};

type Outcome = "done" | "deferred" | "failed" | "cancelled";

/** Requests per minute we allow ourselves per key (the partner allows 100). */
const RATE_LIMIT_PER_MINUTE = 90;
/** Codes not out yet after the order went through: look again soon. */
const CODES_PENDING_MS = 60_000;
const DEFAULT_BUDGET_MS = 40_000;

const svc = () => getSupabaseServiceClient();

/** A QR of the plain code, as the partner's scanner reads it. */
export async function makePartnerQr(
  code: string,
  provider: string,
): Promise<{ publicId: string; version: string } | null> {
  const dataUrl = await generatePartnerQRCodeDataURL(code);
  const safe = code.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60);
  const upload = await saveEventQrCodeToCloudinary(
    dataUrl,
    `gate-${provider}-${safe}`,
  );
  if (upload.error || !upload.public_id || upload.version == null) {
    logger.error(`makePartnerQr: upload failed (${upload.error ?? "no id"})`);
    return null;
  }
  return { publicId: upload.public_id, version: String(upload.version) };
}

async function openIncident(push: GatePushRow, summary: string) {
  const { error } = await svc().rpc("open_reconciliation_incident", {
    p_component: `gate_partners.push.${push.event_id}`,
    p_title: GATE_INCIDENT_TITLE,
    p_summary: summary.slice(0, 1500),
    p_severity: "high",
  });
  if (error) {
    logger.error(`gatePush: incident not opened (${error.message})`);
    return;
  }
  await svc()
    .from("gate_partner_push")
    .update({ incident_opened_at: new Date().toISOString() })
    .eq("id", push.id)
    .is("incident_opened_at", null);
}

type Release = {
  status: "queued" | "ordered" | "failed" | "cancelled";
  nextAttemptAt?: Date;
  /** A deferral that was not a real attempt (rate limit, switch off). */
  uncount?: boolean;
  error?: GatePartnerError | null;
};

/** Hands a claimed push back, only if we still hold the claim. */
async function release(push: GatePushRow, r: Release): Promise<boolean> {
  const patch: Record<string, unknown> = {
    status: r.status,
    claimed_at: null,
    updated_at: new Date().toISOString(),
  };
  if (r.nextAttemptAt) patch.next_attempt_at = r.nextAttemptAt.toISOString();
  if (r.uncount) patch.attempts = Math.max(0, push.attempts - 1);
  if (r.error !== undefined) {
    patch.last_error_code = r.error?.code ?? null;
    patch.last_error_detail = r.error?.detail.slice(0, 480) ?? null;
    patch.last_http_status = r.error?.httpStatus ?? null;
  }
  const { data, error } = await svc()
    .from("gate_partner_push")
    .update(patch as never)
    .eq("id", push.id)
    .eq("status", "sending")
    .eq("claimed_at", push.claimed_at as string)
    .select("id")
    .maybeSingle();
  if (error) logger.error(`gatePush release ${push.id}: ${error.message}`);
  return !!data;
}

function after(ms: number): Date {
  return new Date(Date.now() + ms);
}

/** What a failed request means for the push. */
async function handleError(
  push: GatePushRow,
  err: GatePartnerError,
  ordered: boolean,
): Promise<Outcome> {
  const resting = ordered ? "ordered" : "queued";
  switch (err.kind) {
    case "rate_limited":
      await release(push, {
        status: resting,
        nextAttemptAt: after(Math.max(err.retryAfterSeconds ?? 60, 1) * 1000),
        uncount: true,
        error: err,
      });
      return "deferred";
    case "in_progress":
      await release(push, {
        status: resting,
        nextAttemptAt: after(30_000),
        uncount: true,
        error: err,
      });
      return "deferred";
    case "refused": {
      // Nothing was created (or, for an order already registered, the
      // partner will not answer for it): a person decides.
      await release(push, { status: "failed", error: err });
      await openIncident(
        push,
        gateStaffText.refusedIncident({
          pushId: push.id,
          checkoutId: push.checkout_id,
          eventId: push.event_id,
          code: err.code,
          detail: err.detail,
        }),
      );
      return "failed";
    }
    default: {
      await release(push, {
        status: resting,
        nextAttemptAt: after(
          gatePushBackoffMs(push.attempts, err.retryAfterSeconds),
        ),
        error: err,
      });
      if (push.attempts >= GATE_PUSH_ALERT_AFTER && !push.incident_opened_at) {
        await openIncident(
          push,
          gateStaffText.failingIncident({
            pushId: push.id,
            eventId: push.event_id,
            attempts: push.attempts,
            code: err.code,
            detail: err.detail,
          }),
        );
      }
      return "deferred";
    }
  }
}

async function buyerFor(userId: string): Promise<{
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
} | null> {
  const db = svc();
  const [{ data: info }, { data: auth }] = await Promise.all([
    db
      .from("user_info")
      .select("full_name, username")
      .eq("id", userId)
      .maybeSingle(),
    db.auth.admin.getUserById(userId),
  ]);
  const email = auth?.user?.email?.trim();
  const name =
    splitBuyerName(info?.full_name) ?? splitBuyerName(info?.username);
  if (!email || !name) return null;
  const phone =
    auth?.user?.phone && auth.user.phone_confirmed_at
      ? `+${auth.user.phone.replace(/^\+/, "")}`
      : null;
  return { ...name, email, phone };
}

async function liveTicketIds(checkoutId: string): Promise<string[] | null> {
  const { data, error } = await svc()
    .from("ticket")
    .select("id")
    .eq("ticket_checkout_id", checkoutId)
    .in("status", ["active", "used"])
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    logger.error(`gatePush liveTicketIds: ${error.message}`);
    return null;
  }
  return (data ?? []).map((r) => r.id);
}

async function eventTitle(eventId: string) {
  const { data } = await svc()
    .from("event")
    .select("title, flyer_public_id, flyer_version")
    .eq("id", eventId)
    .maybeSingle();
  return data;
}

/** The in-app notice (and push) that the buyer's gate codes are ready. */
export async function noticeGateCodesReady(input: {
  userId: string;
  eventId: string;
  ticketIds: string[];
}): Promise<void> {
  const event = await eventTitle(input.eventId);
  const res = await createNotificationCore(svc(), {
    userId: input.userId,
    type: "gate_codes_ready",
    notice: {
      id: "gate_codes_ready",
      params: { title: event?.title ?? null, count: input.ticketIds.length },
    },
    link: "/manage/my-events",
    data: {
      kind: "ticket",
      eventId: input.eventId,
      ticketId: input.ticketIds[0],
    },
    imagePublicId: event?.flyer_public_id ?? null,
    imageVersion: event?.flyer_version ?? null,
  });
  if (res.status !== 200) {
    logger.error(`noticeGateCodesReady: ${res.message}`);
  }
}

async function rateWait(link: GateLinkRow): Promise<number> {
  const { data, error } = await svc().rpc("gate_partner_rate_take", {
    p_bucket: `${link.provider}:${link.api_key_env}`,
    p_cost: 1,
    p_limit: RATE_LIMIT_PER_MINUTE,
  });
  if (error) {
    logger.error(`gatePush rate: ${error.message}`);
    return 30;
  }
  return Number(data ?? 0);
}

async function processPush(
  push: GatePushRow,
  opts: { notifyBuyer: boolean; deps: GatePushDeps },
): Promise<Outcome> {
  const db = svc();
  const { data: link, error: linkError } = await db
    .from("gate_partner_link")
    .select("*")
    .eq("id", push.link_id)
    .maybeSingle();
  if (linkError || !link) {
    await release(push, {
      status: push.partner_order_id ? "ordered" : "queued",
      nextAttemptAt: after(5 * 60_000),
      uncount: true,
    });
    return "deferred";
  }
  const ordered = push.partner_order_id !== null;
  const resting = ordered ? "ordered" : "queued";

  if (isGatePartnersKillSwitchOn()) {
    await release(push, {
      status: resting,
      nextAttemptAt: after(10 * 60_000),
      uncount: true,
    });
    return "deferred";
  }

  const key = gateApiKeyFor(link, opts.deps.env ?? process.env);
  if (!key.ok) {
    return handleError(
      push,
      {
        kind: "auth",
        code: `KEY_${key.problem.toUpperCase()}`,
        httpStatus: null,
        retryAfterSeconds: null,
        detail: gateStaffText.keyUnusable(link.api_key_env, key.problem),
      },
      ordered,
    );
  }
  const adapter = (opts.deps.adapterFor ?? gatePartnerAdapter)(link.provider);

  let ticketIds = push.request_ticket_ids;
  let orderId = push.partner_order_id;

  if (!orderId) {
    if (!push.partner_product_id) {
      await release(push, {
        status: "failed",
        error: {
          kind: "refused",
          code: "NOT_MAPPED",
          httpStatus: null,
          retryAfterSeconds: null,
          detail: gateStaffText.notMapped,
        },
      });
      return "failed";
    }
    if (!ticketIds) {
      const live = await liveTicketIds(push.checkout_id);
      if (live === null) {
        await release(push, {
          status: "queued",
          nextAttemptAt: after(60_000),
          uncount: true,
        });
        return "deferred";
      }
      if (live.length === 0) {
        // Every ticket of the line was cancelled before it was sent:
        // nothing to register, nothing to void.
        await release(push, { status: "cancelled", error: null });
        return "cancelled";
      }
      const { data: fixed, error: fixError } = await db
        .from("gate_partner_push")
        .update({
          request_quantity: live.length,
          request_ticket_ids: live,
          updated_at: new Date().toISOString(),
        })
        .eq("id", push.id)
        .eq("claimed_at", push.claimed_at as string)
        .is("request_ticket_ids", null)
        .select("id")
        .maybeSingle();
      if (fixError || !fixed) {
        await release(push, {
          status: "queued",
          nextAttemptAt: after(30_000),
          uncount: true,
        });
        return "deferred";
      }
      ticketIds = live;
    }

    const buyer = await buyerFor(push.user_id);
    if (!buyer) {
      await release(push, {
        status: "failed",
        error: {
          kind: "refused",
          code: "BUYER_DETAILS",
          httpStatus: null,
          retryAfterSeconds: null,
          detail: gateStaffText.buyerDetails,
        },
      });
      await openIncident(
        push,
        gateStaffText.buyerIncident(push.id, push.event_id),
      );
      return "failed";
    }

    const wait = await rateWait(link);
    if (wait > 0) {
      await release(push, {
        status: "queued",
        nextAttemptAt: after(wait * 1000),
        uncount: true,
      });
      return "deferred";
    }

    const res = await adapter.pushOrder(
      key.key,
      {
        partnerEventId: link.partner_event_id,
        buyer,
        items: [
          { productId: push.partner_product_id, quantity: ticketIds.length },
        ],
      },
      push.idempotency_key as string,
    );
    if (!res.ok) return handleError(push, res.error, false);

    orderId = res.data.orderId;
    const { error: saveError } = await db
      .from("gate_partner_push")
      .update({
        partner_order_id: res.data.orderId,
        partner_order_short_id: res.data.shortId,
        last_error_code: null,
        last_error_detail: null,
        last_http_status: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", push.id)
      .eq("claimed_at", push.claimed_at as string);
    if (saveError) {
      // The same key replays this order next time; nothing is lost.
      logger.error(`gatePush save order ${push.id}: ${saveError.message}`);
      await release(push, {
        status: "queued",
        nextAttemptAt: after(30_000),
      });
      return "deferred";
    }
    if (
      res.data.attendeeCount !== null &&
      res.data.attendeeCount !== ticketIds.length
    ) {
      await release(push, {
        status: "failed",
        error: {
          kind: "refused",
          code: "ATTENDEE_COUNT",
          httpStatus: null,
          retryAfterSeconds: null,
          detail: gateStaffText.attendeeCount(
            res.data.attendeeCount,
            ticketIds.length,
          ),
        },
      });
      await openIncident(
        push,
        gateStaffText.attendeeCountIncident({
          orderId: res.data.orderId,
          pushId: push.id,
          registered: res.data.attendeeCount,
          tickets: ticketIds.length,
        }),
      );
      return "failed";
    }
  }

  if (!ticketIds || ticketIds.length === 0) {
    await release(push, {
      status: "failed",
      error: {
        kind: "refused",
        code: "NO_TICKETS",
        httpStatus: null,
        retryAfterSeconds: null,
        detail: gateStaffText.noTickets,
      },
    });
    return "failed";
  }

  const wait = await rateWait(link);
  if (wait > 0) {
    await release(push, {
      status: "ordered",
      nextAttemptAt: after(wait * 1000),
      uncount: true,
    });
    return "deferred";
  }
  const order = await adapter.getOrder(key.key, orderId as string);
  if (!order.ok) {
    if (order.error.kind === "refused") {
      // A lookup is never a refused sale: treat it as a transient answer.
      order.error.kind = "retry";
    }
    return handleError(push, order.error, true);
  }
  const codes = order.data.attendees.filter(
    (a): a is typeof a & { code: string } => !!a.code?.trim(),
  );
  if (codes.length < ticketIds.length) {
    await release(push, {
      status: "ordered",
      nextAttemptAt: after(
        Math.min(gatePushBackoffMs(push.attempts), 10 * CODES_PENDING_MS),
      ),
      error: {
        kind: "retry",
        code: "CODES_PENDING",
        httpStatus: null,
        retryAfterSeconds: null,
        detail: gateStaffText.codesSoFar(codes.length, ticketIds.length),
      },
    });
    if (push.attempts >= GATE_PUSH_ALERT_AFTER && !push.incident_opened_at) {
      await openIncident(
        push,
        gateStaffText.codesPendingIncident({
          orderId: orderId as string,
          pushId: push.id,
          codes: codes.length,
          tickets: ticketIds.length,
          attempts: push.attempts,
        }),
      );
    }
    return "deferred";
  }

  const makeQr = opts.deps.makeQr ?? makePartnerQr;
  const rows: {
    ticket_id: string;
    attendee_id: string | null;
    code: string;
    qr_public_id: string;
    qr_version: string;
  }[] = [];
  for (const [index, ticketId] of ticketIds.entries()) {
    const attendee = codes[index];
    const code = attendee.code.trim();
    const qr = await makeQr(code, link.provider).catch((error) => {
      logger.error(`gatePush QR: ${error}`);
      return null;
    });
    if (!qr) {
      await release(push, {
        status: "ordered",
        nextAttemptAt: after(CODES_PENDING_MS),
        error: {
          kind: "retry",
          code: "QR_UPLOAD",
          httpStatus: null,
          retryAfterSeconds: null,
          detail: gateStaffText.qrUpload,
        },
      });
      return "deferred";
    }
    rows.push({
      ticket_id: ticketId,
      attendee_id: attendee.id,
      code,
      qr_public_id: qr.publicId,
      qr_version: qr.version,
    });
  }

  const { error: storeError } = await db.rpc("gate_partner_store_codes", {
    p_push_id: push.id,
    p_codes: rows,
  });
  if (storeError) {
    logger.error(`gatePush store ${push.id}: ${storeError.message}`);
    await release(push, {
      status: "ordered",
      nextAttemptAt: after(gatePushBackoffMs(push.attempts)),
      error: {
        kind: "retry",
        code: "STORE",
        httpStatus: null,
        retryAfterSeconds: null,
        detail: storeError.message.slice(0, 400),
      },
    });
    return "deferred";
  }

  if (opts.notifyBuyer) {
    const live = rows.map((r) => r.ticket_id);
    await noticeGateCodesReady({
      userId: push.user_id,
      eventId: push.event_id,
      ticketIds: live,
    });
    await opts.deps
      .onCodesReady?.({
        userId: push.user_id,
        eventId: push.event_id,
        ticketIds: live,
      })
      .catch((error) =>
        logger.error(`gatePush onCodesReady ${push.id}: ${error}`),
      );
    await db
      .from("gate_partner_push")
      .update({ buyer_notified_at: new Date().toISOString() })
      .eq("id", push.id);
  }
  return "done";
}

/**
 * Sends what is due, within a time budget. `sessionId` limits it to one
 * purchase (right after issuance); `notifyBuyer` tells the buyer when codes
 * arrive (the job: their receipt already went out saying "on its way").
 */
export async function dispatchGatePartnerPushes(
  options: {
    budgetMs?: number;
    sessionId?: string | null;
    notifyBuyer?: boolean;
    deps?: GatePushDeps;
  } = {},
): Promise<GateDispatchResult> {
  const result: GateDispatchResult = {
    claimed: 0,
    done: 0,
    deferred: 0,
    failed: 0,
    cancelled: 0,
  };
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_BUDGET_MS);
  const deps = options.deps ?? {};
  const notifyBuyer = options.notifyBuyer ?? true;

  while (Date.now() < deadline) {
    const { data, error } = await svc().rpc("gate_partner_push_claim", {
      p_limit: 10,
      ...(options.sessionId ? { p_session: options.sessionId } : {}),
    });
    if (error) {
      logger.error(`dispatchGatePartnerPushes claim: ${error.message}`);
      break;
    }
    const batch = (data ?? []) as GatePushRow[];
    if (batch.length === 0) break;
    result.claimed += batch.length;
    for (const push of batch) {
      if (Date.now() >= deadline) {
        // Out of time: hand it back untouched for the next run.
        await release(push, {
          status: push.partner_order_id ? "ordered" : "queued",
          nextAttemptAt: new Date(),
          uncount: true,
        });
        result.deferred += 1;
        continue;
      }
      let outcome: Outcome;
      try {
        outcome = await processPush(push, { notifyBuyer, deps });
      } catch (error) {
        logger.error(`dispatchGatePartnerPushes ${push.id}`, error);
        await release(push, {
          status: push.partner_order_id ? "ordered" : "queued",
          nextAttemptAt: after(gatePushBackoffMs(push.attempts)),
        });
        outcome = "deferred";
      }
      result[outcome] += 1;
    }
    // One purchase: one pass is enough (what is not done waits for the job).
    if (options.sessionId) break;
  }
  return result;
}

/** Whether a purchase has anything to register with a partner. */
export async function sessionHasGatePushes(
  sessionId: string,
): Promise<boolean> {
  const { data, error } = await svc()
    .from("gate_partner_push")
    .select("id")
    .eq("checkout_session_id", sessionId)
    .limit(1);
  if (error) {
    logger.error(`sessionHasGatePushes: ${error.message}`);
    return false;
  }
  return (data ?? []).length > 0;
}
