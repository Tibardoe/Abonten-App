// The money-path check for an event whose gate is run by a partner
// (docs/architecture/gate-partner-connectors.md): Abonten charges exactly
// what the partner will record for the sale, or does not sell. Run by
// validateCheckoutCore after it priced the order itself, before anything is
// reserved; the database refuses the rest (a gift, a pass choice, a plan).

import type { PricedOrderLine } from "@abonten/core/checkoutPricing";
import { tryFromMajor } from "@abonten/core/money/money";
import { tr } from "../i18n/requestLocale";
import { isGatePartnersKillSwitchOn, readGateLink } from "./gatePartnerConfig";

export type GateSaleRefusal = { status: number; message: string };

export async function gatePartnerSaleProblem(input: {
  eventId: string;
  currency: string | null;
  lines: readonly Pick<
    PricedOrderLine,
    | "id"
    | "quantity"
    | "admits"
    | "unitPrice"
    | "discount"
    | "groupDiscountPercent"
    | "openAmount"
  >[];
  promoCode: string | null | undefined;
  occurrenceId: string | null | undefined;
}): Promise<GateSaleRefusal | null> {
  const read = await readGateLink(input.eventId);
  if (read === "error") {
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (!read) return null;
  const { link, products } = read;

  if (link.status !== "active" || isGatePartnersKillSwitchOn()) {
    return { status: 409, message: tr("gatePartnerSalesPaused") };
  }
  if (input.promoCode?.trim()) {
    return { status: 409, message: tr("gatePartnerNoPromoCodes") };
  }
  if (input.occurrenceId) {
    return { status: 409, message: tr("gatePartnerSalesPaused") };
  }

  const currency = (input.currency ?? link.currency).toUpperCase();
  const byType = new Map(products.map((p) => [p.ticket_type_id, p]));
  for (const line of input.lines) {
    if (line.quantity <= 0) continue;
    const product = byType.get(line.id);
    const ours = tryFromMajor(line.unitPrice, currency);
    const theirs = product
      ? tryFromMajor(Number(product.partner_price), currency)
      : null;
    if (
      !product ||
      currency !== link.currency.toUpperCase() ||
      line.openAmount ||
      line.admits !== 1 ||
      Number(line.discount ?? 0) !== 0 ||
      line.groupDiscountPercent != null ||
      !ours ||
      !theirs ||
      ours.amountMinor !== theirs.amountMinor
    ) {
      return { status: 409, message: tr("gatePartnerSalesPaused") };
    }
  }
  return null;
}
