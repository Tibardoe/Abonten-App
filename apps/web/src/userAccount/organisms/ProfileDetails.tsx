import { getUserProfileDetails } from "@/actions/getUserProfileDetails";
import { getUserRating } from "@/actions/getUserRating";
import AddReviewButton from "@/components/atoms/AddReviewButton";
import ReportButton from "@/components/atoms/ReportButton";
import ViewableAvatar from "@/components/molecules/ViewableAvatar";
import { buildAvatarUrl } from "@abonten/core/cloudinaryUrl";
import Link from "next/link";
import { MdOutlineSettings } from "react-icons/md";
import ProfileFollowerCount from "../molecules/ProfileFollowerCount";
import ProfileHighlightsSection from "../molecules/ProfileHighlightsSection";
import UserAccountTabsNavigation from "../molecules/UserAccountTabsNavigation";

import { getOrganizerVerified } from "@/actions/verification/getOrganizerVerified";
import SubscribeBell from "@/discovery/molecules/SubscribeBell";
import FollowButton from "@/spotlight/molecules/FollowButton";
import VerifiedBadgePopover from "@/verification/molecules/VerifiedBadgePopover";
import { getTranslations } from "next-intl/server";
type LayoutUserProp = {
  username: string;
  userDetails?: Awaited<ReturnType<typeof getUserProfileDetails>>;
};

// The header of a public profile: one layout for every screen size (it
// used to be two copies, one per breakpoint, that had drifted apart). Name
// first, then the handle, bio, a stats row and the actions: Follow for a
// visitor, Edit profile for the owner.
export default async function ProfileDetails({
  username,
  userDetails: prefetchedUserDetails,
}: LayoutUserProp) {
  const t = await getTranslations("account");

  const userDetails =
    prefetchedUserDetails ?? (await getUserProfileDetails(username));

  if (userDetails.status !== 200 || userDetails.data.user_id === null) {
    return (
      <p className="text-destructive">
        {userDetails.status === 200
          ? t("profileNotFound")
          : userDetails.message}
      </p>
    );
  }

  const isCurrentUser = userDetails.ownUsername === username;

  const { data } = userDetails;
  const userId = userDetails.data.user_id;
  const handle = data.username ?? username;
  const displayName = data.full_name?.trim() || `@${handle}`;

  const avatarUrl = buildAvatarUrl(data.avatar_public_id, data.avatar_version, {
    width: 112,
    height: 112,
  });

  // Larger, aspect-ratio-preserving transform (no `height`, so Cloudinary
  // uses c_limit rather than the cropped c_fill above) for the full-image
  // viewer — avoids both re-fetching the tiny avatar thumbnail and
  // downloading the raw original.
  const fullAvatarUrl = buildAvatarUrl(
    data.avatar_public_id,
    data.avatar_version,
    { width: 1080 },
  );

  const hasCustomAvatar = !!data.avatar_public_id;

  const avatarAlt = isCurrentUser
    ? t("viewYourProfilePicture")
    : t("viewSProfilePicture", { handle: handle });

  const [rating, organizerVerifiedRes] = await Promise.all([
    getUserRating(userId),
    getOrganizerVerified(userId),
  ]);
  const organizerVerified = organizerVerifiedRes.data.verified;
  const events = Number(data.total_posts ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
        <ViewableAvatar
          avatarUrl={avatarUrl}
          fullImageUrl={fullAvatarUrl}
          width={112}
          height={112}
          alt={avatarAlt}
          viewable={hasCustomAvatar}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="truncate text-2xl font-bold md:text-3xl">
                {displayName}
              </h1>
              {organizerVerified ? (
                <VerifiedBadgePopover subjectType="organizer" compact />
              ) : null}
            </div>
            {data.full_name?.trim() ? (
              <p className="text-muted-foreground">@{handle}</p>
            ) : null}
          </div>

          {data.bio ? (
            <p className="max-w-prose whitespace-pre-line text-sm md:text-base">
              {data.bio}
            </p>
          ) : null}

          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground [&_dd]:text-foreground/80">
            <ProfileFollowerCount userId={userId} />

            <div>
              <dt className="sr-only">{t("events")}</dt>
              <dd>
                {t.rich("eventsCount", {
                  count: events,
                  strong: (chunks) => (
                    <span className="font-semibold tabular-nums text-foreground">
                      {chunks}
                    </span>
                  ),
                })}
              </dd>
            </div>

            <div>
              <dt className="sr-only">{t("rating")}</dt>
              <dd>
                {rating.totalRatings > 0 ? (
                  <>
                    <span className="text-warning">★</span>{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {rating.averageRating.toFixed(1)}
                    </span>{" "}
                    · {t("reviewsCount", { count: rating.totalRatings })}
                  </>
                ) : (
                  t("noReviewsYet")
                )}
              </dd>
            </div>

            {isCurrentUser ? (
              <div>
                <dt className="sr-only">{t("saved")}</dt>
                <dd>
                  {t.rich("savedCount", {
                    count: Number(data.total_favorites ?? 0),
                    strong: (chunks) => (
                      <span className="font-semibold tabular-nums text-foreground">
                        {chunks}
                      </span>
                    ),
                  })}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {isCurrentUser ? (
              <>
                <Link
                  href="/settings/edit-profile"
                  className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {t("editProfile")}
                </Link>
                <Link
                  href="/settings"
                  aria-label={t("settings")}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border transition-colors hover:bg-accent"
                >
                  <MdOutlineSettings className="text-xl text-muted-foreground" />
                </Link>
              </>
            ) : (
              <>
                <FollowButton
                  kind="organizer"
                  targetId={userId}
                  ownerId={userId}
                  label={`@${handle}`}
                  className="h-9 px-4"
                />
                {events > 0 ? (
                  <SubscribeBell
                    kind="organizer"
                    targetId={userId}
                    ownerId={userId}
                    label={`@${handle}`}
                  />
                ) : null}
                <AddReviewButton username={username} />
                <ReportButton
                  targetType="user"
                  targetId={userId}
                  targetLabel={handle}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                />
              </>
            )}
          </div>
        </div>
      </div>

      <ProfileHighlightsSection
        username={username}
        avatarUrl={avatarUrl}
        isOwner={isCurrentUser}
      />

      <UserAccountTabsNavigation ownUsername={userDetails.ownUsername ?? ""} />
    </div>
  );
}
