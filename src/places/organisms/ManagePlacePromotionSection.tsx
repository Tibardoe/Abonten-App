"use client";

import insertPlacePromotionCheckout from "@/actions/insertPlacePromotionCheckout";
import Notification from "@/components/atoms/Notification";
import type { PlacePromotionTier } from "@/types/placeType";
import { formatDateWithSuffix } from "@/utils/dateFormatter";
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
  const router = useRouter();
  const [selectedTierId, setSelectedTierId] = useState<number | null>(
    tiers[0]?.id ?? null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const handlePromote = async () => {
    if (!selectedTierId) return;

    setIsSubmitting(true);
    try {
      const response = await insertPlacePromotionCheckout(
        placeId,
        selectedTierId,
      );

      if (response.status !== 200 || !response.data) {
        setNotification(response.message ?? "Something went wrong!");
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
          <p>This place is currently featured</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {currentPromotion.tier_label
            ? `${currentPromotion.tier_label} placement, active`
            : "Active"}{" "}
          until{" "}
          <span className="font-medium text-foreground">
            {formatDateWithSuffix(currentPromotion.ends_at)}
          </span>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-lg">Feature this Place</h2>
        <p className="text-sm text-muted-foreground">
          Get a paid, randomly-rotated slot in the Featured Places section on
          the Explore page, clearly labeled "Sponsored".
        </p>
      </div>

      {tiers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No promotion tiers are available right now.
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
                {tier.currency} {tier.price.toFixed(2)}
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
        {isSubmitting ? "Starting…" : "Feature this place"}
      </button>

      {notification && <Notification notification={notification} />}
    </div>
  );
}
