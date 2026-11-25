// A gate partner's API as Abonten uses it (docs/architecture/
// gate-partner-connectors.md). One adapter per partner; Hapniin is the
// first (hapniinAdapter.ts). Everything a sale needs goes through these
// four calls, so a second partner is a second adapter, not a second flow.

import type {
  GatePartnerEvent,
  GatePartnerProvider,
} from "@abonten/core/gatePartners/gateLinkRules";

/**
 * How a failed request should be handled:
 *  - retry         unknown outcome (timeout, network, 5xx): send again later
 *                  with the SAME idempotency key;
 *  - in_progress   the partner is still working on that key: ask again soon;
 *  - rate_limited  too many requests: wait `retryAfterSeconds`;
 *  - auth          the key is missing, wrong or not allowed: configuration,
 *                  retried with backoff and alerted;
 *  - not_found     the order is not (yet) visible to this key;
 *  - refused       the partner definitely refused it (sold out, unknown
 *                  product, sale closed, invalid): nothing was created and
 *                  retrying the same request cannot succeed. Staff act.
 */
export type GatePartnerErrorKind =
  | "retry"
  | "in_progress"
  | "rate_limited"
  | "auth"
  | "not_found"
  | "refused";

export type GatePartnerError = {
  kind: GatePartnerErrorKind;
  /** The partner's stable error code, or ours (TIMEOUT, NETWORK, BAD_RESPONSE). */
  code: string;
  httpStatus: number | null;
  retryAfterSeconds: number | null;
  /** For logs and staff, never shown to buyers. */
  detail: string;
};

export type GateResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: GatePartnerError };

export type GateOrderInput = {
  partnerEventId: string;
  buyer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  items: { productId: string; quantity: number }[];
};

export type GateOrderReceipt = {
  orderId: string;
  shortId: string | null;
  status: string | null;
  attendeeCount: number | null;
};

export type GateOrderAttendee = {
  id: string | null;
  code: string | null;
  status: string | null;
};

export type GateOrder = {
  id: string;
  shortId: string | null;
  status: string | null;
  attendees: GateOrderAttendee[];
};

export type GateWebhookEvent = {
  type: string;
  orderId: string | null;
  orderShortId: string | null;
  deliveryId: string | null;
};

export type GateWebhookCheck =
  | { ok: true; event: GateWebhookEvent }
  | { ok: false; reason: "signature" | "payload" };

/** Reads one request header, case-insensitively (a Headers object works). */
export type HeaderReader = { get(name: string): string | null };

export interface GatePartnerAdapter {
  readonly provider: GatePartnerProvider;
  /** Live events the key may sell, with their products and prices. */
  listEvents(apiKey: string): Promise<GateResult<GatePartnerEvent[]>>;
  /** Registers a completed sale; the partner creates it paid. */
  pushOrder(
    apiKey: string,
    order: GateOrderInput,
    idempotencyKey: string,
  ): Promise<GateResult<GateOrderReceipt>>;
  /** One of our orders, with each attendee's ticket code. */
  getOrder(apiKey: string, orderId: string): Promise<GateResult<GateOrder>>;
  /** Checks a webhook delivery against any of the given secrets. */
  verifyWebhook(
    rawBody: string,
    headers: HeaderReader,
    secrets: readonly string[],
  ): GateWebhookCheck;
}
