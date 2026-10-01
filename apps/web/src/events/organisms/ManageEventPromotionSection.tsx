"use client";

import insertEventPromotionCheckout from "@/actions/insertEventPromotionCheckout";
import { useToast } from "@/hooks/useToast";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import type { EventStatus } from "@abonten/core/eventStatus";
import { formatMoney } from "@abonten/core/formatMoney";
import type { EventPromotionTier } from "@abonten/types/postsType";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IoMegaphoneOutline } from "react-icons/io5";

type CurrentPromotion = {
  ends_at: string;
  tier_label: string | null;
};

type ManageEventPromotionSectionProps = {
  eventId: string;
  tiers: EventPromotionTier[];
  currentPromotion: CurrentPromotion | null;
  eventStatus?: string;
  derivedStatus: EventStatus | null;
  soldOut: boolean;
};

// Owner-facing "Feature this Event" tab — direct mirror of
// ManagePlacePromotionSection.tsx (same tier-picker-then-checkout flow), with
// one addition Places didn't need: an event can become permanently
// ineligible (cancelled/completed/ended/sold out — Part 18 of the Unified
// Event Management spec), so purchasing a new promotion is blocked with an
// explanation in those states instead of silently letting an organizer pay
// for a promotion that can never show.
export default function ManageEventPromotionSection({
  eventId,
  tiers,
  currentPromotion,
  eventStatus,
  derivedStatus,
  soldOut,
}: ManageEventPromotionSectionProps) {
  const locale = useLocale();

  const t = useTranslations("events");

  const router = useRouter();
  const [selectedTierId, setSelectedTierId] = useState<number | null>(
    tiers[0]?.id ?? null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();

  const ineligibleReason =
    eventStatus === "canceled"
      ? t("thisEventWasCancelledAndCan")
      : eventStatus === "completed" || derivedStatus === "ended"
        ? t("thisEventHasAlreadyEndedAnd")
        : soldOut
          ? t("thisEventIsSoldOutAnd")
          : null;

  const handlePromote = async () => {
    if (!selectedTierId) return;

    setIsSubmitting(true);
    try {
      const response = await insertEventPromotionCheckout(
        eventId,
        selectedTierId,
      );

      if (response.status !== 200 || !response.data) {
        toast.error(response.message ?? t("somethingWentWrong"));
        return;
      }

      router.push(`/checkout/${response.data.id}?type=event-promotion`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (currentPromotion) {
    return (
      <div className="rounded-2xl border border-primary/40 bg-primary/10 p-6 space-y-2">
        <div className="flex items-center gap-2 text-primary font-semibold">
          <IoMegaphoneOutline className="text-lg" />
          <p>{t("thisEventIsCurrentlyFeatured")}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {currentPromotion.tier_label
            ? t("placementActive", { tier_label: currentPromotion.tier_label })
            : t("active")}
          {t("until")}
          <span className="font-medium text-foreground">
            {formatDateWithSuffix(currentPromotion.ends_at, undefined, locale)}
          </span>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-lg">{t("featureThisEvent")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("getAPaidRandomlyRotatedSlot")}
        </p>
      </div>

      {ineligibleReason ? (
        <p className="text-sm text-muted-foreground rounded-xl border border-border p-4">
          {ineligibleReason}
        </p>
      ) : (
        <>
          {tiers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noPromotionTiersAreAvailableRight")}
            </p>
          ) : (
            <div className="space-y-2">
              {tiers.map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setSelectedTierId(tier.id)}
                  className={`w-full flex items-center justify-between gap-3 rounded-xl border p-4 text-left transition-colors ${
                    selectedTierId === tier.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <span className="font-medium">{tier.duration_label}</span>
                  <span className="text-sm text-muted-foreground">
                    {formatMoney(tier.currency, tier.price)}
                  </span>
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            disabled={!selectedTierId || isSubmitting || tiers.length === 0}
            onClick={handlePromote}
            className="w-full rounded-md p-4 font-bold text-primary-foreground bg-primary text-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? t("starting") : t("featureThisEvent2")}
          </button>
        </>
      )}
    </div>
  );
}
