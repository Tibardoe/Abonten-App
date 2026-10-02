import {
  PROMOTION_ESTIMATE_NOTE_KEY,
  PROMOTION_REVIEW_NOTE_KEY,
} from "@abonten/core/content/copy";
import { formatReachRange } from "@abonten/core/content/promotionEstimate";
import { formatMoney } from "@abonten/core/formatMoney";
import type { PlacePromotionSummaryProps } from "@abonten/types/placeType";
import type { EventPromotionSummaryProps } from "@abonten/types/postsType";
import { useLocale, useTranslations } from "next-intl";

export type SpotlightPromotionSummaryProps = {
  type: "spotlight-promotion";
  postCaption: string | null;
  summaryLabel: string;
  estimatedReachLow: number;
  estimatedReachHigh: number;
  totalAmount: number;
  currency: string;
};

type OrderSummaryProps = {
  orderSummary:
    | PlacePromotionSummaryProps
    | EventPromotionSummaryProps
    | SpotlightPromotionSummaryProps;
  checkoutId: string;
};

/**
 * Standalone-purchase checkout summary, shared by Featured Places promotions
 * and Event promotions — both are a single purchase with no basket/selection
 * concept, unlike ticket checkouts (which moved to
 * PendingCheckoutsBasket/TicketCheckoutSessionCard).
 */
export default function OrderSummary({ orderSummary }: OrderSummaryProps) {
  const locale = useLocale();
  const t = useTranslations("common");
  const tc = useTranslations("core");

  if (orderSummary.type === "spotlight-promotion") {
    const { postCaption, summaryLabel, totalAmount, currency } = orderSummary;

    return (
      <div className="border border-border rounded-2xl shadow-lg p-6 space-y-4 bg-card text-card-foreground">
        <h2 className="font-semibold text-lg text-card-foreground">
          {t("spotlightPromotion")}
        </h2>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium">{t("post")}</p>
          <p className="text-card-foreground font-semibold line-clamp-2">
            {postCaption?.trim() || t("untitledSpotlight")}
          </p>
        </div>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium">{t("budget")}</p>
          <p className="text-card-foreground font-semibold">{summaryLabel}</p>
        </div>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium">{t("estimatedReach")}</p>
          <p className="text-card-foreground font-semibold">
            {formatReachRange(tc, {
              reachLow: orderSummary.estimatedReachLow,
              reachHigh: orderSummary.estimatedReachHigh,
            })}
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("itIsShownWithASponsored", {
            estimateNote: tc(PROMOTION_ESTIMATE_NOTE_KEY),
            reviewNote: tc(PROMOTION_REVIEW_NOTE_KEY),
          })}
        </p>

        <div className="flex justify-between pt-2 border-t border-border font-bold text-card-foreground">
          <p>{t("totalAmount")}</p>
          <p>{formatMoney(currency, totalAmount, { locale })}</p>
        </div>
      </div>
    );
  }

  if (orderSummary.type === "promotion") {
    const { placeName, tierLabel, totalAmount, currency } = orderSummary;

    return (
      <div className="border border-border rounded-2xl shadow-lg p-6 space-y-4 bg-card text-card-foreground">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold text-lg text-card-foreground">
            {t("promotionSummary")}
          </h2>
        </div>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium">{t("place")}</p>
          <p className="text-card-foreground font-semibold">{placeName}</p>
        </div>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium">{t("duration")}</p>
          <p className="text-card-foreground font-semibold">{tierLabel}</p>
        </div>

        <div className="flex justify-between pt-2 border-t border-border font-bold text-card-foreground">
          <p>{t("totalAmount")}</p>
          <p>{formatMoney(currency, totalAmount, { locale })}</p>
        </div>
      </div>
    );
  }

  const { eventTitle, tierLabel, totalAmount, currency } = orderSummary;

  return (
    <div className="border border-border rounded-2xl shadow-lg p-6 space-y-4 bg-card text-card-foreground">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-lg text-card-foreground">
          {t("promotionSummary")}
        </h2>
      </div>

      <div className="text-sm text-muted-foreground">
        <p className="font-medium">{t("event")}</p>
        <p className="text-card-foreground font-semibold">{eventTitle}</p>
      </div>

      <div className="text-sm text-muted-foreground">
        <p className="font-medium">{t("duration")}</p>
        <p className="text-card-foreground font-semibold">{tierLabel}</p>
      </div>

      <div className="flex justify-between pt-2 border-t border-border font-bold text-card-foreground">
        <p>{t("totalAmount")}</p>
        <p>{formatMoney(currency, totalAmount, { locale })}</p>
      </div>
    </div>
  );
}
