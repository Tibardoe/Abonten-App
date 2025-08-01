import { getUserProfileDetails } from "@/actions/getUserProfileDetails";
import { getUserRating } from "@/actions/getUserRating";
import AddReviewButton from "@/components/atoms/AddReviewButton";
import UserAvatar from "@/components/atoms/UserAvatar";
import UserHighlights from "@/components/molecules/UserHighlights";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import SettingsButton from "../atoms/SettingsButton";
import Higlight from "../molecules/Highlight";
import UserAccountTabsNavigation from "../molecules/UserAccountTabsNavigation";

type LayoutUserProp = {
  username: string;
};

export default async function ProfileDetails({ username }: LayoutUserProp) {
  const userDetails = await getUserProfileDetails(username);

  const isCurrentUser = userDetails.ownUsername === username;

  const { data } = userDetails;

  const cloudinaryBaseUrl = "https://res.cloudinary.com/abonten/image/upload/";

  const defaultPublicId = "AnonymousProfile_rn6qez";

  const defaulfVersion = "1743533914";

  const avatarUrl = data?.avatar_public_id
    ? `${cloudinaryBaseUrl}v${data.avatar_version}/${data.avatar_public_id}.jpg`
    : `${cloudinaryBaseUrl}v${defaulfVersion}/${defaultPublicId}.jpg`;

  const averageRating = await getUserRating(userDetails.data.user_id);

  return (
    <>
      {/* On mobile */}
      <div className="md:hidden flex flex-col gap-7">
        <div className="flex w-full justify-between">
          <h2 className="font-bold">{data?.username}</h2>

          {isCurrentUser ? (
            <SettingsButton />
          ) : (
            <AddReviewButton username={username} />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-4">
            <UserAvatar avatarUrl={avatarUrl} width={110} height={110} />

            <div className="flex flex-col justify-start w-full gap-2">
              <h2>{data?.full_name}</h2>

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
          <Button variant="outline" className="border-black border-2 font-bold">
            <Link href="/settings/edit-profile">Edit Profile</Link>
          </Button>
        )}

        <div className="flex flex-col gap-3">
          <h2 className="font-semibold">Highlights</h2>

          <div className="flex items-center gap-2 overflow-hidden">
            {isCurrentUser && <Higlight />}

            <UserHighlights avatarUrl={avatarUrl} username={username} />
          </div>
        </div>

        <UserAccountTabsNavigation ownUsername={userDetails.ownUsername} />
      </div>

      {/* On tablet and desktop */}
      <div className="hidden md:flex flex-col gap-7">
        <div className="hidden md:flex gap-10 items-start w-[50%]">
          <UserAvatar avatarUrl={avatarUrl} width={150} height={150} />
          <div className="grid grid-cols-3 gap-3 justify-start items-center">
            <h2>{data?.username}</h2>

            {isCurrentUser && (
              <Button variant="outline" className="border-black font-bold">
                <Link href="/settings/edit-profile">Edit Profile</Link>
              </Button>
            )}

            {isCurrentUser ? (
              <SettingsButton />
            ) : (
              <div className="col-span-2 font-bold">
                <AddReviewButton username={username} />
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
            {isCurrentUser && <Higlight />}

            <UserHighlights avatarUrl={avatarUrl} username={username} />
          </div>
        </div>

        <UserAccountTabsNavigation ownUsername={userDetails.ownUsername} />
      </div>
    </>
  );
}
