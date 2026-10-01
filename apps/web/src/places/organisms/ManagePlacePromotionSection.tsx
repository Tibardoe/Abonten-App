"use client";

import insertPlacePromotionCheckout from "@/actions/insertPlacePromotionCheckout";
import { useToast } from "@/hooks/useToast";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { formatMoney } from "@abonten/core/formatMoney";
import type { PlacePromotionTier } from "@abonten/types/placeType";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IoMegaphoneOutline } from "react-icons/io5";

type CurrentPromotion = {
  ends_at: string;
  tier_label: string | null;
};

type ManagePlacePromotionSectionProps = {
  placeId: string;
  tiers: PlacePromotionTier[];
  currentPromotion: CurrentPromotion | null;
};

// Owner-facing "Feature this Place" tab (Places Phase 2, Milestone 5). Tiers
// are fetched server-side by the manage page (getPlacePromotionTiers.ts) and
// passed down as a prop, same convention ManagePlaceInsightsSection.tsx's
// `insights` prop uses -- this page already fetches everything else up
// front. This component only owns the interactive part: picking a tier and
// starting a checkout.
export default function ManagePlacePromotionSection({
  placeId,
  tiers,
  currentPromotion,
}: ManagePlacePromotionSectionProps) {
  const locale = useLocale();

  const t = useTranslations("places");

  const router = useRouter();
  const [selectedTierId, setSelectedTierId] = useState<number | null>(
    tiers[0]?.id ?? null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();

  const handlePromote = async () => {
    if (!selectedTierId) return;

    setIsSubmitting(true);
    try {
      const response = await insertPlacePromotionCheckout(
        placeId,
        selectedTierId,
      );

      if (response.status !== 200 || !response.data) {
        toast.error(response.message ?? t("somethingWentWrong"));
        return;
      }

      router.push(`/checkout/${response.data.id}?type=promotion`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (currentPromotion) {
    return (
      <div className="rounded-2xl border border-primary/40 bg-primary/10 p-6 space-y-2">
        <div className="flex items-center gap-2 text-primary font-semibold">
          <IoMegaphoneOutline className="text-lg" />
          <p>{t("thisPlaceIsCurrentlyFeatured")}</p>
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
        <h2 className="font-semibold text-lg">{t("featureThisPlace")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("getAPaidRandomlyRotatedSlot")}
        </p>
      </div>

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
        {isSubmitting ? t("starting") : t("featureThisPlace2")}
      </button>
    </div>
  );
}
