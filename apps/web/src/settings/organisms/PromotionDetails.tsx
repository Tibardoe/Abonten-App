import { getUserActivePromotions } from "@/actions/getUserActivePromotions";
import MaskIcon from "@/components/atoms/MaskIcon";
import DetailsContainer from "@/settings/atoms/DetailsContainer";
import { formatDateWithSuffix } from "@/utils/dateFormatter";
import Link from "next/link";

// Replaces the old Plan Details block (removed with the Membership/Plans
// product). Promotion belongs to a specific Event or Place, not the user
// (see ManageEventPromotionSection.tsx / ManagePlacePromotionSection.tsx for
// the actual purchase flow) — this only summarizes currently-active
// promotions across everything the signed-in user owns. Shared by /settings
// and /settings/overview so the content isn't duplicated the way the old
// Plan Details block was (it existed identically in three files).
export default async function PromotionDetails() {
  const promotions = await getUserActivePromotions();
  const activePromotions =
    promotions.status === 200 ? (promotions.data ?? []) : [];

  return (
    <div className="space-y-2">
      <h1>Promotion Details</h1>
      <DetailsContainer>
        {activePromotions.length > 0 ? (
          <div className="space-y-4">
            {activePromotions.map((promotion, index) => (
              <div key={`${promotion.resourceType}-${promotion.resourceId}`}>
                {index > 0 && <hr className="mb-4" />}
                <p className="text-sm text-muted-foreground">
                  {promotion.resourceType === "event"
                    ? "Featured Event"
                    : "Featured Place"}
                </p>
                <h2 className="font-medium text-lg md:text-xl">
                  {promotion.resourceName}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {promotion.tierLabel
                    ? `${promotion.tierLabel} package`
                    : "Active"}{" "}
                  &middot; Expires {formatDateWithSuffix(promotion.endsAt)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <h2 className="font-medium text-lg md:text-xl">
                No active promotions
              </h2>
              <p>Feature an event or place to reach more people.</p>
            </div>

            <hr />

            <div className="flex justify-between items-center">
              <p className="font-medium">Manage Events</p>
              <Link href="/manage/events">
                <MaskIcon
                  src="/assets/images/arrowRight.svg"
                  alt="Arrow right"
                  className="w-6 h-6 md:w-8 md:h-8"
                />
              </Link>
            </div>

            <hr />

            <div className="flex justify-between items-center">
              <p className="font-medium">Manage Places</p>
              <Link href="/manage/places">
                <MaskIcon
                  src="/assets/images/arrowRight.svg"
                  alt="Arrow right"
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
