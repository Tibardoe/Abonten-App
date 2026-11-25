// Hapniin's partner (reseller) push API, v1
// (https://dash.hapniin.com/partner-docs, OpenAPI partner-api-openapi.json).
//
//   GET  /api/partner/v1/events        live, unseated events + products
//   POST /api/partner/v1/orders        a sale completed elsewhere, created
//                                      PAID, priced by Hapniin; needs an
//                                      Idempotency-Key
//   GET  /api/partner/v1/orders/:id    the order, each attendee's ticketCode
//   webhook order.completed            HMAC-SHA256 of the raw body in
//                                      X-Hapniin-Signature ("sha256=<hex>")
//
// One base URL for live and sandbox: the key decides (pk_live_ /
// pk_sandbox_). 100 requests per 60 s per key (the sender stays under it,
// gate_partner_rate_take). Errors are { error: { code, message } }; we
// branch on code. The base URL is a constant on purpose: an environment
// override could send the key to another host. Tests pass their own.

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  GatePartnerEvent,
  GatePartnerProduct,
} from "@abonten/core/gatePartners/gateLinkRules";
import {
  HTTP_TIMEOUTS,
  fetchWithTimeout,
  isFetchTimeoutError,
} from "@abonten/core/http/fetchWithTimeout";
import type {
  GateOrder,
  GateOrderAttendee,
  GateOrderInput,
  GateOrderReceipt,
  GatePartnerAdapter,
  GatePartnerError,
  GatePartnerErrorKind,
  GateResult,
  GateWebhookCheck,
  HeaderReader,
} from "./adapter";

export const HAPNIIN_BASE_URL = "https://dash.hapniin.com";

// The codes Hapniin documents as definite refusals of an order: nothing was
// created, so the same request can never succeed by being sent again.
const REFUSED_CODES = new Set([
  "MISSING_IDEMPOTENCY_KEY",
  "INVALID_JSON",
  "VALIDATION_ERROR",
  "EVENT_NOT_FOUND",
  "SEATED_EVENT_NOT_SUPPORTED",
  "NO_ITEMS",
  "PRODUCT_NOT_FOUND",
  "PRODUCT_NOT_ON_SALE",
  "PRODUCT_SALE_ENDED",
  "INVALID_QUANTITY",
  "SOLD_OUT",
]);

type Options = {
  baseUrl?: string;
  readTimeoutMs?: number;
  writeTimeoutMs?: number;
};

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
      ? Number(v)
      : null;

function fail(
  kind: GatePartnerErrorKind,
  code: string,
  httpStatus: number | null,
  detail: string,
  retryAfterSeconds: number | null = null,
): { ok: false; error: GatePartnerError } {
  return {
    ok: false,
    error: {
      kind,
      code,
      httpStatus,
      retryAfterSeconds,
      detail: detail.slice(0, 480),
    },
  };
}

function retryAfter(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const at = Date.parse(raw);
  return Number.isFinite(at)
    ? Math.max(1, Math.ceil((at - Date.now()) / 1000))
    : null;
}

/** Sorts a non-2xx answer into what the sender should do with it. */
export function classifyHapniinError(
  status: number,
  code: string | null,
  message: string,
  retryAfterSeconds: number | null,
): GatePartnerError {
  const c = code ?? `HTTP_${status}`;
  let kind: GatePartnerErrorKind;
  if (status === 429 || c === "RATE_LIMITED") kind = "rate_limited";
  else if (status === 409 || c === "REQUEST_IN_PROGRESS") kind = "in_progress";
  else if (status === 401 || status === 403) kind = "auth";
  else if (c === "ORDER_NOT_FOUND") kind = "not_found";
  else if (REFUSED_CODES.has(c)) kind = "refused";
  else if (status >= 400 && status < 500) kind = "refused";
  else kind = "retry";
  return {
    kind,
    code: c,
    httpStatus: status,
    retryAfterSeconds,
    detail: message.slice(0, 480),
  };
}

async function call<T>(
  baseUrl: string,
  apiKey: string,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string },
  timeoutMs: number,
  parse: (body: unknown) => T | null,
): Promise<GateResult<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  let res: Response;
  try {
    res = await fetchWithTimeout(`${baseUrl}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      timeoutMs,
    });
  } catch (error) {
    return isFetchTimeoutError(error)
      ? fail("retry", "TIMEOUT", null, `${init.method} ${path} timed out`)
      : fail(
          "retry",
          "NETWORK",
          null,
          `${init.method} ${path}: ${error instanceof Error ? error.message : String(error)}`,
        );
  }

  let body: unknown = null;
  const text = await res.text().catch(() => "");
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const err = (body as { error?: { code?: unknown; message?: unknown } })
      ?.error;
    return {
      ok: false,
      error: classifyHapniinError(
        res.status,
        str(err?.code),
        str(err?.message) ?? `${init.method} ${path} answered ${res.status}`,
        retryAfter(res),
      ),
    };
  }

  const parsed = parse(body);
  if (parsed === null) {
    return fail(
      "retry",
      "BAD_RESPONSE",
      res.status,
      `${init.method} ${path}: unexpected response`,
    );
  }
  return { ok: true, data: parsed };
}

function parseProduct(raw: unknown): GatePartnerProduct | null {
  const p = raw as Record<string, unknown> | null;
  const id = str(p?.id);
  const price = num(p?.price);
  if (!id || price === null) return null;
  return {
    id,
    name: str(p?.name) ?? id,
    type: str(p?.type) ?? "TICKET",
    price,
  };
}

function parseEvents(body: unknown): GatePartnerEvent[] | null {
  const events = (body as { events?: unknown })?.events;
  if (!Array.isArray(events)) return null;
  const out: GatePartnerEvent[] = [];
  for (const raw of events) {
    const e = raw as Record<string, unknown> | null;
    const id = str(e?.id);
    const currency = str(e?.currency);
    if (!id || !currency) continue;
    const products = Array.isArray(e?.products) ? e.products : [];
    out.push({
      id,
      title: str(e?.title) ?? id,
      startDate: str(e?.startDate),
      currency: currency.toUpperCase(),
      venueName: str(e?.venueName),
      products: products
        .map(parseProduct)
        .filter((p): p is GatePartnerProduct => p !== null),
    });
  }
  return out;
}

function parseReceipt(body: unknown): GateOrderReceipt | null {
  const o = (body as { order?: Record<string, unknown> })?.order;
  const orderId = str(o?.id);
  if (!orderId) return null;
  return {
    orderId,
    shortId: str(o?.shortId),
    status: str(o?.status),
    attendeeCount: num(o?.attendeeCount),
  };
}

function parseOrder(body: unknown): GateOrder | null {
  const o = (body as { order?: Record<string, unknown> })?.order;
  const id = str(o?.id);
  if (!id) return null;
  const attendees: GateOrderAttendee[] = (
    Array.isArray(o?.attendees) ? o.attendees : []
  ).map((raw: unknown) => {
    const a = raw as Record<string, unknown> | null;
    return {
      id: str(a?.id),
      code: str(a?.ticketCode),
      status: str(a?.status),
    };
  });
  return { id, shortId: str(o?.shortId), status: str(o?.status), attendees };
}

/** sha256=<hex> of the raw body, compared in constant time. */
export function hapniinSignatureMatches(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header || !secret) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
  const a = Buffer.from(header.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createHapniinAdapter(
  options: Options = {},
): GatePartnerAdapter {
  const baseUrl = (options.baseUrl ?? HAPNIIN_BASE_URL).replace(/\/+$/, "");
  const readMs = options.readTimeoutMs ?? HTTP_TIMEOUTS.gatePartnerRead;
  const writeMs = options.writeTimeoutMs ?? HTTP_TIMEOUTS.gatePartnerWrite;

  return {
    provider: "hapniin",

    listEvents(apiKey) {
      return call(
        baseUrl,
        apiKey,
        "/api/partner/v1/events",
        { method: "GET" },
        readMs,
        parseEvents,
      );
    },

    pushOrder(apiKey, order: GateOrderInput, idempotencyKey) {
      return call(
        baseUrl,
        apiKey,
        "/api/partner/v1/orders",
        {
          method: "POST",
          idempotencyKey,
          body: {
            eventId: order.partnerEventId,
            firstName: order.buyer.firstName,
            lastName: order.buyer.lastName,
            email: order.buyer.email,
            ...(order.buyer.phone ? { phone: order.buyer.phone } : {}),
            items: order.items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
            })),
          },
        },
        writeMs,
        parseReceipt,
      );
    },

    getOrder(apiKey, orderId) {
      return call(
        baseUrl,
        apiKey,
        `/api/partner/v1/orders/${encodeURIComponent(orderId)}`,
        { method: "GET" },
        readMs,
        parseOrder,
      );
    },

    verifyWebhook(
      rawBody: string,
      headers: HeaderReader,
      secrets: readonly string[],
    ): GateWebhookCheck {
      const signature = headers.get("x-hapniin-signature");
      if (
        !secrets.some((s) => hapniinSignatureMatches(rawBody, signature, s))
      ) {
        return { ok: false, reason: "signature" };
      }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        return { ok: false, reason: "payload" };
      }
      const type = str(body?.event) ?? str(headers.get("x-hapniin-event"));
      if (!type) return { ok: false, reason: "payload" };
      const data = (body.data ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        event: {
          type,
          orderId: str(data.orderId),
          orderShortId: str(data.orderShortId),
          deliveryId: str(headers.get("x-hapniin-delivery")),
        },
      };
    },
  };
}
