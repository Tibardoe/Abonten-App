import UserAvatar from "@/components/atoms/UserAvatar";
import { Button } from "@/components/ui/button";
import type { userProfileDetailsType } from "@/types/userProfileType";
import Link from "next/link";
import SettingsButton from "../atoms/SettingsButton";

export default function ProfileDetails({ userData }: userProfileDetailsType) {
  const cloudinaryBaseUrl = "https://res.cloudinary.com/abonten/image/upload/";

  const defaultAvatar = "AnonymousProfile_rn6qez";

  const avatarUrl = userData?.avatar_public_id
    ? `${cloudinaryBaseUrl}v${userData.avatar_version}/${userData.avatar_public_id}.jpg`
    : defaultAvatar;

  const numberOfPosts = userData.event_id?.length || 0;

  const numberOfFavorites = userData.favorite_event_id?.length || 0;

  const numberOfRatings = userData.rating || 0;

  return (
    <>
      {/* On mobile */}
      <div className="md:hidden flex flex-col gap-7">
        <div className="flex w-full justify-between">
          <h2 className="font-bold">{userData?.username}</h2>

          <SettingsButton />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-7">
            <UserAvatar avatarUrl={avatarUrl} width={110} height={110} />

            <div className="grid grid-cols-3 gap-5 justify-start items-center">
              <h2 className="col-span-3">{userData?.username}</h2>

              <span>
                <h2>
                  <span className="font-bold">{numberOfPosts}</span> Posts
                </h2>
              </span>

              <span>
                <h2>
                  <span className="font-bold">{numberOfFavorites}</span>{" "}
                  Favorites
                </h2>
              </span>

              <span>
                <h2>
                  <span className="font-bold">{numberOfRatings}</span> Ratings
                </h2>
              </span>
            </div>
          </div>

          <div className="w-full">
            <p>It is working</p>
          </div>
        </div>

        <Button variant="outline" className="border-black border-2 font-bold">
          <Link href="/settings/edit-profile">Edit Profile</Link>
        </Button>
      </div>

      {/* On tablet and desktop */}
      <div className="hidden md:flex gap-10 items-start">
        {/* <div className="w-[100px] h-[100px] md:w-[150px] md:h-[150px] lg:w-[180px] lg:h-[180px] rounded-full grid place-items-center">
         
        </div> */}

        <UserAvatar avatarUrl={avatarUrl} width={150} height={150} />
        <div className="grid grid-cols-3 gap-3 justify-start items-center">
          <h2>{userData?.username}</h2>

          <Button variant="outline" className="border-black font-bold">
            <Link href="/settings/edit-profile">Edit Profile</Link>
          </Button>

          <SettingsButton />

          <span>
            <h2>
              <span className="font-bold">{numberOfPosts}</span> Posts
            </h2>
          </span>

          <span>
            <h2>
              <span className="font-bold">{numberOfFavorites}</span> Favorites
            </h2>
          </span>

          <span>
            <h2>
              <span className="font-bold">{numberOfRatings}</span> Ratings
            </h2>
          </span>

          <div>
            <p>It is working</p>
          </div>
        </div>
      </div>
    </>
  );
}
