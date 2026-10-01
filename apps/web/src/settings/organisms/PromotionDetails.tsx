import { getUserActivePromotions } from "@/actions/getUserActivePromotions";
import MaskIcon from "@/components/atoms/MaskIcon";
import DetailsContainer from "@/settings/atoms/DetailsContainer";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import {
  promotionKindLabel,
  promotionStatusLine,
} from "@abonten/core/promotionSummary";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

// Replaces the old Plan Details block (removed with the Membership/Plans
// product). Promotion belongs to a specific Event or Place, not the user
// (see ManageEventPromotionSection.tsx / ManagePlacePromotionSection.tsx for
// the actual purchase flow) — this only summarizes currently-active
// promotions across everything the signed-in user owns. Shared by /settings
// and /settings/overview so the content isn't duplicated the way the old
// Plan Details block was (it existed identically in three files).
export default async function PromotionDetails() {
  const locale = await getLocale();

  const t = await getTranslations("settings");
  const tc = await getTranslations("core");

  const promotions = await getUserActivePromotions();
  const activePromotions =
    promotions.status === 200 ? (promotions.data ?? []) : [];

  return (
    <div className="space-y-2">
      <h1>{t("promotionDetails")}</h1>
      <DetailsContainer>
        {activePromotions.length > 0 ? (
          <div className="space-y-4">
            {activePromotions.map((promotion, index) => (
              <div
                key={`${promotion.resourceType}-${promotion.campaignId ?? promotion.resourceId}`}
              >
                {index > 0 && <hr className="mb-4" />}
                <p className="text-sm text-muted-foreground">
                  {promotionKindLabel(tc, promotion.resourceType)}
                </p>
                <h2 className="font-medium text-lg md:text-xl">
                  {promotion.resourceName}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("text", {
                    promotionStatusLine: promotionStatusLine(tc, promotion),
                  })}
                  {promotion.state === "scheduled" ? t("starts") : t("ends")}{" "}
                  {formatDateWithSuffix(
                    promotion.state === "scheduled"
                      ? promotion.startsAt
                      : promotion.endsAt,
                    undefined,
                    locale,
                  )}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <h2 className="font-medium text-lg md:text-xl">
                {t("noActivePromotions")}
              </h2>
              <p>{t("featureAnEventOrPlaceTo")}</p>
            </div>

            <hr />

            <div className="flex justify-between items-center">
              <p className="font-medium">{t("manageEvents")}</p>
              <Link href="/manage/events">
                <MaskIcon
                  src="/assets/images/arrowRight.svg"
                  alt={t("arrowRight")}
                  className="w-6 h-6 md:w-8 md:h-8"
                />
              </Link>
            </div>

            <hr />

            <div className="flex justify-between items-center">
              <p className="font-medium">{t("managePlaces")}</p>
              <Link href="/manage/places">
                <MaskIcon
                  src="/assets/images/arrowRight.svg"
                  alt={t("arrowRight")}
                  className="w-6 h-6 md:w-8 md:h-8"
                />
              </Link>
            </div>
          </div>
        )}
      </DetailsContainer>
    </div>
  );
}
