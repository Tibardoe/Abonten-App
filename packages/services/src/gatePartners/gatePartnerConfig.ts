// Gate partner links: reading a link, its key, and the switches
// (docs/architecture/gate-partner-connectors.md).
//
// A link stores the NAMES of the env variables that hold the partner API
// key and webhook secret; the values are read here, on the server, and
// never stored, logged or returned. GATE_PARTNERS_KILL_SWITCH=true on the
// web deployment stops new sales of linked events and holds the pushes.

import {
  type GateKeyProblem,
  type GatePartnerProvider,
  gateKeyMode,
  gateKeyModeProblem,
  isGateEnvName,
  isGatePartnerProvider,
} from "@abonten/core/gatePartners/gateLinkRules";
import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import { tr } from "../i18n/requestLocale";
import { declaredPaymentsMode } from "../payments/providers/keyMode";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import type { GatePartnerAdapter } from "./adapter";
import { createHapniinAdapter } from "./hapniinAdapter";

export type GateLinkRow =
  Database["public"]["Tables"]["gate_partner_link"]["Row"];
export type GateProductRow =
  Database["public"]["Tables"]["gate_partner_product"]["Row"];
export type GatePushRow =
  Database["public"]["Tables"]["gate_partner_push"]["Row"];

export function isGatePartnersKillSwitchOn(): boolean {
  return process.env.GATE_PARTNERS_KILL_SWITCH === "true";
}

const ADAPTERS: Record<GatePartnerProvider, () => GatePartnerAdapter> = {
  hapniin: () => createHapniinAdapter(),
};

export function gatePartnerAdapter(provider: string): GatePartnerAdapter {
  if (!isGatePartnerProvider(provider)) {
    throw new Error(`Unknown gate partner: ${provider}`);
  }
  return ADAPTERS[provider]();
}

/** A link's API key, or why it cannot be used on this deployment. */
export function gateApiKeyFor(
  link: Pick<GateLinkRow, "provider" | "api_key_env">,
  env: Record<string, string | undefined> = process.env,
): { ok: true; key: string } | { ok: false; problem: GateKeyProblem | "name" } {
  if (
    !isGatePartnerProvider(link.provider) ||
    !isGateEnvName(link.provider, "apiKey", link.api_key_env)
  ) {
    return { ok: false, problem: "name" };
  }
  const value = env[link.api_key_env]?.trim() ?? "";
  const problem = gateKeyModeProblem(gateKeyMode(value), {
    paymentsMode: declaredPaymentsMode(env),
    deploymentEnv: env.VERCEL_ENV?.trim() || null,
  });
  return problem ? { ok: false, problem } : { ok: true, key: value };
}

/** The webhook secrets of a provider's links (each set variable once). */
export async function gateWebhookSecrets(
  provider: GatePartnerProvider,
  env: Record<string, string | undefined> = process.env,
): Promise<string[]> {
  const { data, error } = await getSupabaseServiceClient()
    .from("gate_partner_link")
    .select("webhook_secret_env")
    .eq("provider", provider)
    .neq("status", "ended")
    .not("webhook_secret_env", "is", null);
  if (error) {
    logger.error(`gateWebhookSecrets: ${error.message}`);
    return [];
  }
  const names = new Set(
    (data ?? [])
      .map((r) => r.webhook_secret_env as string)
      .filter((n) => isGateEnvName(provider, "webhookSecret", n)),
  );
  return [...names].map((n) => env[n]?.trim() ?? "").filter((v) => v !== "");
}

/**
 * The tables are not there yet: this code reached a deployment before its
 * migration (20261125120000). No event can be linked then, so every
 * checkout carries on as before instead of failing closed for everyone.
 */
function tableMissing(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    (/gate_partner_link/.test(error.message ?? "") &&
      /(does not exist|schema cache)/.test(error.message ?? ""))
  );
}

/**
 * The event's link while it is in force (active or paused), with its
 * products, or null. "error" when it could not be read: callers on the
 * money path refuse rather than sell without knowing.
 */
export async function readGateLink(
  eventId: string,
): Promise<{ link: GateLinkRow; products: GateProductRow[] } | null | "error"> {
  const db = getSupabaseServiceClient();
  const { data: link, error } = await db
    .from("gate_partner_link")
    .select("*")
    .eq("event_id", eventId)
    .in("status", ["active", "paused"])
    .maybeSingle();
  if (error) {
    if (tableMissing(error)) return null;
    logger.error(`readGateLink(${eventId}): ${error.message}`);
    return "error";
  }
  if (!link) return null;
  const { data: products, error: productError } = await db
    .from("gate_partner_product")
    .select("*")
    .eq("link_id", link.id);
  if (productError) {
    logger.error(`readGateLink products(${eventId}): ${productError.message}`);
    return "error";
  }
  return { link, products: products ?? [] };
}

/**
 * For an editor or a giveaway on a linked event: the refusal to answer
 * (its tickets must stay what the partner sells, and every ticket is a
 * partner sale), or null when the event is not linked. The database says
 * the same (gate_partner_refuse_while_linked, the checkout trigger).
 */
export async function gatePartnerLockRefusal(
  eventId: string,
  kind: "edit" | "give" | "register",
): Promise<{ status: 409 | 500; message: string } | null> {
  const linked = await eventHasGatePartner(eventId);
  if (linked === "error") {
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (!linked) return null;
  return {
    status: 409,
    message:
      kind === "edit"
        ? tr("gatePartnerTicketsLocked")
        : kind === "give"
          ? tr("gatePartnerNoComplimentary")
          : tr("gatePartnerSalesPaused"),
  };
}

/** Whether an event's gate is run by a partner (link active or paused). */
export async function eventHasGatePartner(
  eventId: string,
): Promise<boolean | "error"> {
  const { data, error } = await getSupabaseServiceClient()
    .from("gate_partner_link")
    .select("id")
    .eq("event_id", eventId)
    .in("status", ["active", "paused"])
    .maybeSingle();
  if (error) {
    if (tableMissing(error)) return false;
    logger.error(`eventHasGatePartner(${eventId}): ${error.message}`);
    return "error";
  }
  return data !== null;
}
