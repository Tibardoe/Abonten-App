import { getUserProfileDetails } from "@/actions/getUserProfileDetails";
import { getUserRating } from "@/actions/getUserRating";
import AddReviewButton from "@/components/atoms/AddReviewButton";
import ReportButton from "@/components/atoms/ReportButton";
import UserHighlights from "@/components/molecules/UserHighlights";
import ViewableAvatar from "@/components/molecules/ViewableAvatar";
import { Button } from "@/components/ui/button";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import Link from "next/link";
import SettingsButton from "../atoms/SettingsButton";
import Higlight from "../molecules/Highlight";
import UserAccountTabsNavigation from "../molecules/UserAccountTabsNavigation";

type LayoutUserProp = {
  username: string;
  userDetails?: Awaited<ReturnType<typeof getUserProfileDetails>>;
};

export default async function ProfileDetails({
  username,
  userDetails: prefetchedUserDetails,
}: LayoutUserProp) {
  const userDetails =
    prefetchedUserDetails ?? (await getUserProfileDetails(username));

  if (userDetails.status !== 200 || userDetails.data.user_id === null) {
    return (
      <p className="text-destructive">
        {userDetails.status === 200 ? "Profile not found" : userDetails.message}
      </p>
    );
  }

  const isCurrentUser = userDetails.ownUsername === username;

  const { data } = userDetails;

  const defaultPublicId = "AnonymousProfile_rn6qez";

  const defaulfVersion = "1743533914";

  const avatarUrl = data?.avatar_public_id
    ? buildCloudinaryUrl(data.avatar_public_id, data.avatar_version, {
        width: 150,
        height: 150,
      })
    : buildCloudinaryUrl(defaultPublicId, defaulfVersion, {
        width: 150,
        height: 150,
      });

  // Larger, aspect-ratio-preserving transform (no `height`, so Cloudinary
  // uses c_limit rather than the cropped c_fill above) for the full-image
  // viewer — avoids both re-fetching the tiny avatar thumbnail and
  // downloading the raw original.
  const fullAvatarUrl = data?.avatar_public_id
    ? buildCloudinaryUrl(data.avatar_public_id, data.avatar_version, {
        width: 1080,
      })
    : buildCloudinaryUrl(defaultPublicId, defaulfVersion, { width: 1080 });

  const hasCustomAvatar = !!data?.avatar_public_id;

  const avatarAlt = isCurrentUser
    ? "View your profile picture"
    : `View ${data?.username}'s profile picture`;

  const averageRating = await getUserRating(userDetails.data.user_id);

  return (
    <>
      {/* On mobile */}
      <div className="md:hidden flex flex-col gap-7">
        <div className="flex w-full justify-between">
          <h2 className="font-medium">{data?.username}</h2>

          {isCurrentUser ? (
            <div className="flex items-center gap-3">
              <SettingsButton />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <AddReviewButton username={username} />
              <ReportButton
                targetType="user"
                targetId={userDetails.data.user_id}
                targetLabel={data?.username ?? username}
              />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-4">
            <ViewableAvatar
              avatarUrl={avatarUrl}
              fullImageUrl={fullAvatarUrl}
              width={110}
              height={110}
              alt={avatarAlt}
              viewable={hasCustomAvatar}
            />

            <div className="flex flex-col justify-start w-full gap-2">
              <h2 className="font-medium">{data?.full_name}</h2>

              <div className="flex justify-between">
                <span>
                  <h2>
                    <span className="font-bold">{data.total_posts}</span> Posts
                  </h2>
                </span>

                <span>
                  <h2>
                    <span className="font-bold">{data.total_favorites}</span>{" "}
                    Favorites
                  </h2>
                </span>

                <span>
                  <h2>
                    <span className="font-bold">
                      {averageRating.averageRating}
                    </span>{" "}
                    Ratings
                  </h2>
                </span>
              </div>
            </div>
          </div>

          <div className="w-full">
            <p>{userDetails.data.bio}</p>
          </div>
        </div>

        {isCurrentUser && (
          <Button className="hover:bg-primary/90 font-medium">
            <Link href="/settings/edit-profile">Edit Profile</Link>
          </Button>
        )}

        <div className="flex flex-col gap-3">
          <h2 className="font-semibold">Highlights</h2>

          <div className="flex items-center gap-2 overflow-hidden">
            {isCurrentUser && <Higlight username={username} />}

            <UserHighlights
              avatarUrl={avatarUrl}
              username={username}
              isOwner={isCurrentUser}
            />
          </div>
        </div>

        <UserAccountTabsNavigation
          ownUsername={userDetails.ownUsername ?? ""}
        />
      </div>

      {/* On tablet and desktop */}
      <div className="hidden md:flex flex-col gap-7">
        <div className="hidden md:flex gap-10 items-start w-[50%]">
          <ViewableAvatar
            avatarUrl={avatarUrl}
            fullImageUrl={fullAvatarUrl}
            width={150}
            height={150}
            alt={avatarAlt}
            viewable={hasCustomAvatar}
          />
          <div className="grid grid-cols-3 gap-3 justify-start items-center">
            <h2 className="font-medium">{data?.username}</h2>

            {isCurrentUser && (
              <Button className="font-medium hover:bg-primary/90">
                <Link href="/settings/edit-profile">Edit Profile</Link>
              </Button>
            )}

            {isCurrentUser ? (
              <div className="flex items-center gap-3">
                <SettingsButton />
              </div>
            ) : (
              <div className="col-span-2 flex items-center gap-3 font-bold">
                <AddReviewButton username={username} />
                <ReportButton
                  targetType="user"
                  targetId={userDetails.data.user_id}
                  targetLabel={data?.username ?? username}
                />
              </div>
            )}

            <span>
              <h2>
                <span className="font-bold">{data.total_posts}</span> Posts
              </h2>
            </span>

            <span>
              <h2>
                <span className="font-bold">{data.total_favorites}</span>{" "}
                Favorites
              </h2>
            </span>

            <span>
              <h2>
                <span className="font-bold">{averageRating.averageRating}</span>{" "}
                Ratings
              </h2>
            </span>

            <div className="col-span-3">
              <p>{userDetails.data.bio}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="font-semibold">Highlights</h2>

          <div className="flex items-center gap-2">
            {isCurrentUser && <Higlight username={username} />}

            <UserHighlights
              avatarUrl={avatarUrl}
              username={username}
              isOwner={isCurrentUser}
            />
          </div>
        </div>

        <UserAccountTabsNavigation
          ownUsername={userDetails.ownUsername ?? ""}
        />
      </div>
    </>
  );
}
