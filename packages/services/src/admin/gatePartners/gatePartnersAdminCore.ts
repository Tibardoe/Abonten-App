// Admin › Gate partners (docs/architecture/gate-partner-connectors.md,
// handbook docs/admin/gate-partners.md): staff link an event to a partner's
// event and products, watch the sales registered with the partner, retry
// the stuck ones and record codes as voided. Every change needs
// gatepartners.manage (step-up is checked by the transport) and is audited.
// Nothing here moves money.

import {
  GATE_EVENT_PROBLEM_TEXT,
  GATE_KEY_PROBLEM_TEXT,
  gateEnvNameText,
  gateMappingProblemText,
  gateMappingWarningText,
} from "@abonten/core/admin/gatePartnerText";
import {
  GATE_PARTNERS_FLAG,
  type GateEventProblem,
  type GateMappingInput,
  type GatePartnerEvent,
  checkGateMapping,
  isGateEnvName,
  isGatePartnerProvider,
} from "@abonten/core/gatePartners/gateLinkRules";
import { logger } from "@abonten/core/logger";
import { formatMoney } from "@abonten/core/money/formatMoney";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { Json } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { GatePartnerLinkInput } from "@abonten/validation/gatePartnerSchemas";
import { isFeatureEnabled } from "../../flags/featureFlagCore";
import type { GatePartnerAdapter } from "../../gatePartners/adapter";
import {
  gateApiKeyFor,
  gatePartnerAdapter,
  isGatePartnersKillSwitchOn,
} from "../../gatePartners/gatePartnerConfig";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

type RequestMeta = Record<string, unknown> | undefined;
type Deps = { adapterFor?: (provider: string) => GatePartnerAdapter };

const denied = <T>(e: unknown): AdminEnvelope<T> =>
  adminError(e) as AdminEnvelope<T>;

export type GatePartnerLinkRow = {
  eventId: string;
  eventTitle: string;
  eventStartsAt: string | null;
  provider: string;
  partnerEventId: string;
  partnerEventTitle: string | null;
  status: string;
  keyMode: string;
  checkedAt: string;
  checkProblems: string[];
  pushes: Record<string, number>;
  toVoid: number;
};

export type GatePartnerPushRow = {
  id: string;
  status: string;
  createdAt: string;
  attempts: number;
  nextAttemptAt: string;
  ticketType: string;
  quantity: number | null;
  partnerProductId: string | null;
  partnerOrderId: string | null;
  partnerConfirmedAt: string | null;
  idempotencyKey: string | null;
  generation: number;
  lastErrorCode: string | null;
  lastErrorDetail: string | null;
  lastHttpStatus: number | null;
  buyerId: string;
};

export type GatePartnerEventDetail = {
  event: {
    id: string;
    title: string;
    status: string;
    startsAt: string | null;
    organizerId: string;
    currency: string | null;
    ticketTypes: { id: string; type: string; price: number }[];
  };
  flagOn: boolean;
  killSwitch: boolean;
  problems: { code: string; text: string }[];
  link: {
    provider: string;
    partnerEventId: string;
    partnerEventTitle: string | null;
    apiKeyEnv: string;
    webhookSecretEnv: string | null;
    keyMode: string;
    keyUsable: string | null;
    status: string;
    checkedAt: string;
    checkProblems: string[];
    products: {
      ticketTypeId: string;
      partnerProductId: string;
      partnerProductName: string | null;
      partnerPrice: number;
    }[];
  } | null;
  pushes: GatePartnerPushRow[];
  toVoid: {
    ticketId: string;
    code: string;
    requestedAt: string;
    notified: boolean;
  }[];
  voided: number;
};

export async function listGatePartnerLinksAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<
  AdminEnvelope<{ links: GatePartnerLinkRow[]; killSwitch: boolean }>
> {
  try {
    assertPermission(ctx, "gatepartners.view");
  } catch (e) {
    return denied(e);
  }
  const { data: links, error } = await supabase
    .from("gate_partner_link")
    .select(
      "event_id, provider, partner_event_id, partner_event_title, status, key_mode, checked_at, check_problems, event:event_id(title, starts_at)",
    )
    .neq("status", "ended")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    logger.error(`listGatePartnerLinksAdminCore: ${error.message}`);
    return { status: 500, message: "Couldn't load the links." };
  }
  const eventIds = (links ?? []).map((l) => l.event_id);
  const [pushes, voids] = await Promise.all([
    eventIds.length
      ? supabase
          .from("gate_partner_push")
          .select("event_id, status")
          .in("event_id", eventIds)
      : Promise.resolve({ data: [], error: null }),
    eventIds.length
      ? supabase
          .from("gate_partner_ticket")
          .select("event_id")
          .in("event_id", eventIds)
          .eq("state", "to_void")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const pushCounts = new Map<string, Record<string, number>>();
  for (const p of pushes.data ?? []) {
    const counts = pushCounts.get(p.event_id) ?? {};
    counts[p.status] = (counts[p.status] ?? 0) + 1;
    pushCounts.set(p.event_id, counts);
  }
  const voidCounts = new Map<string, number>();
  for (const v of voids.data ?? []) {
    voidCounts.set(v.event_id, (voidCounts.get(v.event_id) ?? 0) + 1);
  }
  return {
    status: 200,
    data: {
      killSwitch: isGatePartnersKillSwitchOn(),
      links: (links ?? []).map((l) => {
        const event = l.event as { title?: string; starts_at?: string } | null;
        return {
          eventId: l.event_id,
          eventTitle: event?.title ?? "",
          eventStartsAt: event?.starts_at ?? null,
          provider: l.provider,
          partnerEventId: l.partner_event_id,
          partnerEventTitle: l.partner_event_title,
          status: l.status,
          keyMode: l.key_mode,
          checkedAt: l.checked_at,
          checkProblems: Array.isArray(l.check_problems)
            ? (l.check_problems as string[])
            : [],
          pushes: pushCounts.get(l.event_id) ?? {},
          toVoid: voidCounts.get(l.event_id) ?? 0,
        };
      }),
    },
  };
}

/** Pushes that need a person, across every link (the queue page). */
export async function listStuckGatePartnerPushesAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<AdminEnvelope<(GatePartnerPushRow & { eventId: string })[]>> {
  try {
    assertPermission(ctx, "gatepartners.view");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase
    .from("gate_partner_push")
    .select(PUSH_SELECT)
    .or("status.eq.failed,attempts.gte.3")
    .in("status", ["failed", "queued", "ordered", "sending"])
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    logger.error(`listStuckGatePartnerPushesAdminCore: ${error.message}`);
    return { status: 500, message: "Couldn't load the stuck sales." };
  }
  return {
    status: 200,
    data: (data ?? []).map((p) => ({ ...mapPush(p), eventId: p.event_id })),
  };
}

const PUSH_SELECT =
  "id, event_id, status, created_at, attempts, next_attempt_at, request_quantity, partner_product_id, partner_order_id, partner_confirmed_at, idempotency_key, generation, last_error_code, last_error_detail, last_http_status, user_id, ticket_type:ticket_type_id(type)";

type PushSelectRow = {
  id: string;
  event_id: string;
  status: string;
  created_at: string;
  attempts: number;
  next_attempt_at: string;
  request_quantity: number | null;
  partner_product_id: string | null;
  partner_order_id: string | null;
  partner_confirmed_at: string | null;
  idempotency_key: string | null;
  generation: number;
  last_error_code: string | null;
  last_error_detail: string | null;
  last_http_status: number | null;
  user_id: string;
  ticket_type: unknown;
};

function mapPush(p: PushSelectRow): GatePartnerPushRow {
  return {
    id: p.id,
    status: p.status,
    createdAt: p.created_at,
    attempts: p.attempts,
    nextAttemptAt: p.next_attempt_at,
    ticketType: (p.ticket_type as { type?: string } | null)?.type ?? "",
    quantity: p.request_quantity,
    partnerProductId: p.partner_product_id,
    partnerOrderId: p.partner_order_id,
    partnerConfirmedAt: p.partner_confirmed_at,
    idempotencyKey: p.idempotency_key,
    generation: p.generation,
    lastErrorCode: p.last_error_code,
    lastErrorDetail: p.last_error_detail,
    lastHttpStatus: p.last_http_status,
    buyerId: p.user_id,
  };
}

async function eventProblems(
  supabase: ServiceRoleClient,
  eventId: string,
): Promise<GateEventProblem[] | null> {
  const { data, error } = await supabase.rpc("gate_partner_event_problems", {
    p_event_id: eventId,
  });
  if (error) {
    logger.error(`gate_partner_event_problems: ${error.message}`);
    return null;
  }
  return (data ?? []) as GateEventProblem[];
}

export async function getGatePartnerEventAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  eventId: string,
): Promise<AdminEnvelope<GatePartnerEventDetail>> {
  try {
    assertPermission(ctx, "gatepartners.view");
  } catch (e) {
    return denied(e);
  }
  const { data: event, error } = await supabase
    .from("event")
    .select(
      "id, title, status, starts_at, organizer_id, currency, ticket_type(id, type, price, currency)",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    logger.error(`getGatePartnerEventAdminCore: ${error.message}`);
    return { status: 500, message: "Couldn't load the event." };
  }
  if (!event) return { status: 404, message: "Event not found." };

  const [{ data: link }, problems, flagOn] = await Promise.all([
    supabase
      .from("gate_partner_link")
      .select("*")
      .eq("event_id", eventId)
      .maybeSingle(),
    eventProblems(supabase, eventId),
    isFeatureEnabled(GATE_PARTNERS_FLAG, {
      subjectId: event.organizer_id as string,
    }),
  ]);

  let products: NonNullable<GatePartnerEventDetail["link"]>["products"] = [];
  let pushes: GatePartnerPushRow[] = [];
  let toVoid: GatePartnerEventDetail["toVoid"] = [];
  let voided = 0;
  if (link) {
    const [p, pu, tk] = await Promise.all([
      supabase.from("gate_partner_product").select("*").eq("link_id", link.id),
      supabase
        .from("gate_partner_push")
        .select(PUSH_SELECT)
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("gate_partner_ticket")
        .select(
          "ticket_id, partner_code, state, void_requested_at, organizer_notified_at",
        )
        .eq("event_id", eventId)
        .in("state", ["to_void", "voided"]),
    ]);
    products = (p.data ?? []).map((row) => ({
      ticketTypeId: row.ticket_type_id,
      partnerProductId: row.partner_product_id,
      partnerProductName: row.partner_product_name,
      partnerPrice: Number(row.partner_price),
    }));
    pushes = ((pu.data ?? []) as PushSelectRow[]).map(mapPush);
    toVoid = (tk.data ?? [])
      .filter((t) => t.state === "to_void")
      .map((t) => ({
        ticketId: t.ticket_id,
        code: t.partner_code,
        requestedAt: t.void_requested_at as string,
        notified: t.organizer_notified_at !== null,
      }));
    voided = (tk.data ?? []).filter((t) => t.state === "voided").length;
  }

  const key = link ? gateApiKeyFor(link) : null;
  const types = (event.ticket_type ?? []) as {
    id: string;
    type: string;
    price: number | null;
    currency: string | null;
  }[];

  return {
    status: 200,
    data: {
      event: {
        id: event.id,
        title: event.title ?? "",
        status: event.status ?? "",
        startsAt: event.starts_at,
        organizerId: event.organizer_id as string,
        currency:
          (event.currency as string | null) ?? types[0]?.currency ?? null,
        ticketTypes: types.map((t) => ({
          id: t.id,
          type: t.type,
          price: Number(t.price ?? 0),
        })),
      },
      flagOn,
      killSwitch: isGatePartnersKillSwitchOn(),
      problems: (problems ?? []).map((code) => ({
        code,
        text: GATE_EVENT_PROBLEM_TEXT[code] ?? code,
      })),
      link: link
        ? {
            provider: link.provider,
            partnerEventId: link.partner_event_id,
            partnerEventTitle: link.partner_event_title,
            apiKeyEnv: link.api_key_env,
            webhookSecretEnv: link.webhook_secret_env,
            keyMode: link.key_mode,
            keyUsable:
              key && !key.ok
                ? key.problem === "name"
                  ? "The API key variable name is not a Hapniin one."
                  : GATE_KEY_PROBLEM_TEXT[key.problem]
                : null,
            status: link.status,
            checkedAt: link.checked_at,
            checkProblems: Array.isArray(link.check_problems)
              ? (link.check_problems as string[])
              : [],
            products,
          }
        : null,
      pushes,
      toVoid,
      voided,
    },
  };
}

async function partnerCatalog(
  provider: string,
  apiKeyEnv: string,
  deps: Deps,
): Promise<
  | { ok: true; events: GatePartnerEvent[]; keyMode: "live" | "sandbox" }
  | { ok: false; message: string }
> {
  if (!isGatePartnerProvider(provider)) {
    return { ok: false, message: "Unknown partner." };
  }
  if (!isGateEnvName(provider, "apiKey", apiKeyEnv)) {
    return {
      ok: false,
      message: gateEnvNameText(provider, "apiKey", apiKeyEnv),
    };
  }
  const key = gateApiKeyFor({ provider, api_key_env: apiKeyEnv });
  if (!key.ok) {
    return {
      ok: false,
      message:
        key.problem === "name"
          ? gateEnvNameText(provider, "apiKey", apiKeyEnv)
          : GATE_KEY_PROBLEM_TEXT[key.problem],
    };
  }
  const adapter = (deps.adapterFor ?? gatePartnerAdapter)(provider);
  const res = await adapter.listEvents(key.key);
  if (!res.ok) {
    return {
      ok: false,
      message: `The partner did not list its events (${res.error.code}${res.error.httpStatus ? ` ${res.error.httpStatus}` : ""}): ${res.error.detail}`,
    };
  }
  return {
    ok: true,
    events: res.data,
    keyMode: key.key.startsWith("pk_live_") ? "live" : "sandbox",
  };
}

/** The partner's live events and products, to choose from when linking. */
export async function previewGatePartnerCatalogAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { eventId: string; provider: string; apiKeyEnv: string },
  deps: Deps = {},
): Promise<AdminEnvelope<{ events: GatePartnerEvent[]; keyMode: string }>> {
  try {
    assertPermission(ctx, "gatepartners.manage");
  } catch (e) {
    return denied(e);
  }
  const catalog = await partnerCatalog(input.provider, input.apiKeyEnv, deps);
  if (!catalog.ok) return { status: 409, message: catalog.message };
  return {
    status: 200,
    data: { events: catalog.events, keyMode: catalog.keyMode },
  };
}

function mappingTexts(
  check: ReturnType<typeof checkGateMapping>,
  types: { id: string; type: string }[],
  currency: string,
) {
  const name = (id: string) => types.find((t) => t.id === id)?.type ?? id;
  const money = (minor: number) =>
    minor < 0
      ? "an unreadable price"
      : formatMoney({ amountMinor: minor, currency }, { locale: "en" });
  return {
    problems: check.problems.map((p) => gateMappingProblemText(p, name, money)),
    warnings: check.warnings.map(gateMappingWarningText),
  };
}

export async function linkGatePartnerEventAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: GatePartnerLinkInput,
  requestMeta?: RequestMeta,
  deps: Deps = {},
): Promise<AdminEnvelope<{ warnings: string[] }>> {
  try {
    assertPermission(ctx, "gatepartners.manage");
  } catch (e) {
    return denied(e);
  }
  if (
    input.webhookSecretEnv &&
    !isGateEnvName(input.provider, "webhookSecret", input.webhookSecretEnv)
  ) {
    return {
      status: 400,
      message: gateEnvNameText(
        input.provider,
        "webhookSecret",
        input.webhookSecretEnv,
      ),
    };
  }

  const { data: event, error } = await supabase
    .from("event")
    .select(
      "id, title, starts_at, organizer_id, ticket_type(id, type, price, currency)",
    )
    .eq("id", input.eventId)
    .maybeSingle();
  if (error) {
    logger.error(`linkGatePartnerEventAdminCore: ${error.message}`);
    return { status: 500, message: "Couldn't load the event." };
  }
  if (!event) return { status: 404, message: "Event not found." };

  if (
    !(await isFeatureEnabled(GATE_PARTNERS_FLAG, {
      subjectId: event.organizer_id as string,
    }))
  ) {
    return {
      status: 403,
      message: `The ${GATE_PARTNERS_FLAG} feature flag is off for this organizer. Add their account or team id to allowSubjects in Admin › Markets › Feature flags first.`,
    };
  }

  const problems = await eventProblems(supabase, input.eventId);
  if (problems === null) {
    return { status: 500, message: "Couldn't check the event." };
  }
  if (problems.length > 0) {
    return {
      status: 409,
      message: `This event cannot be linked: ${problems
        .map((p) => GATE_EVENT_PROBLEM_TEXT[p] ?? p)
        .join(" ")}`,
    };
  }

  const types = (event.ticket_type ?? []) as {
    id: string;
    type: string;
    price: number | null;
    currency: string | null;
  }[];
  const currency = (types[0]?.currency ?? "").toUpperCase();
  if (
    !currency ||
    types.some((t) => (t.currency ?? "").toUpperCase() !== currency)
  ) {
    return {
      status: 409,
      message: "The event's ticket types are not all in one currency.",
    };
  }

  const catalog = await partnerCatalog(input.provider, input.apiKeyEnv, deps);
  if (!catalog.ok) return { status: 409, message: catalog.message };
  const partnerEvent =
    catalog.events.find((e) => e.id === input.partnerEventId) ?? null;
  const check = checkGateMapping({
    abonten: {
      currency,
      startsAt: event.starts_at,
      ticketTypes: types.map((t) => ({ id: t.id, price: t.price })),
    },
    partnerEvent,
    mapping: input.mapping as GateMappingInput[],
  });
  const texts = mappingTexts(check, types, currency);
  if (check.problems.length > 0) {
    return {
      status: 409,
      message: `Not linked: ${texts.problems.join(" ")}`,
    };
  }

  const { error: linkError } = await supabase.rpc("gate_partner_link_set", {
    p_event_id: input.eventId,
    p_provider: input.provider,
    p_partner_event_id: input.partnerEventId,
    p_partner_event_title: partnerEvent?.title ?? null,
    p_api_key_env: input.apiKeyEnv,
    p_webhook_secret_env: input.webhookSecretEnv ?? null,
    p_key_mode: catalog.keyMode,
    p_currency: currency,
    p_products: check.products.map((p) => ({
      ticket_type_id: p.ticketTypeId,
      partner_product_id: p.partnerProductId,
      partner_product_name: p.partnerProductName,
      partner_price: p.partnerPrice,
    })) as unknown as Json,
    p_check_problems: texts.warnings as unknown as Json,
    p_staff_id: ctx.userId,
  } as never);
  if (linkError) {
    logger.error(`gate_partner_link_set: ${linkError.message}`);
    return { status: 409, message: linkError.message };
  }

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "gatepartners.link",
    targetType: "event",
    targetId: input.eventId,
    summary: `Linked "${event.title}" to ${input.provider} event ${input.partnerEventId} (${catalog.keyMode} key ${input.apiKeyEnv})`,
    reason: input.reason,
    after: {
      provider: input.provider,
      partnerEventId: input.partnerEventId,
      apiKeyEnv: input.apiKeyEnv,
      webhookSecretEnv: input.webhookSecretEnv,
      keyMode: catalog.keyMode,
      products: check.products,
    },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return {
    status: 200,
    message: "Linked.",
    data: { warnings: texts.warnings },
  };
}

/** Pause (no new sales; registrations continue) or resume a link. */
export async function setGatePartnerLinkStatusAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { eventId: string; status: "active" | "paused"; reason: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "gatepartners.manage");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase
    .from("gate_partner_link")
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq("event_id", input.eventId)
    .in("status", ["active", "paused"])
    .neq("status", input.status)
    .select("id")
    .maybeSingle();
  if (error) {
    logger.error(`setGatePartnerLinkStatusAdminCore: ${error.message}`);
    return { status: 500, message: "Couldn't change the link." };
  }
  if (!data) return { status: 409, message: "Nothing to change." };
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action:
      input.status === "paused" ? "gatepartners.pause" : "gatepartners.resume",
    targetType: "event",
    targetId: input.eventId,
    summary:
      input.status === "paused"
        ? "Paused sales of a gate-partner event"
        : "Resumed sales of a gate-partner event",
    reason: input.reason,
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return {
    status: 200,
    message: input.status === "paused" ? "Sales paused." : "Sales resumed.",
  };
}

/** Ends a link: only before the first sale (gate_partner_link_end). */
export async function endGatePartnerLinkAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { eventId: string; reason: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "gatepartners.manage");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase.rpc("gate_partner_link_end", {
    p_event_id: input.eventId,
  });
  if (error) return { status: 409, message: error.message };
  if (!data) return { status: 409, message: "This event is not linked." };
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "gatepartners.unlink",
    targetType: "event",
    targetId: input.eventId,
    summary: "Ended a gate-partner link before any sale",
    reason: input.reason,
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Link ended." };
}

/**
 * Compares the stored products with the partner's catalog again (its prices
 * can change). Records what it found; staff pause the link if it differs.
 */
export async function recheckGatePartnerLinkAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { eventId: string },
  deps: Deps = {},
): Promise<AdminEnvelope<{ problems: string[]; warnings: string[] }>> {
  try {
    assertPermission(ctx, "gatepartners.manage");
  } catch (e) {
    return denied(e);
  }
  const { data: link } = await supabase
    .from("gate_partner_link")
    .select("*, event:event_id(starts_at)")
    .eq("event_id", input.eventId)
    .in("status", ["active", "paused"])
    .maybeSingle();
  if (!link) return { status: 404, message: "This event is not linked." };
  const [{ data: products }, { data: types }] = await Promise.all([
    supabase.from("gate_partner_product").select("*").eq("link_id", link.id),
    supabase
      .from("ticket_type")
      .select("id, type, price")
      .eq("event_id", input.eventId),
  ]);
  const catalog = await partnerCatalog(link.provider, link.api_key_env, deps);
  if (!catalog.ok) return { status: 409, message: catalog.message };
  const check = checkGateMapping({
    abonten: {
      currency: link.currency,
      startsAt:
        (link.event as { starts_at?: string | null } | null)?.starts_at ?? null,
      ticketTypes: (types ?? []).map((t) => ({ id: t.id, price: t.price })),
    },
    partnerEvent:
      catalog.events.find((e) => e.id === link.partner_event_id) ?? null,
    mapping: (products ?? []).map((p) => ({
      ticketTypeId: p.ticket_type_id,
      partnerProductId: p.partner_product_id,
    })),
  });
  const texts = mappingTexts(
    check,
    (types ?? []).map((t) => ({ id: t.id, type: t.type ?? "" })),
    link.currency,
  );
  const all = [...texts.problems, ...texts.warnings];
  await supabase
    .from("gate_partner_link")
    .update({
      check_problems: all as unknown as Json,
      checked_at: new Date().toISOString(),
    })
    .eq("id", link.id);
  return {
    status: 200,
    message: texts.problems.length
      ? "The partner's catalog no longer matches. Pause sales until it is fixed."
      : "The partner's catalog matches.",
    data: texts,
  };
}

/**
 * Sends a stuck sale again. A sale the partner definitely refused (nothing
 * was created) gets a new idempotency key; anything else keeps its key, so
 * the partner replays the first order instead of making a second.
 */
export async function retryGatePartnerPushAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { pushId: string; reason: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "gatepartners.manage");
  } catch (e) {
    return denied(e);
  }
  const { data: push, error } = await supabase
    .from("gate_partner_push")
    .select("*")
    .eq("id", input.pushId)
    .maybeSingle();
  if (error) {
    logger.error(`retryGatePartnerPushAdminCore: ${error.message}`);
    return { status: 500, message: "Couldn't load the sale." };
  }
  if (!push) return { status: 404, message: "Sale not found." };
  if (push.status === "done" || push.status === "cancelled") {
    return { status: 409, message: "This sale needs nothing more." };
  }
  if (push.status === "sending") {
    return { status: 409, message: "It is being sent right now." };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    next_attempt_at: now,
    updated_at: now,
    incident_opened_at: null,
  };
  let newKey = false;
  if (push.status === "failed") {
    if (!push.partner_order_id) {
      // Nothing exists on the partner's side: a fresh request.
      patch.status = "queued";
      patch.attempts = 0;
      if (push.last_error_code && push.last_error_code !== "NOT_MAPPED") {
        patch.generation = push.generation + 1;
        newKey = true;
      }
      if (!push.partner_product_id) {
        const { data: product } = await supabase
          .from("gate_partner_product")
          .select("partner_product_id")
          .eq("link_id", push.link_id)
          .eq("ticket_type_id", push.ticket_type_id)
          .maybeSingle();
        if (!product) {
          return {
            status: 409,
            message: "This ticket type still has no partner product.",
          };
        }
        patch.partner_product_id = product.partner_product_id;
      }
    } else {
      patch.status = "ordered";
      patch.attempts = 0;
    }
  }
  const { data: moved, error: moveError } = await supabase
    .from("gate_partner_push")
    .update(patch as never)
    .eq("id", push.id)
    .eq("status", push.status)
    .select("id")
    .maybeSingle();
  if (moveError) {
    logger.error(`retryGatePartnerPushAdminCore update: ${moveError.message}`);
    return { status: 500, message: "Couldn't queue it." };
  }
  if (!moved) {
    return { status: 409, message: "It changed meanwhile. Reload." };
  }
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "gatepartners.push.retry",
    targetType: "gate_partner_push",
    targetId: push.id,
    summary: newKey
      ? `Retried a refused gate-partner sale with a new idempotency key (generation ${push.generation + 1})`
      : "Retried a gate-partner sale",
    reason: input.reason,
    before: {
      status: push.status,
      generation: push.generation,
      lastErrorCode: push.last_error_code,
    },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return {
    status: 200,
    message: "Queued. The gate-partners job sends it within a minute.",
  };
}

/** Records codes as voided in the partner's system (staff did it, or saw it). */
export async function markGatePartnerVoidedAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { eventId: string; ticketIds: string[]; reason: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ voided: number }>> {
  try {
    assertPermission(ctx, "gatepartners.manage");
  } catch (e) {
    return denied(e);
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("gate_partner_ticket")
    .update({
      state: "voided",
      voided_at: now,
      voided_by: ctx.userId,
      voided_by_kind: "staff",
      updated_at: now,
    })
    .eq("event_id", input.eventId)
    .eq("state", "to_void")
    .in("ticket_id", input.ticketIds)
    .select("ticket_id, partner_code");
  if (error) {
    logger.error(`markGatePartnerVoidedAdminCore: ${error.message}`);
    return { status: 500, message: "Couldn't record it." };
  }
  const rows = data ?? [];
  if (rows.length > 0) {
    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: "gatepartners.voided",
      targetType: "event",
      targetId: input.eventId,
      summary: `Recorded ${rows.length} partner code(s) as voided`,
      reason: input.reason,
      after: { codes: rows.map((r) => r.partner_code) },
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });
  }
  return {
    status: 200,
    message: `${rows.length} recorded as voided.`,
    data: { voided: rows.length },
  };
}
