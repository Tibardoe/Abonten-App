import type {
  AddMomoWalletBody,
  AddPayoutAccountBody,
  AddPayoutAccountResult,
  AddPlacePhotoBody,
  AddPlaceServiceBody,
  ApiEnvelope,
  AttendanceRow,
  BookingStatus,
  CancelEventResult,
  CancelTicketBody,
  CancelTicketResult,
  CardVerificationInitData,
  ChangePhoneResult,
  CheckInTicketResult,
  CheckoutAttemptBody,
  CheckoutAttemptResult,
  CheckoutSessionRow,
  CloudinarySignatureData,
  DeleteEventDraftResult,
  DeleteHighlightResult,
  DeletePlaceDraftResult,
  DeletePromoCodeResult,
  DeviceRegisterBody,
  DeviceTokenResult,
  EventCancellationImpactResult,
  EventCreateBody,
  EventCreateResult,
  EventDraftDetailResult,
  EventDraftsListResult,
  EventEditContextResult,
  EventInsightsResult,
  EventPromoCodesResult,
  EventPromotionContextResult,
  FreeRsvpBody,
  FreeRsvpResult,
  MomoNetwork,
  MutatePayoutAccountResult,
  NotificationType,
  OrganizerDashboardPeriod,
  OrganizerDashboardWidgetsResult,
  OrganizerFinanceResult,
  OrganizerLedgerTransactionRow,
  OrganizerOverviewResult,
  OrganizerPlaceRow,
  OwnerPlaceBooking,
  OwnerPlaceReviewRow,
  PaginatedResult,
  PaymentMethodRow,
  PayoutAccountsResult,
  PayoutsResult,
  PendingCheckoutSession,
  PhoneSession,
  PlaceBookingRespondResult,
  PlaceCreateBody,
  PlaceCreateResult,
  PlaceDraftDetailResult,
  PlaceDraftsListResult,
  PlaceHoursStatusResult,
  PlaceInsightsResult,
  PlaceManageContextResult,
  PlaceOpeningHoursInput,
  PlacePhotoResult,
  PlacePromotionContextResult,
  PlaceReviewRespondResult,
  PlaceServiceResult,
  PreparedCheckoutPayment,
  ProfileData,
  PromoteEventResult,
  PromotePlaceResult,
  PromotionPaymentAttemptResult,
  RequestPayoutBody,
  RequestPayoutResult,
  RequestPhoneOtpBody,
  RequestPhoneOtpData,
  RespondToPlaceBookingBody,
  RespondToPlaceReviewBody,
  SaveEventDraftBody,
  SaveEventDraftResult,
  SavePlaceDraftBody,
  SavePlaceDraftResult,
  SetPlaceStatusBody,
  SubmitChargeOtpResult,
  UpdateEventBody,
  UpdateEventResult,
  UpdateEventTicketTypesBody,
  UpdateEventTicketTypesResult,
  UpdatePlaceBody,
  UpdatePlaceResult,
  UpdatePlaceServiceBody,
  UpdatePromoCodeBody,
  UpdatePromoCodeResult,
  UploadSignatureKind,
  UserPostType,
  ValidateCheckoutBody,
  ValidateCheckoutResult,
  VerifyPaymentResult,
  VerifyPhoneOtpBody,
} from "./types";

export type ApiClientOptions = {
  /** Origin of the web deployment that hosts /api/mobile, no trailing slash. */
  baseUrl: string;
  /**
   * Returns the current Supabase access token, or null when signed out.
   * Called on every authenticated request so a refreshed token is always
   * picked up. Auth endpoints (phone request/verify) ignore it.
   */
  getAccessToken?: () => string | null | Promise<string | null>;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
};

/** Thrown only for transport/parse failures — HTTP error *statuses* come
 *  back in the body for the caller to branch on, same as a Server Action
 *  result. */
export class ApiTransportError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ApiTransportError";
  }
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path}`;
}

export function createApiClient(options: ApiClientOptions) {
  const doFetch = options.fetch ?? globalThis.fetch;

  async function request<TResponse extends { status: number }>(
    path: string,
    init: {
      method: "GET" | "POST" | "PATCH" | "PUT";
      body?: unknown;
      auth: boolean;
    },
  ): Promise<TResponse> {
    const headers: Record<string, string> = {};

    if (init.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    if (init.auth) {
      const token = (await options.getAccessToken?.()) ?? null;
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await doFetch(joinUrl(options.baseUrl, path), {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch (error) {
      throw new ApiTransportError(`Request to ${path} failed`, error);
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch (error) {
      throw new ApiTransportError(
        `Response from ${path} was not JSON (HTTP ${response.status})`,
        error,
      );
    }

    const body = (parsed ?? {}) as TResponse;

    // Routes always set `status`, but fall back to the HTTP code just in case.
    if (typeof body.status !== "number") {
      (body as { status: number }).status = response.status;
    }

    return body;
  }

  return {
    auth: {
      requestPhoneOtp(body: RequestPhoneOtpBody) {
        return request<ApiEnvelope<RequestPhoneOtpData>>(
          "/api/mobile/auth/phone/request",
          { method: "POST", body, auth: false },
        );
      },
      verifyPhoneOtp(body: VerifyPhoneOtpBody) {
        return request<ApiEnvelope<PhoneSession>>(
          "/api/mobile/auth/phone/verify",
          { method: "POST", body, auth: false },
        );
      },
    },

    notifications: {
      list(params?: { cursor?: string | null; pageSize?: number }) {
        const query = new URLSearchParams();
        if (params?.cursor) query.set("cursor", params.cursor);
        if (params?.pageSize) query.set("pageSize", String(params.pageSize));
        const qs = query.toString();
        return request<PaginatedResult<NotificationType>>(
          `/api/mobile/notifications${qs ? `?${qs}` : ""}`,
          { method: "GET", auth: true },
        );
      },
      markRead(notificationId: string) {
        return request<ApiEnvelope<never>>("/api/mobile/notifications/read", {
          method: "POST",
          body: { notificationId },
          auth: true,
        });
      },
      markAllRead() {
        return request<ApiEnvelope<never>>(
          "/api/mobile/notifications/read-all",
          { method: "POST", auth: true },
        );
      },
    },

    profile: {
      get() {
        return request<ApiEnvelope<ProfileData>>("/api/mobile/profile", {
          method: "GET",
          auth: true,
        });
      },
    },

    account: {
      /** Send a Hubtel OTP to change/add the signed-in user's phone number
       *  (purpose "phone-update"). */
      requestPhoneChange(body: RequestPhoneOtpBody) {
        return request<ApiEnvelope<RequestPhoneOtpData>>(
          "/api/mobile/account/phone/request",
          { method: "POST", body, auth: true },
        );
      },
      /** Confirm the OTP; on 200 the number is attached + marked verified. */
      verifyPhoneChange(body: VerifyPhoneOtpBody) {
        return request<ChangePhoneResult>("/api/mobile/account/phone/verify", {
          method: "POST",
          body,
          auth: true,
        });
      },
    },

    uploads: {
      signature(kind: UploadSignatureKind) {
        return request<ApiEnvelope<CloudinarySignatureData>>(
          "/api/mobile/uploads/signature",
          { method: "POST", body: { kind }, auth: true },
        );
      },
    },

    checkout: {
      /** Reserve inventory + open a pending checkout session. */
      validate(body: ValidateCheckoutBody) {
        return request<ValidateCheckoutResult>(
          "/api/mobile/checkout/validate",
          {
            method: "POST",
            body,
            auth: true,
          },
        );
      },
      /** One-click RSVP for a free ("FREE" ticket type) event — no session,
       *  no payment, quantity always 1. */
      freeRsvp(body: FreeRsvpBody) {
        return request<FreeRsvpResult>("/api/mobile/checkout/free-rsvp", {
          method: "POST",
          body,
          auth: true,
        });
      },
      /** Authoritative amount owed for the given pending sessions. */
      prepare(checkoutSessionIds: string[]) {
        return request<ApiEnvelope<PreparedCheckoutPayment>>(
          "/api/mobile/checkout/prepare",
          { method: "POST", body: { checkoutSessionIds }, auth: true },
        );
      },
      /** The caller's line items for one checkout session. */
      getSession(checkoutSessionId: string) {
        return request<ApiEnvelope<CheckoutSessionRow[]>>(
          `/api/mobile/checkout/session/${encodeURIComponent(checkoutSessionId)}`,
          { method: "GET", auth: true },
        );
      },
      /** Cancel a pending session and release its reservations. */
      cancel(checkoutSessionId: string) {
        return request<ApiEnvelope<never>>("/api/mobile/checkout/cancel", {
          method: "POST",
          body: { checkoutSessionId },
          auth: true,
        });
      },
      /** Every active, non-expired pending checkout session for the caller
       *  (across all their events) — the "resume checkout" basket. */
      pending() {
        return request<ApiEnvelope<PendingCheckoutSession[]>>(
          "/api/mobile/checkout/pending",
          { method: "GET", auth: true },
        );
      },
      /** Record a payment_attempt and start the Paystack charge. */
      attempt(body: CheckoutAttemptBody) {
        return request<CheckoutAttemptResult>("/api/mobile/checkout/attempt", {
          method: "POST",
          body,
          auth: true,
        });
      },
      /**
       * Start the Paystack charge for a pending event-promotion checkout.
       * Completion is the shared payments.verify path.
       */
      promotionAttempt(body: {
        eventPromotionCheckoutId: string;
        paymentMethodId: string;
      }) {
        return request<PromotionPaymentAttemptResult>(
          "/api/mobile/checkout/promotion-attempt",
          { method: "POST", body, auth: true },
        );
      },
      /**
       * The place sibling of promotionAttempt — start the Paystack charge
       * for a pending place-promotion checkout. Completion is the same
       * shared payments.verify path.
       */
      placePromotionAttempt(body: {
        placePromotionCheckoutId: string;
        paymentMethodId: string;
      }) {
        return request<PromotionPaymentAttemptResult>(
          "/api/mobile/checkout/place-promotion-attempt",
          { method: "POST", body, auth: true },
        );
      },
    },

    payments: {
      /** Optimistically finalize a Paystack payment (races the webhook). */
      verify(paymentAttemptId: string) {
        return request<VerifyPaymentResult>("/api/mobile/payments/verify", {
          method: "POST",
          body: { paymentAttemptId },
          auth: true,
        });
      },
      /** Submit an OTP for a direct charge that returned "send_otp". */
      submitChargeOtp(paymentAttemptId: string, otp: string) {
        return request<SubmitChargeOtpResult>(
          "/api/mobile/payments/charge-otp",
          { method: "POST", body: { paymentAttemptId, otp }, auth: true },
        );
      },
      /** Recover a "paid but ticket issuance failed" (207) payment. Never
       *  re-charges — re-runs the same finalize pipeline. Same result shape
       *  as verify(). */
      retry(paymentAttemptId: string) {
        return request<VerifyPaymentResult>("/api/mobile/payments/retry", {
          method: "POST",
          body: { paymentAttemptId },
          auth: true,
        });
      },
    },

    tickets: {
      /** Cancel one of the caller's tickets. Pass transactionId (from the
       *  ticket row) for a paid ticket so the refund can be gated. */
      cancel(body: CancelTicketBody) {
        return request<CancelTicketResult>("/api/mobile/tickets/cancel", {
          method: "POST",
          body,
          auth: true,
        });
      },
    },

    highlights: {
      /** Delete every slide in one of the caller's highlight groups
       *  (Cloudinary asset first). Upload is client-side — the
       *  highlight_owner_insert RLS + a signed uploads.signature("highlight")
       *  Cloudinary POST — so there is no create method here. */
      deleteGroup(groupId: string) {
        return request<DeleteHighlightResult>(
          "/api/mobile/highlights/group/delete",
          { method: "POST", body: { groupId }, auth: true },
        );
      },
      /** Delete one slide from one of the caller's highlights. */
      deleteSlide(slideId: string) {
        return request<DeleteHighlightResult>(
          "/api/mobile/highlights/slide/delete",
          { method: "POST", body: { slideId }, auth: true },
        );
      },
    },

    places: {
      /** Publish a place. Upload the cover photo first via
       *  uploads.signature("place_photo") + a direct Cloudinary POST, then
       *  pass its public_id/version here. Reuse the same clientRequestId on
       *  a retry so a replay returns the same place, not a duplicate. */
      create(body: PlaceCreateBody) {
        return request<PlaceCreateResult>("/api/mobile/places", {
          method: "POST",
          body,
          auth: true,
        });
      },
    },

    events: {
      /** Publish an event. Upload the flyer first via
       *  uploads.signature("event_flyer") + a direct Cloudinary POST, then
       *  pass its public_id/version here. Reuse the same clientRequestId on
       *  a retry so a replay returns the same event, not a duplicate. */
      create(body: EventCreateBody) {
        return request<EventCreateResult>("/api/mobile/events", {
          method: "POST",
          body,
          auth: true,
        });
      },
    },

    paymentMethods: {
      list() {
        return request<ApiEnvelope<PaymentMethodRow[]>>(
          "/api/mobile/payment-methods",
          { method: "GET", auth: true },
        );
      },
      /** Add a mobile money wallet (network + phone). */
      addMomo(body: AddMomoWalletBody) {
        return request<ApiEnvelope<PaymentMethodRow>>(
          "/api/mobile/payment-methods",
          { method: "POST", body, auth: true },
        );
      },
      /** Start the GHS 1 card-verification charge. Open `authorizationUrl`
       *  in a browser session, then call confirmCard(reference) once it
       *  closes. */
      initCard() {
        return request<ApiEnvelope<CardVerificationInitData>>(
          "/api/mobile/payment-methods/card/init",
          { method: "POST", auth: true },
        );
      },
      /** Finish the card save after the verification popup closes — verifies
       *  the charge, captures the reusable authorization, refunds the GHS 1,
       *  saves the card. */
      confirmCard(reference: string, label?: string) {
        return request<ApiEnvelope<PaymentMethodRow>>(
          "/api/mobile/payment-methods/card/confirm",
          { method: "POST", body: { reference, label }, auth: true },
        );
      },
      remove(paymentMethodId: string) {
        return request<ApiEnvelope<never>>(
          "/api/mobile/payment-methods/remove",
          { method: "POST", body: { paymentMethodId }, auth: true },
        );
      },
      setDefault(paymentMethodId: string) {
        return request<ApiEnvelope<never>>(
          "/api/mobile/payment-methods/default",
          { method: "POST", body: { paymentMethodId }, auth: true },
        );
      },
    },

    paystack: {
      /** Live Ghana mobile money networks for the add-wallet picker. */
      momoNetworks() {
        return request<ApiEnvelope<MomoNetwork[]>>(
          "/api/mobile/paystack/momo-networks",
          { method: "GET", auth: true },
        );
      },
    },

    devices: {
      /** Save this device's Expo push token for the signed-in user. */
      register(body: DeviceRegisterBody) {
        return request<DeviceTokenResult>("/api/mobile/devices/register", {
          method: "POST",
          body,
          auth: true,
        });
      },
      /** Drop this device's push token (on sign-out). */
      unregister(token: string) {
        return request<DeviceTokenResult>("/api/mobile/devices/unregister", {
          method: "POST",
          body: { token },
          auth: true,
        });
      },
    },

    organizer: {
      /** Dashboard KPIs for the period + its comparison window. */
      overview(period: OrganizerDashboardPeriod = "30d") {
        return request<OrganizerOverviewResult>(
          `/api/mobile/organizer/overview?period=${period}`,
          { method: "GET", auth: true },
        );
      },
      /** Balance figures per currency (pending / available / total). */
      finance() {
        return request<OrganizerFinanceResult>(
          "/api/mobile/organizer/finance",
          { method: "GET", auth: true },
        );
      },
      /**
       * Every Dashboard widget section (sales timeline, event performance,
       * upcoming events, needs attention, recent activity) for the period,
       * in one call — the counterpart to overview()'s KPI cards.
       */
      dashboardWidgets(period: OrganizerDashboardPeriod = "30d") {
        return request<OrganizerDashboardWidgetsResult>(
          `/api/mobile/organizer/dashboard?period=${period}`,
          { method: "GET", auth: true },
        );
      },
      /** The caller's non-expired event drafts, newest first (list columns
       *  only — no jsonb payload). */
      eventDrafts() {
        return request<EventDraftsListResult>(
          "/api/mobile/organizer/event-drafts",
          { method: "GET", auth: true },
        );
      },
      /** The full payload + flyer ids for one event draft, to resume it in
       *  the create wizard. 404 if not owned, 410 if expired. */
      eventDraft(draftId: string) {
        return request<EventDraftDetailResult>(
          `/api/mobile/organizer/event-drafts/${encodeURIComponent(draftId)}`,
          { method: "GET", auth: true },
        );
      },
      /** Create (`draftId` omitted) or update an event draft. Upload a
       *  replacement flyer from the device first (kind "event_flyer") and
       *  pass its `flyerPublicId` / `flyerVersion`, or omit both to keep the
       *  current one. `expectedUpdatedAt` guards against a concurrent edit
       *  (409). */
      saveEventDraft(body: SaveEventDraftBody) {
        return request<SaveEventDraftResult>(
          "/api/mobile/organizer/event-drafts",
          { method: "POST", body, auth: true },
        );
      },
      /** Delete one event draft (row + best-effort Cloudinary flyer). */
      deleteEventDraft(draftId: string) {
        return request<DeleteEventDraftResult>(
          `/api/mobile/organizer/event-drafts/${encodeURIComponent(
            draftId,
          )}/delete`,
          { method: "POST", auth: true },
        );
      },
      /** The caller's non-expired place drafts, newest first (list columns
       *  only — no jsonb payload). */
      placeDrafts() {
        return request<PlaceDraftsListResult>(
          "/api/mobile/organizer/place-drafts",
          { method: "GET", auth: true },
        );
      },
      /** The full payload + cover ids for one place draft, to resume it in
       *  the create wizard. 404 if not owned, 410 if expired. */
      placeDraft(draftId: string) {
        return request<PlaceDraftDetailResult>(
          `/api/mobile/organizer/place-drafts/${encodeURIComponent(draftId)}`,
          { method: "GET", auth: true },
        );
      },
      /** Create (`draftId` omitted) or update a place draft. Upload a
       *  replacement cover from the device first (kind "place_photo") and
       *  pass its `coverPublicId` / `coverVersion`, or omit both to keep the
       *  current one. `expectedUpdatedAt` guards against a concurrent edit
       *  (409). */
      savePlaceDraft(body: SavePlaceDraftBody) {
        return request<SavePlaceDraftResult>(
          "/api/mobile/organizer/place-drafts",
          { method: "POST", body, auth: true },
        );
      },
      /** Delete one place draft (row + best-effort Cloudinary cover). */
      deletePlaceDraft(draftId: string) {
        return request<DeletePlaceDraftResult>(
          `/api/mobile/organizer/place-drafts/${encodeURIComponent(
            draftId,
          )}/delete`,
          { method: "POST", auth: true },
        );
      },
      /** The caller's own events, newest first, every status. */
      events(params?: { cursor?: string | null; pageSize?: number }) {
        const query = new URLSearchParams();
        if (params?.cursor) query.set("cursor", params.cursor);
        if (params?.pageSize) query.set("pageSize", String(params.pageSize));
        const qs = query.toString();
        return request<PaginatedResult<UserPostType>>(
          `/api/mobile/organizer/events${qs ? `?${qs}` : ""}`,
          { method: "GET", auth: true },
        );
      },
      /** Paginated transactions feed (sales, fees, refunds, payouts). */
      ledger(params?: { cursor?: string | null; pageSize?: number }) {
        const query = new URLSearchParams();
        if (params?.cursor) query.set("cursor", params.cursor);
        if (params?.pageSize) query.set("pageSize", String(params.pageSize));
        const qs = query.toString();
        return request<PaginatedResult<OrganizerLedgerTransactionRow>>(
          `/api/mobile/organizer/ledger${qs ? `?${qs}` : ""}`,
          { method: "GET", auth: true },
        );
      },

      /** Active payout destinations. */
      payoutAccounts() {
        return request<PayoutAccountsResult>(
          "/api/mobile/organizer/payout-accounts",
          { method: "GET", auth: true },
        );
      },
      /** Add a payout destination (mobile money or bank). */
      addPayoutAccount(body: AddPayoutAccountBody) {
        return request<AddPayoutAccountResult>(
          "/api/mobile/organizer/payout-accounts",
          { method: "POST", body, auth: true },
        );
      },
      removePayoutAccount(payoutAccountId: string) {
        return request<MutatePayoutAccountResult>(
          "/api/mobile/organizer/payout-accounts/remove",
          { method: "POST", body: { payoutAccountId }, auth: true },
        );
      },
      setDefaultPayoutAccount(payoutAccountId: string) {
        return request<MutatePayoutAccountResult>(
          "/api/mobile/organizer/payout-accounts/default",
          { method: "POST", body: { payoutAccountId }, auth: true },
        );
      },
      /** Withdrawal history, newest first (simple offset pagination). */
      payouts(params?: { offset?: number; limit?: number }) {
        const query = new URLSearchParams();
        if (params?.offset) query.set("offset", String(params.offset));
        if (params?.limit) query.set("limit", String(params.limit));
        const qs = query.toString();
        return request<PayoutsResult>(
          `/api/mobile/organizer/payouts${qs ? `?${qs}` : ""}`,
          { method: "GET", auth: true },
        );
      },
      /** Request a withdrawal to a saved payout account. */
      requestPayout(body: RequestPayoutBody) {
        return request<RequestPayoutResult>("/api/mobile/organizer/payout", {
          method: "POST",
          body,
          auth: true,
        });
      },
      /** Server-verified impact counts for the cancel-event confirm screen. */
      eventCancellationImpact(eventId: string) {
        return request<EventCancellationImpactResult>(
          `/api/mobile/organizer/events/cancellation-impact?eventId=${encodeURIComponent(
            eventId,
          )}`,
          { method: "GET", auth: true },
        );
      },
      /** Cancel an event: release tickets, start refunds, notify attendees. */
      cancelEvent(eventId: string) {
        return request<CancelEventResult>(
          "/api/mobile/organizer/events/cancel",
          { method: "POST", body: { eventId }, auth: true },
        );
      },
      /**
       * Full Event Insights payload (overview, finance, ticket-type / promo /
       * per-date breakdowns, returning-attendee stats) for the period, in one
       * call. 403 if the event isn't the caller's.
       */
      eventInsights(eventId: string, period: OrganizerDashboardPeriod = "all") {
        return request<EventInsightsResult>(
          `/api/mobile/organizer/events/${encodeURIComponent(
            eventId,
          )}/analytics?period=${period}`,
          { method: "GET", auth: true },
        );
      },
      /**
       * The caller's own event row for prefilling the edit form, plus
       * `hasConfirmedParticipation` (dates / location / capacity locked).
       * 404 if the event isn't the caller's.
       */
      eventEditContext(eventId: string) {
        return request<EventEditContextResult>(
          `/api/mobile/organizer/events/${encodeURIComponent(eventId)}/edit`,
          { method: "GET", auth: true },
        );
      },
      /**
       * Edit the core, non-ticketing fields of the caller's own event. A
       * replacement flyer is uploaded from the device first; pass its
       * `flyerPublicId` / `flyerVersion`, or omit both to keep the current
       * one. Ticket types are a separate endpoint.
       */
      updateEvent(eventId: string, body: UpdateEventBody) {
        return request<UpdateEventResult>(
          `/api/mobile/organizer/events/${encodeURIComponent(eventId)}`,
          { method: "PATCH", body, auth: true },
        );
      },
      /**
       * Replace the caller's event's ticket types. Editable only until the
       * event's first confirmed ticket (409 after).
       */
      updateEventTicketTypes(
        eventId: string,
        body: UpdateEventTicketTypesBody,
      ) {
        return request<UpdateEventTicketTypesResult>(
          `/api/mobile/organizer/events/${encodeURIComponent(
            eventId,
          )}/ticket-types`,
          { method: "PUT", body, auth: true },
        );
      },
      /**
       * The Promotion tab payload: seeded tiers, the current active promotion
       * (if any), and whether a new promotion is ineligible. 403 if the event
       * isn't the caller's.
       */
      eventPromotionContext(eventId: string) {
        return request<EventPromotionContextResult>(
          `/api/mobile/organizer/events/${encodeURIComponent(
            eventId,
          )}/promotion`,
          { method: "GET", auth: true },
        );
      },
      /**
       * Reserve step: create a pending event-promotion checkout priced from
       * the seeded tier, and get its id + amount for the payment screen.
       */
      promoteEvent(eventId: string, tierId: number) {
        return request<PromoteEventResult>(
          `/api/mobile/organizer/events/${encodeURIComponent(eventId)}/promote`,
          { method: "POST", body: { tierId }, auth: true },
        );
      },
      /**
       * Cursor-paginated attendee list for one of the caller's own events,
       * each row carrying the attendee's real account email / phone.
       * `row.ticket?.status === "used"` means checked in. 403 if not owned.
       */
      eventAttendees(
        eventId: string,
        params?: { cursor?: string | null; pageSize?: number },
      ) {
        const query = new URLSearchParams();
        if (params?.cursor) query.set("cursor", params.cursor);
        if (params?.pageSize) query.set("pageSize", String(params.pageSize));
        const qs = query.toString();
        return request<PaginatedResult<AttendanceRow>>(
          `/api/mobile/organizer/events/${encodeURIComponent(
            eventId,
          )}/attendees${qs ? `?${qs}` : ""}`,
          { method: "GET", auth: true },
        );
      },
      /**
       * Flip one ticket between checked-in (`true`) and not (`false`) — the
       * same transition as the web attendee list's Check in / undo buttons.
       * 403 unless the caller owns the ticket's event.
       */
      checkInTicket(ticketId: string, checkedIn: boolean) {
        return request<CheckInTicketResult>(
          `/api/mobile/organizer/tickets/${encodeURIComponent(
            ticketId,
          )}/check-in`,
          { method: "POST", body: { checkedIn }, auth: true },
        );
      },
      /**
       * The caller's own event's promo codes, newest first, with usage
       * counts. Codes are created only in the event wizard's Promos step;
       * this surface edits or removes existing ones. 403 if not owned.
       */
      eventPromoCodes(eventId: string) {
        return request<EventPromoCodesResult>(
          `/api/mobile/organizer/events/${encodeURIComponent(
            eventId,
          )}/promo-codes`,
          { method: "GET", auth: true },
        );
      },
      /**
       * Edit the terms of one existing promo code (discount, usage cap,
       * expiry, active flag) — never its text or event. 403 unless the
       * caller owns the code's event.
       */
      updatePromoCode(body: UpdatePromoCodeBody) {
        return request<UpdatePromoCodeResult>(
          "/api/mobile/organizer/promo-codes/update",
          { method: "POST", body, auth: true },
        );
      },
      /**
       * Remove one promo code. A code that has already been redeemed is
       * deactivated instead (`deactivatedOnly: true`) so its usage history
       * survives. 403 unless the caller owns the code's event.
       */
      deletePromoCode(promoCodeId: string) {
        return request<DeletePromoCodeResult>(
          "/api/mobile/organizer/promo-codes/delete",
          { method: "POST", body: { promoCodeId }, auth: true },
        );
      },
      /** The caller's own places, newest first, every status. */
      places(params?: { cursor?: string | null; pageSize?: number }) {
        const query = new URLSearchParams();
        if (params?.cursor) query.set("cursor", params.cursor);
        if (params?.pageSize) query.set("pageSize", String(params.pageSize));
        const qs = query.toString();
        return request<PaginatedResult<OrganizerPlaceRow>>(
          `/api/mobile/organizer/places${qs ? `?${qs}` : ""}`,
          { method: "GET", auth: true },
        );
      },
      /**
       * Owner-only stat counts for one place (views / directions / phone /
       * whatsapp / favorites / reviews). 404 if the place isn't the caller's.
       */
      placeInsights(placeId: string) {
        return request<PlaceInsightsResult>(
          `/api/mobile/organizer/places/${encodeURIComponent(
            placeId,
          )}/insights`,
          { method: "GET", auth: true },
        );
      },
      /**
       * The caller's own place row (editable fields) + its weekly hours +
       * its services — one read to prefill the per-place management forms.
       * 404 if the place isn't the caller's.
       */
      placeManageContext(placeId: string) {
        return request<PlaceManageContextResult>(
          `/api/mobile/organizer/places/${encodeURIComponent(placeId)}/manage`,
          { method: "GET", auth: true },
        );
      },
      /**
       * Edit a place's core fields (name / description / category / contact
       * / location / cover). A replacement cover is uploaded from the device
       * first; pass `coverPublicId` / `coverVersion`, or omit both to keep
       * the current one. Hours / services are separate endpoints.
       */
      updatePlace(placeId: string, body: UpdatePlaceBody) {
        return request<UpdatePlaceResult>(
          `/api/mobile/organizer/places/${encodeURIComponent(placeId)}`,
          { method: "PATCH", body, auth: true },
        );
      },
      /** Replace a place's whole weekly opening-hours schedule. */
      updatePlaceHours(
        placeId: string,
        openingHours: PlaceOpeningHoursInput[],
      ) {
        return request<PlaceHoursStatusResult>(
          `/api/mobile/organizer/places/${encodeURIComponent(placeId)}/hours`,
          { method: "PUT", body: { openingHours }, auth: true },
        );
      },
      /**
       * Set (or clear, with `status: null`) a place's temporary-closed
       * status. A note without a status is dropped.
       */
      setPlaceStatus(placeId: string, body: SetPlaceStatusBody) {
        return request<PlaceHoursStatusResult>(
          `/api/mobile/organizer/places/${encodeURIComponent(placeId)}/status`,
          { method: "POST", body, auth: true },
        );
      },
      /** Add a service to one of the caller's places. */
      addPlaceService(placeId: string, body: AddPlaceServiceBody) {
        return request<PlaceServiceResult>(
          `/api/mobile/organizer/places/${encodeURIComponent(
            placeId,
          )}/services`,
          { method: "POST", body, auth: true },
        );
      },
      /**
       * Edit one service (`null` clears a field, an omitted key leaves it).
       * 403 unless the caller owns the service's place.
       */
      updatePlaceService(
        placeId: string,
        serviceId: string,
        body: UpdatePlaceServiceBody,
      ) {
        return request<PlaceServiceResult>(
          `/api/mobile/organizer/places/${encodeURIComponent(
            placeId,
          )}/services/${encodeURIComponent(serviceId)}`,
          { method: "PATCH", body, auth: true },
        );
      },
      /** Remove one service. 403 unless the caller owns its place. */
      removePlaceService(placeId: string, serviceId: string) {
        return request<PlaceServiceResult>(
          `/api/mobile/organizer/places/${encodeURIComponent(
            placeId,
          )}/services/${encodeURIComponent(serviceId)}/delete`,
          { method: "POST", auth: true },
        );
      },
      /**
       * Record one gallery photo after uploading its bytes straight to
       * Cloudinary via uploads.signature("place_photo"). 403 if the
       * publicId isn't in this caller's place_photos folder.
       */
      addPlacePhoto(placeId: string, body: AddPlacePhotoBody) {
        return request<PlacePhotoResult>(
          `/api/mobile/organizer/places/${encodeURIComponent(placeId)}/photos`,
          { method: "POST", body, auth: true },
        );
      },
      /** Set each gallery photo's position to its index in `photoIds`. */
      reorderPlacePhotos(placeId: string, photoIds: string[]) {
        return request<PlacePhotoResult>(
          `/api/mobile/organizer/places/${encodeURIComponent(
            placeId,
          )}/photos/reorder`,
          { method: "POST", body: { photoIds }, auth: true },
        );
      },
      /** Remove one gallery photo (row + best-effort Cloudinary asset). */
      removePlacePhoto(placeId: string, photoId: string) {
        return request<PlacePhotoResult>(
          `/api/mobile/organizer/places/${encodeURIComponent(
            placeId,
          )}/photos/${encodeURIComponent(photoId)}/delete`,
          { method: "POST", auth: true },
        );
      },
      /**
       * Cursor-paginated booking requests for one of the caller's own
       * places. Omit `status` for the "All" view. 403 if not owned.
       */
      placeBookings(
        placeId: string,
        params?: {
          status?: BookingStatus;
          cursor?: string | null;
          pageSize?: number;
        },
      ) {
        const query = new URLSearchParams();
        if (params?.status) query.set("status", params.status);
        if (params?.cursor) query.set("cursor", params.cursor);
        if (params?.pageSize) query.set("pageSize", String(params.pageSize));
        const qs = query.toString();
        return request<PaginatedResult<OwnerPlaceBooking>>(
          `/api/mobile/organizer/places/${encodeURIComponent(
            placeId,
          )}/bookings${qs ? `?${qs}` : ""}`,
          { method: "GET", auth: true },
        );
      },
      /**
       * Accept or decline a pending booking request. 409 if it was already
       * responded to; 403 unless the caller owns the booking's place. The
       * customer is notified either way.
       */
      respondToPlaceBooking(placeId: string, body: RespondToPlaceBookingBody) {
        return request<PlaceBookingRespondResult>(
          `/api/mobile/organizer/places/${encodeURIComponent(
            placeId,
          )}/bookings/respond`,
          { method: "POST", body, auth: true },
        );
      },
      /**
       * Cursor-paginated approved reviews for one of the caller's own
       * places (the same list the public detail page shows). 403 if not
       * owned.
       */
      placeReviews(
        placeId: string,
        params?: { cursor?: string | null; pageSize?: number },
      ) {
        const query = new URLSearchParams();
        if (params?.cursor) query.set("cursor", params.cursor);
        if (params?.pageSize) query.set("pageSize", String(params.pageSize));
        const qs = query.toString();
        return request<PaginatedResult<OwnerPlaceReviewRow>>(
          `/api/mobile/organizer/places/${encodeURIComponent(
            placeId,
          )}/reviews${qs ? `?${qs}` : ""}`,
          { method: "GET", auth: true },
        );
      },
      /**
       * Post (or overwrite) the owner's public reply to one review. 403
       * unless the caller owns the review's place.
       */
      respondToPlaceReview(placeId: string, body: RespondToPlaceReviewBody) {
        return request<PlaceReviewRespondResult>(
          `/api/mobile/organizer/places/${encodeURIComponent(
            placeId,
          )}/reviews/respond`,
          { method: "POST", body, auth: true },
        );
      },
      /**
       * The Promotion tab payload for one of the caller's own places: the
       * seeded tiers + the current active promotion (if any). 403 if not
       * owned.
       */
      placePromotionContext(placeId: string) {
        return request<PlacePromotionContextResult>(
          `/api/mobile/organizer/places/${encodeURIComponent(
            placeId,
          )}/promotion`,
          { method: "GET", auth: true },
        );
      },
      /**
       * Reserve step: create a pending place-promotion checkout priced from
       * the seeded tier, and get its id + amount for the payment screen.
       */
      promotePlace(placeId: string, tierId: number) {
        return request<PromotePlaceResult>(
          `/api/mobile/organizer/places/${encodeURIComponent(placeId)}/promote`,
          { method: "POST", body: { tierId }, auth: true },
        );
      },
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
