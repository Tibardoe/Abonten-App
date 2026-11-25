// Gate partner connectors (docs/architecture/gate-partner-connectors.md):
// the rules for linking an Abonten event to a partner's gate system, keyed
// by codes and free of any network or database. The SQL twin of the event
// rules is public.gate_partner_event_problems(); the services check both.

import { tryFromMajor } from "../money/money";

/** Partners whose check-in system Abonten can register sales with. */
export const GATE_PARTNER_PROVIDERS = ["hapniin"] as const;
export type GatePartnerProvider = (typeof GATE_PARTNER_PROVIDERS)[number];

export function isGatePartnerProvider(
  value: unknown,
): value is GatePartnerProvider {
  return (
    typeof value === "string" &&
    (GATE_PARTNER_PROVIDERS as readonly string[]).includes(value)
  );
}

/** The provider's name as people know it (a brand, not a word to translate). */
export const GATE_PARTNER_NAMES: Record<GatePartnerProvider, string> = {
  hapniin: "Hapniin",
};

/** The partner's brand name for a provider code (unknown codes as given). */
export function gatePartnerName(provider: string): string {
  return isGatePartnerProvider(provider)
    ? GATE_PARTNER_NAMES[provider]
    : provider;
}

/** Feature flag that lets staff link an organizer's events (allowSubjects). */
export const GATE_PARTNERS_FLAG = "tickets.gate_partners";

export type GateLinkStatus = "active" | "paused" | "ended";
export type GatePushStatus =
  | "queued"
  | "sending"
  | "ordered"
  | "done"
  | "failed"
  | "cancelled";
export type GateTicketState = "issued" | "to_void" | "voided";

/**
 * Why an event cannot be linked (public.gate_partner_event_problems): the
 * things a partner's order cannot express one to one, and anything sold
 * already (every ticket must carry the partner's code).
 */
export type GateEventProblem =
  | "not_found"
  | "not_published"
  | "postponed"
  | "seated"
  | "multi_date"
  | "no_tickets"
  | "open_amount"
  | "group_ticket"
  | "pass"
  | "group_prices"
  | "free_ticket"
  | "has_sales";

/** What the event's facts say about linking it (the SQL rule, in TS). */
export type GateEventFacts = {
  status: string | null;
  postponedAt: string | null;
  seated: boolean;
  occurrences: number;
  groupPrices: number;
  hasSales: boolean;
  ticketTypes: readonly {
    type: string;
    price: number | null;
    admits?: number | null;
    amountMode?: string | null;
    passShows?: number | null;
    seatingSectionId?: string | null;
  }[];
};

export function gateEventProblems(facts: GateEventFacts): GateEventProblem[] {
  const out: GateEventProblem[] = [];
  const types = facts.ticketTypes;
  if (facts.status !== "published") out.push("not_published");
  if (facts.postponedAt) out.push("postponed");
  if (facts.seated || types.some((t) => t.seatingSectionId)) out.push("seated");
  if (facts.occurrences > 0) out.push("multi_date");
  if (types.length === 0) out.push("no_tickets");
  if (types.some((t) => (t.amountMode ?? "fixed") !== "fixed")) {
    out.push("open_amount");
  }
  if (types.some((t) => (t.admits ?? 1) !== 1)) out.push("group_ticket");
  if (types.some((t) => t.passShows != null)) out.push("pass");
  if (facts.groupPrices > 0) out.push("group_prices");
  if (types.some((t) => t.type === "FREE" || (t.price ?? 0) <= 0)) {
    out.push("free_ticket");
  }
  if (facts.hasSales) out.push("has_sales");
  return out;
}

/** A partner event as its catalog lists it (prices in major units). */
export type GatePartnerEvent = {
  id: string;
  title: string;
  startDate: string | null;
  currency: string;
  venueName?: string | null;
  products: readonly GatePartnerProduct[];
};

export type GatePartnerProduct = {
  id: string;
  name: string;
  /** TICKET / MERCHANDISE / ADDON (Hapniin); only tickets can be mapped. */
  type: string;
  price: number;
};

export type GateMappingInput = {
  ticketTypeId: string;
  partnerProductId: string;
};

export type GateMappingProblem =
  | { code: "partner_event_missing" }
  | { code: "currency"; partner: string; abonten: string }
  | { code: "unmapped"; ticketTypeId: string }
  | { code: "unknown_ticket_type"; ticketTypeId: string }
  | { code: "duplicate_ticket_type"; ticketTypeId: string }
  | { code: "duplicate_product"; partnerProductId: string }
  | { code: "product_missing"; ticketTypeId: string; partnerProductId: string }
  | { code: "not_a_ticket"; ticketTypeId: string; partnerProductId: string }
  | {
      code: "price";
      ticketTypeId: string;
      partnerProductId: string;
      abontenMinor: number;
      partnerMinor: number;
    };

/** Said, not refused: worth a second look before linking. */
export type GateMappingWarning =
  | { code: "date"; partnerStart: string; abontenStart: string }
  | { code: "unmapped_partner_ticket"; partnerProductId: string };

export type GateMappingCheck = {
  problems: GateMappingProblem[];
  warnings: GateMappingWarning[];
  /** The products to store, when there is no problem. */
  products: {
    ticketTypeId: string;
    partnerProductId: string;
    partnerProductName: string;
    partnerPrice: number;
  }[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Every Abonten ticket type maps to exactly one of the partner event's
 * ticket products, in the same currency and at the same price to the
 * currency's smallest unit (the partner prices each order from its own
 * catalog, so a different price would register a different sale).
 */
export function checkGateMapping(input: {
  abonten: {
    currency: string;
    startsAt: string | null;
    ticketTypes: readonly { id: string; price: number | null }[];
  };
  partnerEvent: GatePartnerEvent | null;
  mapping: readonly GateMappingInput[];
}): GateMappingCheck {
  const problems: GateMappingProblem[] = [];
  const warnings: GateMappingWarning[] = [];
  const products: GateMappingCheck["products"] = [];
  const partner = input.partnerEvent;
  if (!partner) {
    return {
      problems: [{ code: "partner_event_missing" }],
      warnings,
      products,
    };
  }
  const currency = input.abonten.currency.toUpperCase();
  if (partner.currency.toUpperCase() !== currency) {
    problems.push({
      code: "currency",
      partner: partner.currency.toUpperCase(),
      abonten: currency,
    });
  }

  const typeById = new Map(input.abonten.ticketTypes.map((t) => [t.id, t]));
  const productById = new Map(partner.products.map((p) => [p.id, p]));
  const seenTypes = new Set<string>();
  const seenProducts = new Set<string>();

  for (const entry of input.mapping) {
    const type = typeById.get(entry.ticketTypeId);
    if (!type) {
      problems.push({
        code: "unknown_ticket_type",
        ticketTypeId: entry.ticketTypeId,
      });
      continue;
    }
    if (seenTypes.has(entry.ticketTypeId)) {
      problems.push({
        code: "duplicate_ticket_type",
        ticketTypeId: entry.ticketTypeId,
      });
      continue;
    }
    seenTypes.add(entry.ticketTypeId);
    if (seenProducts.has(entry.partnerProductId)) {
      problems.push({
        code: "duplicate_product",
        partnerProductId: entry.partnerProductId,
      });
      continue;
    }
    seenProducts.add(entry.partnerProductId);

    const product = productById.get(entry.partnerProductId);
    if (!product) {
      problems.push({
        code: "product_missing",
        ticketTypeId: entry.ticketTypeId,
        partnerProductId: entry.partnerProductId,
      });
      continue;
    }
    if (product.type.toUpperCase() !== "TICKET") {
      problems.push({
        code: "not_a_ticket",
        ticketTypeId: entry.ticketTypeId,
        partnerProductId: entry.partnerProductId,
      });
      continue;
    }
    const ours = tryFromMajor(type.price ?? Number.NaN, currency);
    const theirs = tryFromMajor(product.price, currency);
    if (!ours || !theirs || ours.amountMinor !== theirs.amountMinor) {
      problems.push({
        code: "price",
        ticketTypeId: entry.ticketTypeId,
        partnerProductId: entry.partnerProductId,
        abontenMinor: ours?.amountMinor ?? -1,
        partnerMinor: theirs?.amountMinor ?? -1,
      });
      continue;
    }
    products.push({
      ticketTypeId: entry.ticketTypeId,
      partnerProductId: product.id,
      partnerProductName: product.name,
      partnerPrice: product.price,
    });
  }

  for (const type of input.abonten.ticketTypes) {
    if (!seenTypes.has(type.id)) {
      problems.push({ code: "unmapped", ticketTypeId: type.id });
    }
  }
  for (const product of partner.products) {
    if (
      product.type.toUpperCase() === "TICKET" &&
      !seenProducts.has(product.id)
    ) {
      warnings.push({
        code: "unmapped_partner_ticket",
        partnerProductId: product.id,
      });
    }
  }
  if (partner.startDate && input.abonten.startsAt) {
    const gap = Math.abs(
      new Date(partner.startDate).getTime() -
        new Date(input.abonten.startsAt).getTime(),
    );
    if (!Number.isFinite(gap) || gap > DAY_MS) {
      warnings.push({
        code: "date",
        partnerStart: partner.startDate,
        abontenStart: input.abonten.startsAt,
      });
    }
  }
  return { problems, warnings, products: problems.length ? [] : products };
}

// --- Keys --------------------------------------------------------------------

export type GateKeyMode = "live" | "sandbox" | "unknown" | "missing";

/** Live or sandbox, from the key's own prefix (pk_live_ / pk_sandbox_). */
export function gateKeyMode(value: string | null | undefined): GateKeyMode {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") return "missing";
  if (trimmed.startsWith("pk_live_")) return "live";
  if (trimmed.startsWith("pk_sandbox_")) return "sandbox";
  return "unknown";
}

export type GateKeyProblem =
  | "missing"
  | "unknown"
  | "live_off_production"
  | "sandbox_with_live_payments"
  | "live_with_test_payments";

/**
 * Why this key must not be used here, or null. A sale paid with real money
 * registers a real ticket: a live key goes with live payments, a sandbox
 * key with test payments, and a live key never sits on a preview or
 * development deployment (it would register test sales at a real gate).
 */
export function gateKeyModeProblem(
  mode: GateKeyMode,
  context: {
    paymentsMode: "test" | "live" | null;
    deploymentEnv: string | null;
  },
): GateKeyProblem | null {
  if (mode === "missing") return "missing";
  if (mode === "unknown") return "unknown";
  if (
    context.deploymentEnv &&
    context.deploymentEnv !== "production" &&
    mode === "live"
  ) {
    return "live_off_production";
  }
  if (context.paymentsMode === "live" && mode === "sandbox") {
    return "sandbox_with_live_payments";
  }
  if (context.paymentsMode === "test" && mode === "live") {
    return "live_with_test_payments";
  }
  return null;
}

export type GateEnvField = "apiKey" | "webhookSecret";

const GATE_ENV_FAMILIES: Record<
  GatePartnerProvider,
  Record<GateEnvField, RegExp>
> = {
  hapniin: {
    apiKey: /^HAPNIIN_API_KEY(?:_[A-Z0-9]{1,30})?$/,
    webhookSecret: /^HAPNIIN_WEBHOOK_SECRET(?:_[A-Z0-9]{1,30})?$/,
  },
};

/**
 * A link stores env variable NAMES; only the provider's own family is
 * accepted, so a name can never point a partner request at another server
 * secret (the same rule as market_payment_provider's names). The SQL check
 * gate_partner_link_env_names says the same.
 */
export function isGateEnvName(
  provider: GatePartnerProvider,
  field: GateEnvField,
  name: string,
): boolean {
  return GATE_ENV_FAMILIES[provider][field].test(name);
}

// --- Sending -----------------------------------------------------------------

/**
 * The Idempotency-Key a push sends: derived from the checkout line, so a
 * retry (a timeout, a server that died mid-request, a redelivered payment
 * webhook) is the same request and the partner replays its first answer
 * instead of registering the sale twice. `generation` moves only when staff
 * retry a sale the partner definitely refused. The database stores the same
 * value (gate_partner_push.idempotency_key, a generated column).
 */
export function gatePushIdempotencyKey(
  checkoutId: string,
  generation = 1,
): string {
  return `abn-${checkoutId.replace(/-/g, "").toLowerCase()}-g${generation}`;
}

/** Minutes to wait after the nth failed attempt (1-based), capped at 6 h. */
const BACKOFF_MINUTES = [1, 2, 5, 10, 20, 30, 60, 120, 240, 360];

export function gatePushBackoffMs(
  attempts: number,
  retryAfterSeconds?: number | null,
): number {
  const index = Math.min(
    Math.max(1, Math.floor(attempts)) - 1,
    BACKOFF_MINUTES.length - 1,
  );
  const base = BACKOFF_MINUTES[index] * 60_000;
  const asked =
    retryAfterSeconds && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 0;
  return Math.max(base, asked);
}

/** Failed attempts after which staff are alerted (an incident is opened). */
export const GATE_PUSH_ALERT_AFTER = 5;

/**
 * The partner wants a first and a last name. Abonten keeps one name field:
 * the first word is the first name, the rest the last name; a one-word name
 * is used for both (never an invented placeholder).
 */
export function splitBuyerName(full: string | null | undefined): {
  firstName: string;
  lastName: string;
} | null {
  const words = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const [first, ...rest] = words;
  return {
    firstName: first.slice(0, 100),
    lastName: (rest.length ? rest.join(" ") : first).slice(0, 100),
  };
}

/** Partner codes are matched as the partner's scanner reads them. */
export function normalizePartnerCode(code: string): string {
  return code.trim().toUpperCase();
}
