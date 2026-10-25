import { validateCheckoutQuantities } from "@abonten/core/checkoutLimits";
import { computeLineAmount } from "@abonten/core/checkoutPricing";
import {
  resolveOccurrenceState,
  validatePurchaseOccurrence,
} from "@abonten/core/eventPurchaseEligibility";
import { logger } from "@abonten/core/logger";
import { computeOrderTotals, rateToBps } from "@abonten/core/market/pricing";
import type { ClientPlatform } from "@abonten/core/market/types";
import { formatMoney } from "@abonten/core/money/formatMoney";
import {
  add,
  fromMajor,
  money,
  toMajor,
  zero,
} from "@abonten/core/money/money";
import {
  checkPartAmount,
  planMinimums,
  planOfferWindow,
} from "@abonten/core/ticketPlans/rules";
import type { Database } from "@abonten/types/database.types";
import type { ReferralHint } from "@abonten/types/rewards";
import type {
  BalanceOverview,
  TicketPlanDetail,
  TicketPlanOffer,
  TicketPlanRules,
  TicketPlanSummary,
} from "@abonten/types/ticketPlanType";
import type { SupabaseClient } from "@supabase/supabase-js";
import { coreT, requestLocale, tr } from "../i18n/requestLocale";
import { getMarketOrDefault } from "../markets/marketConfig";
import { initiateChargeForAttempt } from "../payments/chargeInit";
import { upsertPaymentAttemptForSession } from "../payments/paymentAttempt";
import { resolvePaymentChoice } from "../payments/paymentChoice";
import type { CheckoutInit } from "../payments/providers/types";
import { serviceFeeRateFor } from "../platform/platformFee";
import { getCreditSummaryCore } from "../rewards/creditsQuery";
import { stampCheckoutReferralCore } from "../rewards/referralCore";
import {
  isAccountRestricted,
  restrictedAccountMessage,
} from "../security/accountStatus";
import { checkRateLimit } from "../security/rateLimit";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { endTicketPlan } from "./ticketPlanLifecycle";
import {
  isTicketPlansKillSwitchOn,
  resolveTicketPlanAccess,
} from "./ticketPlanProgram";
import { listPlanSummaries, loadPlanDetail } from "./ticketPlanQueries";

// Pay small small for the buyer: whether an event offers it, starting a
// plan, paying a part, reading and cancelling plans, and the Balance screen.
// The web Server Actions and the /api/mobile/ticket-plans routes run these
// verbatim. Every write is the service role scoped to the caller's id; the
// plan tables have no client access.

type EventRow = {
  id: string;
  status: string;
  title: string | null;
  event_code: string | null;
  organizer_id: string;
  currency: string;
  country_code: string;
  timezone: string | null;
  starts_at: string | null;
  ends_at: string | null;
  event_occurrence: { id: string; starts_at: string; ends_at: string }[];
  ticket_type: {
    id: string;
    price: number | null;
    type: string | null;
    currency: string;
  }[];
};

const EVENT_SELECT =
  "id, status, title, event_code, organizer_id, currency, country_code, timezone, starts_at, ends_at, event_occurrence(id, starts_at, ends_at), ticket_type(id, price, type, currency)";

const isPaidType = (t: EventRow["ticket_type"][number]) =>
  (t.type ?? "") !== "FREE" && Number(t.price ?? 0) > 0;

async function loadEvent(eventId: string): Promise<EventRow | null | "error"> {
  const { data, error } = await getSupabaseServiceClient()
    .from("event")
    .select(EVENT_SELECT)
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    logger.error(`ticketPlanCore: event read failed (${error.message})`);
    return "error";
  }
  return (data as unknown as EventRow | null) ?? null;
}

async function eventOffersPlans(eventId: string): Promise<boolean> {
  const { data } = await getSupabaseServiceClient()
    .from("event_ticket_plan_setting")
    .select("enabled")
    .eq("event_id", eventId)
    .maybeSingle();
  return data?.enabled === true;
}

async function openPlanFor(
  userId: string,
  eventId: string,
): Promise<string | null> {
  const { data } = await getSupabaseServiceClient()
    .from("ticket_plan")
    .select("id")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .in("status", ["awaiting_payment", "active", "settling"])
    .maybeSingle();
  return data?.id ?? null;
}

type OfferWithEvent =
  | {
      offer: Extract<TicketPlanOffer, { available: true }>;
      event: EventRow;
      rules: TicketPlanRules;
    }
  | { offer: Extract<TicketPlanOffer, { available: false }> };

async function computeOffer(
  userId: string | null,
  event: EventRow,
  occurrenceId: string | null,
): Promise<OfferWithEvent> {
  const service = getSupabaseServiceClient();
  const no = (
    reason: Extract<TicketPlanOffer, { available: false }>["reason"],
    planId?: string | null,
  ): OfferWithEvent => ({
    offer: { available: false, reason, ...(planId ? { planId } : {}) },
  });

  const { program } = await resolveTicketPlanAccess(service, userId);
  if (!program.enabled) return no("programme_off");
  if (!(await eventOffersPlans(event.id))) return no("not_offered");
  if (!event.ticket_type.some(isPaidType)) return no("free_event");
  if (userId && event.organizer_id === userId) return no("own_event");
  if (event.status !== "published") return no("not_on_sale");

  const state = resolveOccurrenceState(
    event.starts_at,
    event.ends_at,
    event.event_occurrence,
  );
  if (!state.purchasable) return no("not_on_sale");

  // A plan is for one date: the one chosen, or for a multi-date event the
  // next one on sale (its deadline is counted from that date, and the job
  // keeps it in step if the date moves).
  let startsAt: string | null = null;
  let planOccurrenceId: string | null = null;
  if (occurrenceId) {
    const check = validatePurchaseOccurrence(
      occurrenceId,
      event.event_occurrence,
    );
    if (!check.ok) return no("not_on_sale");
    startsAt = check.occurrence.starts_at;
    planOccurrenceId = check.occurrence.id;
  } else {
    const next = state.nextPurchasable as {
      id?: string;
      starts_at: string | Date;
    } | null;
    startsAt = next ? new Date(next.starts_at).toISOString() : null;
    planOccurrenceId =
      event.event_occurrence.length > 0 ? (next?.id ?? null) : null;
  }
  if (!startsAt) return no("not_on_sale");

  const window = planOfferWindow(new Date(startsAt), program.rules);
  if (!window.ok) return no("too_soon");

  if (userId) {
    const open = await openPlanFor(userId, event.id);
    if (open) return no("already_open", open);
  }

  const feeRate = await serviceFeeRateFor(
    service,
    { currency: event.currency, countryCode: event.country_code },
    { cached: true },
  );

  return {
    event,
    rules: program.rules,
    offer: {
      available: true,
      eventId: event.id,
      occurrenceId: planOccurrenceId,
      deadlineAt: window.deadline.toISOString(),
      eventStartsAt: new Date(startsAt).toISOString(),
      timezone: event.timezone,
      currency: event.currency,
      serviceFeeBps: rateToBps(feeRate),
      firstPartMinBps: program.rules.firstPartMinBps,
      partMinBps: program.rules.partMinBps,
      maxTickets: program.rules.maxTicketsPerPlan,
      keepFeeOnRefund: program.rules.keepFeeOnRefund,
      holdMinutes: program.rules.holdMinutes,
    },
  };
}

export async function getTicketPlanOfferCore(
  userId: string | null,
  input: { eventId: string; occurrenceId?: string | null },
): Promise<
  | { status: 200; data: TicketPlanOffer }
  | { status: 404 | 500; message: string }
> {
  const event = await loadEvent(input.eventId);
  if (event === "error") {
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (!event) return { status: 404, message: tr("noEventFound") };
  const { offer } = await computeOffer(
    userId,
    event,
    input.occurrenceId ?? null,
  );
  return { status: 200, data: offer };
}

/** The words for an offer that is not available, in the request's language. */
function offerRefusal(
  reason: Extract<TicketPlanOffer, { available: false }>["reason"],
): string {
  switch (reason) {
    case "programme_off":
    case "not_offered":
    case "free_event":
    case "own_event":
      return tr("paySmallSmallIsnTAvailableFor");
    case "too_soon":
      return tr("thisEventIsTooSoonToPay");
    case "already_open":
      return tr("youReAlreadyPayingSmallSmall");
    default:
      return tr("thisEventIsNotCurrentlyOn");
  }
}

const MAX_PLAN_STARTS_PER_MINUTE = 10;

export type StartTicketPlanInput = {
  eventId: string;
  occurrenceId?: string | null;
  quantities: { [ticketTypeId: string]: number };
  referralHints?: ReferralHint[] | null;
};

export type StartTicketPlanResult =
  | { status: 200; data: { planId: string } }
  | { status: 409; message: string; planId?: string }
  | { status: 400 | 403 | 404 | 429 | 500 | 503; message: string };

/**
 * Starts a plan: prices the chosen tickets, locks the price and holds the
 * seats. Nothing is charged yet; the first part is paid from the plan's
 * screen (payTicketPlanPartCore), and the seats go back if it is not paid
 * within the hold.
 */
export async function startTicketPlanCore(
  userId: string,
  input: StartTicketPlanInput,
): Promise<StartTicketPlanResult> {
  if (isTicketPlansKillSwitchOn()) {
    return { status: 503, message: tr("paySmallSmallIsPausedRightNow") };
  }
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }

  const quantityCheck = validateCheckoutQuantities(coreT(), input.quantities);
  if (!quantityCheck.ok) {
    return { status: 400, message: quantityCheck.message };
  }

  if (
    !(await checkRateLimit(
      `ticket-plan-start:${userId}`,
      MAX_PLAN_STARTS_PER_MINUTE,
      60,
    ))
  ) {
    return { status: 429, message: tr("tooManyCheckoutAttemptsPleaseTry") };
  }

  const event = await loadEvent(input.eventId);
  if (event === "error") {
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (!event) return { status: 404, message: tr("noEventFound") };

  const computed = await computeOffer(
    userId,
    event,
    input.occurrenceId ?? null,
  );
  if (!("event" in computed)) {
    const { offer } = computed;
    return offer.reason === "already_open"
      ? {
          status: 409,
          message: offerRefusal(offer.reason),
          planId: offer.planId ?? undefined,
        }
      : { status: 409, message: offerRefusal(offer.reason) };
  }
  const { offer, rules } = computed;

  const requested = Object.entries(input.quantities).filter(([, q]) => q > 0);
  const totalTickets = requested.reduce((s, [, q]) => s + q, 0);
  if (totalTickets > rules.maxTicketsPerPlan) {
    return {
      status: 400,
      message: tr("youCanPaySmallSmallForUp", {
        count: rules.maxTicketsPerPlan,
      }),
    };
  }

  // Price every line from the ticket types themselves; no promo codes on a
  // plan (version 1).
  const typesById = new Map(event.ticket_type.map((t) => [t.id, t]));
  const currency = event.currency;
  let ticketTotal = zero(currency);
  const lines: {
    ticket_type_id: string;
    quantity: number;
    unit_price: number;
    discount: number;
    discounted_units: number;
    amount: number;
  }[] = [];
  for (const [ticketTypeId, quantity] of requested) {
    const type = typesById.get(ticketTypeId);
    if (!type || !isPaidType(type) || type.currency !== currency) {
      return { status: 400, message: tr("onlyPaidTicketsCanBePaid") };
    }
    const unitPrice = Number(type.price);
    const { discount, amount } = computeLineAmount(
      quantity,
      unitPrice,
      0,
      0,
      currency,
    );
    ticketTotal = add(ticketTotal, fromMajor(amount, currency));
    lines.push({
      ticket_type_id: ticketTypeId,
      quantity,
      unit_price: unitPrice,
      discount,
      discounted_units: 0,
      amount,
    });
  }

  const market = await getMarketOrDefault(event.country_code);
  const totals = computeOrderTotals({
    subtotal: ticketTotal,
    discount: null,
    serviceFeeBps: offer.serviceFeeBps,
    tax: market.tax,
  });
  const minimums = planMinimums(totals.total.amountMinor, rules);
  const holdExpiresAt = new Date(Date.now() + rules.holdMinutes * 60_000);

  const service = getSupabaseServiceClient();
  const { data: planId, error } = await service.rpc("ticket_plan_create", {
    p_user_id: userId,
    p_event_id: event.id,
    p_occurrence_id: offer.occurrenceId,
    p_lines: lines,
    p_currency: currency,
    p_country_code: event.country_code,
    p_ticket_minor: totals.net.amountMinor,
    p_fee_minor: totals.serviceFee.amountMinor,
    p_tax_minor: totals.taxAdded.amountMinor,
    p_fee_bps: offer.serviceFeeBps,
    p_first_part_min_minor: minimums.firstPartMinMinor,
    p_part_min_minor: minimums.partMinMinor,
    p_keep_fee_on_refund: rules.keepFeeOnRefund,
    p_hold_expires_at: holdExpiresAt.toISOString(),
    p_deadline_at: offer.deadlineAt,
    p_event_starts_at: offer.eventStartsAt,
    // The generated types make p_occurrence_id a string; null means "no date".
  } as unknown as Database["public"]["Functions"]["ticket_plan_create"]["Args"]);

  if (error || !planId) {
    const text = error?.message ?? "";
    logger.error(
      `ticket_plan_create failed for event ${event.id}, user ${userId}: ${text}`,
    );
    if (text.includes("already open")) {
      const open = await openPlanFor(userId, event.id);
      return {
        status: 409,
        message: tr("youReAlreadyPayingSmallSmall"),
        planId: open ?? undefined,
      };
    }
    if (text.startsWith("ticket_plan_create:")) {
      return {
        status: 409,
        message: text.includes("deadline")
          ? tr("thisEventIsTooSoonToPay")
          : tr("paySmallSmallIsnTAvailableFor"),
      };
    }
    // create_ticket_checkout's own words ("Only 2 spots are left…") are
    // written for people; anything else is not passed on.
    return {
      status: 409,
      message:
        text && !/violates|permission|function |column |relation /i.test(text)
          ? text
          : tr("somethingWentWrong"),
    };
  }

  // Abonten Rewards: credit the referral link that brought the buyer here,
  // exactly as a checkout does. Never blocks the plan.
  const { data: created } = await service
    .from("ticket_plan")
    .select("checkout_session_id")
    .eq("id", planId as string)
    .maybeSingle();
  if (created?.checkout_session_id) {
    await stampCheckoutReferralCore({
      userId,
      checkoutSessionId: created.checkout_session_id,
      event: { id: event.id, eventCode: event.event_code },
      hints: input.referralHints,
    });
  }

  return { status: 200, data: { planId: planId as string } };
}

export type PayTicketPlanPartInput = {
  planId: string;
  amountMinor: number;
  paymentMethodId?: string | null;
  method?: string | null;
  platform?: ClientPlatform | null;
};

export type PayTicketPlanPartResult =
  | {
      status: 200;
      data: { attemptId: string; planId: string; payment: CheckoutInit };
    }
  | { status: 400 | 403 | 404 | 409 | 500 | 503; message: string };

/**
 * Starts the charge for one part. The amount is checked against the plan
 * (at least the minimum, at most what is left); the method against the
 * event's market. Only one part can be in flight at a time.
 */
export async function payTicketPlanPartCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  userEmail: string | undefined,
  input: PayTicketPlanPartInput,
  callbackUrlFor: (planId: string, attemptId: string) => string,
): Promise<PayTicketPlanPartResult> {
  if (isTicketPlansKillSwitchOn()) {
    return { status: 503, message: tr("paySmallSmallIsPausedRightNow") };
  }
  if (!userEmail) {
    return { status: 400, message: tr("yourAccountNeedsAVerifiedEmail") };
  }

  const service = getSupabaseServiceClient();
  const { data: plan, error } = await service
    .from("ticket_plan")
    .select(
      "id, user_id, status, currency, country_code, total_minor, paid_minor, first_part_min_minor, part_min_minor, deadline_at, event:event_id(title)",
    )
    .eq("id", input.planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    logger.error(`payTicketPlanPart: plan read failed (${error.message})`);
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (!plan) return { status: 404, message: tr("thisPlanWasNotFound") };

  if (new Date(plan.deadline_at).getTime() <= Date.now()) {
    return { status: 409, message: tr("theDeadlineToFinishPayingHas") };
  }

  const amounts = {
    status: plan.status as TicketPlanDetail["status"],
    totalMinor: Number(plan.total_minor),
    paidMinor: Number(plan.paid_minor),
    firstPartMinMinor: Number(plan.first_part_min_minor),
    partMinMinor: Number(plan.part_min_minor),
  };
  const check = checkPartAmount(amounts, input.amountMinor);
  if (!check.ok) {
    const say = (minor: number) =>
      formatMoney(money(minor, plan.currency), { locale: requestLocale() });
    const remaining = amounts.totalMinor - amounts.paidMinor;
    const minimum = Math.min(
      amounts.paidMinor === 0
        ? amounts.firstPartMinMinor
        : amounts.partMinMinor,
      remaining,
    );
    switch (check.problem) {
      case "not_payable":
        return { status: 409, message: tr("thisPlanIsNotTakingPayments") };
      case "below_minimum":
        return {
          status: 400,
          message: tr("payAtLeastThisTime", { amount: say(minimum) }),
        };
      case "above_remaining":
        return {
          status: 400,
          message: tr("onlyIsLeftToPay", { amount: say(remaining) }),
        };
      default:
        return { status: 400, message: tr("enterAnAmountToPay") };
    }
  }

  const resolved = await resolvePaymentChoice(supabase, userId, input, {
    countryCode: plan.country_code,
    currency: plan.currency,
  });
  if (!resolved.ok) {
    return { status: resolved.status, message: resolved.message };
  }
  const choice = resolved.choice;
  const amount = money(input.amountMinor, plan.currency);
  const eventTitle =
    (plan.event as unknown as { title: string | null } | null)?.title ?? "";

  // Twice at most: an open part started for another amount or method is
  // retired by chargeInit, and the second pass starts fresh.
  for (let pass = 0; pass < 2; pass++) {
    const attempt = await upsertPaymentAttemptForSession(
      userId,
      "ticket_plan_id",
      plan.id,
      toMajor(amount),
      plan.currency,
      choice.paymentMethodId,
      undefined,
      { countryCode: plan.country_code, provider: choice.providerCode },
      { method: choice.methodCode },
    );
    if (attempt.status !== 200) {
      return { status: attempt.status, message: attempt.message };
    }

    const charge = await initiateChargeForAttempt({
      attempt: attempt.data,
      amount,
      countryCode: plan.country_code,
      email: userEmail,
      paymentMethod: choice.saved,
      methodCode: choice.methodCode,
      providerCode: choice.providerCode,
      callbackUrl: callbackUrlFor(plan.id, attempt.data.id),
      description: tr("partPaymentForEvent", { event: eventTitle }),
    });
    if (charge.status === 200) {
      return {
        status: 200,
        data: {
          attemptId: attempt.data.id,
          planId: plan.id,
          payment: charge.data,
        },
      };
    }
    if (charge.status === 409 && "busy" in charge) {
      return { status: 409, message: charge.message };
    }
    if (charge.status === 409 && pass === 0) continue;
    return charge.status === 409
      ? { status: 409, message: charge.message }
      : { status: charge.status, message: charge.message };
  }
  return { status: 409, message: tr("thisOrderChangedSinceItsPayment") };
}

export async function getTicketPlanCore(
  userId: string,
  planId: string,
): Promise<
  | { status: 200; data: TicketPlanDetail }
  | { status: 404 | 500; message: string }
> {
  const detail = await loadPlanDetail(userId, planId);
  if (detail === "error") {
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (!detail) return { status: 404, message: tr("thisPlanWasNotFound") };
  return { status: 200, data: detail };
}

export async function listTicketPlansCore(
  userId: string,
): Promise<
  { status: 200; data: TicketPlanSummary[] } | { status: 500; message: string }
> {
  const plans = await listPlanSummaries(userId);
  if (!plans) return { status: 500, message: tr("somethingWentWrong") };
  return { status: 200, data: plans };
}

/**
 * The buyer ends their own unfinished plan: the seats go back on sale and
 * what was paid comes back per the plan's terms (shown before they start
 * and again before they confirm).
 */
export async function cancelTicketPlanCore(
  userId: string,
  planId: string,
): Promise<
  | { status: 200; data: TicketPlanDetail; message: string }
  | { status: 404 | 409 | 500; message: string }
> {
  const { data: plan, error } = await getSupabaseServiceClient()
    .from("ticket_plan")
    .select("id, status")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    logger.error(`cancelTicketPlan: plan read failed (${error.message})`);
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (!plan) return { status: 404, message: tr("thisPlanWasNotFound") };
  if (plan.status === "settling") {
    return { status: 409, message: tr("thisPlanIsFullyPaidYourTickets") };
  }

  const ended = await endTicketPlan(plan.id, "cancelled", "buyer");
  if (ended.outcome === "busy") {
    return { status: 409, message: tr("aPaymentForThisPlanIs") };
  }
  if (ended.outcome === "error") {
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (ended.outcome === "not_open") {
    return { status: 409, message: tr("thisPlanHasAlreadyEnded") };
  }

  const detail = await loadPlanDetail(userId, plan.id);
  if (!detail || detail === "error") {
    return { status: 500, message: tr("somethingWentWrong") };
  }
  return {
    status: 200,
    data: detail,
    message:
      ended.refundMinor > 0
        ? tr("planCancelledYourRefundIsOn")
        : tr("planCancelled"),
  };
}

/**
 * The Balance screen: money put towards tickets on open plans, the plans,
 * and — for people who can see Rewards — their Abonten Credit. The two are
 * different ledgers and are never added together: credit cannot be cashed
 * out and expires; plan money is the buyer's cash on its way to a ticket.
 */
export async function getBalanceCore(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<
  { status: 200; data: BalanceOverview } | { status: 500; message: string }
> {
  const [plans, access, credit] = await Promise.all([
    listPlanSummaries(userId),
    resolveTicketPlanAccess(getSupabaseServiceClient(), userId),
    getCreditSummaryCore(supabase, userId).catch(() => null),
  ]);
  if (!plans) return { status: 500, message: tr("somethingWentWrong") };

  const saved = new Map<string, number>();
  for (const plan of plans) {
    if (plan.status !== "awaiting_payment" && plan.status !== "active") {
      continue;
    }
    saved.set(plan.currency, (saved.get(plan.currency) ?? 0) + plan.paidMinor);
  }

  const creditData =
    credit && credit.status === 200 && credit.data?.enabled
      ? {
          availableMinor: credit.data.availableMinor,
          pendingMinor: credit.data.pendingMinor,
          currency: credit.data.currency,
        }
      : null;

  return {
    status: 200,
    data: {
      plansEnabled: access.program.enabled,
      savedTowardsTickets: [...saved.entries()].map(
        ([currency, amountMinor]) => ({ currency, amountMinor }),
      ),
      plans,
      credit: creditData,
    },
  };
}
