// A stand-in for Hapniin's partner API, built from its published OpenAPI
// description (hapniin-partner-openapi.json, fetched 2026-11-25 from
// https://dash.hapniin.com/partner-api-openapi.json) and the rules on
// https://dash.hapniin.com/partner-docs. Used by the unit tests and the
// integration suite so nothing ever calls Hapniin itself (no keys exist).
//
// It enforces what the docs say: a Bearer key (pk_live_/pk_sandbox_),
// an Idempotency-Key on POST /orders that replays the first answer, prices
// from its own catalog, seated events refused, sold-out stock, 100 requests
// a minute per key, orders visible only to the key that made them. Every
// request body is checked against the spec's schema and every answer is
// built to the spec's response schema (schemaProblems).

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import spec from "./hapniin-partner-openapi.json";

type Schema = {
  $ref?: string;
  type?: string;
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  enum?: string[];
  minItems?: number;
  minimum?: number;
  nullable?: boolean;
};

const SCHEMAS = spec.components.schemas as Record<string, Schema>;

function resolve(schema: Schema): Schema {
  if (!schema.$ref) return schema;
  const name = schema.$ref.split("/").at(-1) as string;
  return SCHEMAS[name];
}

/** What is wrong with `value` against the spec's schema `name` (empty: fine). */
export function schemaProblems(
  name: string,
  value: unknown,
  path = name,
): string[] {
  return check(SCHEMAS[name], value, path);
}

function check(raw: Schema, value: unknown, path: string): string[] {
  const schema = resolve(raw);
  if (value === null || value === undefined) {
    return schema.nullable ? [] : [`${path} is missing`];
  }
  const out: string[] = [];
  switch (schema.type) {
    case "object": {
      if (typeof value !== "object" || Array.isArray(value)) {
        return [`${path} is not an object`];
      }
      const v = value as Record<string, unknown>;
      for (const key of schema.required ?? []) {
        if (v[key] === undefined) out.push(`${path}.${key} is required`);
      }
      for (const [key, sub] of Object.entries(schema.properties ?? {})) {
        if (v[key] !== undefined)
          out.push(...check(sub, v[key], `${path}.${key}`));
      }
      return out;
    }
    case "array": {
      if (!Array.isArray(value)) return [`${path} is not an array`];
      if (schema.minItems && value.length < schema.minItems) {
        out.push(`${path} needs at least ${schema.minItems} item(s)`);
      }
      value.forEach((item, i) => {
        if (schema.items)
          out.push(...check(schema.items, item, `${path}[${i}]`));
      });
      return out;
    }
    case "string":
      if (typeof value !== "string") return [`${path} is not a string`];
      if (schema.enum && !schema.enum.includes(value)) {
        return [`${path} is not one of ${schema.enum.join(", ")}`];
      }
      return [];
    case "integer":
      if (!Number.isInteger(value)) return [`${path} is not an integer`];
      if (schema.minimum !== undefined && (value as number) < schema.minimum) {
        return [`${path} is below ${schema.minimum}`];
      }
      return [];
    case "number":
      return typeof value === "number" ? [] : [`${path} is not a number`];
    case "boolean":
      return typeof value === "boolean" ? [] : [`${path} is not a boolean`];
    default:
      return [];
  }
}

export type MockProduct = {
  id: string;
  name: string;
  type?: "TICKET" | "MERCHANDISE" | "ADDON";
  price: number;
  /** Places left; undefined = unlimited. */
  stock?: number;
};

export type MockEvent = {
  id: string;
  title: string;
  startDate: string;
  currency: string;
  seated?: boolean;
  products: MockProduct[];
};

export type MockOrder = {
  id: string;
  shortId: string;
  key: string;
  eventId: string;
  totalPrice: number;
  currency: string;
  createdAt: string;
  attendees: { id: string; ticketCode: string; status: string }[];
};

export type MockRequest = {
  method: string;
  path: string;
  idempotencyKey: string | null;
  body: unknown;
  /** What the request body breaks in the spec (empty: valid). */
  problems: string[];
};

export type HapniinMock = {
  url: string;
  events: MockEvent[];
  orders: Map<string, MockOrder>;
  requests: MockRequest[];
  /** Answer the next N requests with this status and error code. */
  failNext(n: number, status: number, code: string, retryAfter?: number): void;
  /** Hide attendee codes for the next N order lookups (codes not out yet). */
  withholdCodes(n: number): void;
  close(): Promise<void>;
};

const VALID_KEY = /^pk_(live|sandbox)_[A-Za-z0-9]+$/;
const RATE_LIMITED = "RATE_LIMITED";

let codeCounter = 0;
function newCode(): string {
  codeCounter += 1;
  return `TCK-${(100000 + codeCounter).toString(36).toUpperCase()}`;
}

export async function startHapniinMock(
  initialEvents: MockEvent[],
): Promise<HapniinMock> {
  const events = initialEvents.map((e) => ({
    ...e,
    products: e.products.map((p) => ({ ...p })),
  }));
  const orders = new Map<string, MockOrder>();
  const byKey = new Map<string, { status: number; body: unknown }>();
  const requests: MockRequest[] = [];
  const window = new Map<string, number[]>();
  let failures: {
    n: number;
    status: number;
    code: string;
    retryAfter?: number;
  } | null = null;
  let withheld = 0;

  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
    });
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const send = (
        status: number,
        body: unknown,
        headers: Record<string, string> = {},
      ) => {
        res.writeHead(status, {
          "Content-Type": "application/json",
          ...headers,
        });
        res.end(JSON.stringify(body));
      };
      const error = (status: number, code: string, message = code) =>
        send(status, { error: { code, message } });

      let body: unknown = null;
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = Symbol.for("invalid");
        }
      }
      const idem =
        (req.headers["idempotency-key"] as string | undefined) ?? null;
      const record: MockRequest = {
        method: req.method ?? "GET",
        path: url.pathname,
        idempotencyKey: idem,
        body,
        problems:
          req.method === "POST" && url.pathname === "/api/partner/v1/orders"
            ? schemaProblems("OrderRequest", body)
            : [],
      };
      requests.push(record);

      const auth = req.headers.authorization ?? "";
      if (!auth.startsWith("Bearer ")) return error(401, "MISSING_API_KEY");
      const key = auth.slice("Bearer ".length).trim();
      if (!VALID_KEY.test(key)) return error(401, "INVALID_API_KEY");

      // 100 requests per 60 seconds per key.
      const now = Date.now();
      const hits = (window.get(key) ?? []).filter((t) => now - t < 60_000);
      if (hits.length >= 100) {
        return send(
          429,
          { error: { code: RATE_LIMITED, message: RATE_LIMITED } },
          { "Retry-After": "30" },
        );
      }
      hits.push(now);
      window.set(key, hits);

      if (failures && failures.n > 0) {
        failures.n -= 1;
        const f = failures;
        if (f.n === 0) failures = null;
        return send(
          f.status,
          { error: { code: f.code, message: f.code } },
          f.retryAfter ? { "Retry-After": String(f.retryAfter) } : {},
        );
      }

      if (req.method === "GET" && url.pathname === "/api/partner/v1/events") {
        return send(200, {
          events: events
            .filter((e) => !e.seated)
            .map((e) => ({
              id: e.id,
              title: e.title,
              slug: e.id,
              startDate: e.startDate,
              endDate: e.startDate,
              timezone: "Africa/Accra",
              currency: e.currency,
              isOnline: false,
              venueName: "Accra",
              venueCity: "Accra",
              venueCountry: "GH",
              products: e.products.map((p) => ({
                id: p.id,
                name: p.name,
                type: p.type ?? "TICKET",
                code: null,
                price: p.price,
              })),
            })),
        });
      }

      if (req.method === "POST" && url.pathname === "/api/partner/v1/orders") {
        if (!idem) return error(400, "MISSING_IDEMPOTENCY_KEY");
        const scoped = `${key}:${idem}`;
        const replay = byKey.get(scoped);
        if (replay) return send(replay.status, replay.body);
        if (typeof body === "symbol") return error(400, "INVALID_JSON");
        if (record.problems.length > 0) {
          return error(400, "VALIDATION_ERROR", record.problems[0]);
        }
        const b = body as {
          eventId: string;
          items: { productId: string; quantity: number }[];
        };
        const event = events.find((e) => e.id === b.eventId);
        if (!event) return error(404, "EVENT_NOT_FOUND");
        if (event.seated) return error(400, "SEATED_EVENT_NOT_SUPPORTED");
        if (b.items.length === 0) return error(400, "NO_ITEMS");
        let total = 0;
        let count = 0;
        for (const item of b.items) {
          const product = event.products.find((p) => p.id === item.productId);
          if (!product) return error(400, "PRODUCT_NOT_FOUND");
          if (item.quantity < 1 || item.quantity > 10) {
            return error(400, "INVALID_QUANTITY");
          }
          if (product.stock !== undefined && product.stock < item.quantity) {
            return error(400, "SOLD_OUT");
          }
          total += product.price * item.quantity;
          count += item.quantity;
        }
        for (const item of b.items) {
          const product = event.products.find((p) => p.id === item.productId);
          if (product?.stock !== undefined) product.stock -= item.quantity;
        }
        const id = `ord_${orders.size + 1}${Math.random().toString(36).slice(2, 7)}`;
        const order: MockOrder = {
          id,
          shortId: `o_${id.slice(4)}`,
          key,
          eventId: event.id,
          totalPrice: total,
          currency: event.currency,
          createdAt: new Date().toISOString(),
          attendees: Array.from({ length: count }, (_, i) => ({
            id: `att_${id}_${i + 1}`,
            ticketCode: newCode(),
            status: "ACTIVE",
          })),
        };
        orders.set(id, order);
        const answer = {
          status: 201,
          body: {
            order: {
              id,
              shortId: order.shortId,
              status: "PAID",
              totalPrice: total,
              currency: event.currency,
              attendeeCount: count,
            },
          },
        };
        byKey.set(scoped, answer);
        return send(answer.status, answer.body);
      }

      const match = url.pathname.match(/^\/api\/partner\/v1\/orders\/([^/]+)$/);
      if (req.method === "GET" && match) {
        const ref = decodeURIComponent(match[1]);
        const order = [...orders.values()].find(
          (o) => (o.id === ref || o.shortId === ref) && o.key === key,
        );
        if (!order) return error(404, "ORDER_NOT_FOUND");
        const hide = withheld > 0;
        if (hide) withheld -= 1;
        return send(200, {
          order: {
            id: order.id,
            shortId: order.shortId,
            status: "PAID",
            totalPrice: order.totalPrice,
            currency: order.currency,
            createdAt: order.createdAt,
            paidAt: order.createdAt,
            attendees: hide
              ? []
              : order.attendees.map((a) => ({
                  ...a,
                  firstName: "Ama",
                  lastName: "Mensah",
                  email: "buyer@example.com",
                })),
          },
        });
      }

      return error(404, "NOT_FOUND");
    });
  });

  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    events,
    orders,
    requests,
    failNext(n, status, code, retryAfter) {
      failures = { n, status, code, retryAfter };
    },
    withholdCodes(n) {
      withheld = n;
    },
    close: () =>
      new Promise<void>((done) => {
        server.close(() => done());
      }),
  };
}
