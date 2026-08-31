import type {
  AddMomoWalletBody,
  ApiEnvelope,
  CheckoutAttemptBody,
  CheckoutAttemptResult,
  CheckoutSessionRow,
  CloudinarySignatureData,
  MomoNetwork,
  NotificationType,
  OrganizerDashboardPeriod,
  OrganizerFinanceResult,
  OrganizerLedgerTransactionRow,
  OrganizerOverviewResult,
  PaginatedResult,
  PaymentMethodRow,
  PhoneSession,
  PreparedCheckoutPayment,
  ProfileData,
  RequestPhoneOtpBody,
  RequestPhoneOtpData,
  SubmitChargeOtpResult,
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
    init: { method: "GET" | "POST"; body?: unknown; auth: boolean },
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
      /** Record a payment_attempt and start the Paystack charge. */
      attempt(body: CheckoutAttemptBody) {
        return request<CheckoutAttemptResult>("/api/mobile/checkout/attempt", {
          method: "POST",
          body,
          auth: true,
        });
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
    },

    paymentMethods: {
      list() {
        return request<ApiEnvelope<PaymentMethodRow[]>>(
          "/api/mobile/payment-methods",
          { method: "GET", auth: true },
        );
      },
      /** Add a mobile money wallet (network + phone). Cards aren't addable
       *  from the app — they need a server-captured authorization code. */
      addMomo(body: AddMomoWalletBody) {
        return request<ApiEnvelope<PaymentMethodRow>>(
          "/api/mobile/payment-methods",
          { method: "POST", body, auth: true },
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
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
