// A gate partner's webhook (docs/architecture/gate-partner-connectors.md
// §3.4). Hapniin sends order.completed when an order attributed to Abonten
// is paid (ours, or one from a deeplink). The signature is checked against
// the webhook secrets of Hapniin's live links; a valid delivery for one of
// our pushes marks the order confirmed and, if its codes are not stored
// yet, makes it due now so the sender fetches them. Answered fast (the
// partner gives up after 10 seconds); the sending happens after.

import {
  type GatePartnerProvider,
  isGatePartnerProvider,
} from "@abonten/core/gatePartners/gateLinkRules";
import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import type { GatePartnerAdapter, HeaderReader } from "./adapter";
import { gatePartnerAdapter, gateWebhookSecrets } from "./gatePartnerConfig";

export type GateWebhookResult = {
  /** HTTP status to answer the partner with. */
  status: 200 | 401 | 400 | 404 | 500;
  /** A push became due: the transport may start a short dispatch. */
  pushDue: boolean;
};

export async function handleGatePartnerWebhookCore(
  provider: string,
  rawBody: string,
  headers: HeaderReader,
  deps: {
    adapterFor?: (provider: string) => GatePartnerAdapter;
    secrets?: (provider: GatePartnerProvider) => Promise<string[]>;
  } = {},
): Promise<GateWebhookResult> {
  if (!isGatePartnerProvider(provider)) return { status: 404, pushDue: false };
  const secrets = await (deps.secrets ?? gateWebhookSecrets)(provider);
  if (secrets.length === 0) {
    logger.warn(`gate webhook ${provider}: no webhook secret configured`);
    return { status: 401, pushDue: false };
  }
  const adapter = (deps.adapterFor ?? gatePartnerAdapter)(provider);
  const check = adapter.verifyWebhook(rawBody, headers, secrets);
  if (!check.ok) {
    logger.warn(`gate webhook ${provider}: rejected (${check.reason})`);
    return {
      status: check.reason === "signature" ? 401 : 400,
      pushDue: false,
    };
  }

  const { type, orderId, orderShortId } = check.event;
  if (type !== "order.completed" || (!orderId && !orderShortId)) {
    // Reserved events (order.refunded, commission.*) and anything new:
    // acknowledged so the partner stops retrying.
    return { status: 200, pushDue: false };
  }

  const db = getSupabaseServiceClient();
  const ids = [orderId, orderShortId].filter((v): v is string => !!v);
  const { data: pushes, error } = await db
    .from("gate_partner_push")
    .select("id, status, partner_confirmed_at")
    .in("partner_order_id", ids);
  if (error) {
    logger.error(`gate webhook ${provider}: lookup failed (${error.message})`);
    return { status: 500, pushDue: false };
  }
  if (!pushes || pushes.length === 0) {
    // A sale from a deeplink or the widget, or one we have not recorded
    // yet (the POST's answer is still on its way): nothing to do.
    return { status: 200, pushDue: false };
  }

  let pushDue = false;
  const now = new Date().toISOString();
  for (const push of pushes) {
    const patch: Record<string, unknown> = { updated_at: now };
    if (!push.partner_confirmed_at) patch.partner_confirmed_at = now;
    if (push.status === "ordered") {
      patch.next_attempt_at = now;
      pushDue = true;
    }
    const { error: updateError } = await db
      .from("gate_partner_push")
      .update(patch as never)
      .eq("id", push.id);
    if (updateError) {
      logger.error(
        `gate webhook ${provider}: push ${push.id} not updated (${updateError.message})`,
      );
      return { status: 500, pushDue: false };
    }
  }
  return { status: 200, pushDue };
}
